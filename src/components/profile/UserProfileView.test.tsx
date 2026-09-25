import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserProfileView } from "@/components/profile/UserProfileView";
import type { UserProfile } from "@/types/models";

const authState = vi.hoisted(() => ({
  currentUser: null as UserProfile | null,
  updateProfile: vi.fn(),
}));

const collectionState = vi.hoisted(() => ({
  dataByCollection: new Map<string, unknown[]>(),
}));
const profileActions = vi.hoisted(() => ({ setUserBlocked: vi.fn(), reportUserProfile: vi.fn() }));

vi.mock("@/features/profile/profileService", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/profile/profileService")>(),
  setUserBlocked: profileActions.setUserBlocked,
  reportUserProfile: profileActions.reportUserProfile,
}));

vi.mock("@/features/messages/ShareToMessageDialog", () => ({
  ShareToMessageDialog: ({ title, url }: { title: string; url: string }) => <div role="dialog" aria-label="Share">{title} {url}</div>,
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: authState.currentUser,
    authReady: true,
    isDemoMode: false,
    updateProfile: authState.updateProfile,
  }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionState.dataByCollection.get(collectionName) ?? [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("react-chartjs-2", () => ({
  Bar: () => null,
  Radar: () => null,
}));

const preferences = {
  notifications: {
    speechFeedback: true,
    debateTurnReminders: true,
    communityReplies: true,
    tournamentReminders: true,
  },
  debateDefaults: {
    preferredFormat: "Public Forum" as const,
    preferredSide: "Either" as const,
    asyncResponseCadence: "24 hours" as const,
  },
  messaging: {
    whoCanMessage: "everyone" as const,
  },
};

const demoUser: UserProfile = {
  id: "demo-user",
  username: "maya_r",
  displayName: "Maya Rivera",
  email: "maya@example.com",
  role: "student",
  bio: "Public Forum debater.",
  focusAreas: [],
  organizationTags: [],
  recommendationSlots: [],
  preferences,
  followersCount: 0,
  followingCount: 0,
  activeChannelIds: [],
  createdAt: "2026-03-20T09:00:00.000Z",
};

describe("UserProfileView", () => {
  beforeEach(() => {
    authState.currentUser = demoUser;
    authState.updateProfile.mockReset();
    authState.updateProfile.mockResolvedValue(undefined);
    collectionState.dataByCollection.clear();
    collectionState.dataByCollection.set("users", [demoUser]);
    profileActions.setUserBlocked.mockReset().mockResolvedValue(undefined);
    profileActions.reportUserProfile.mockReset().mockResolvedValue(true);
  });

  it("renders a user profile when Firestore has partial stats data", () => {
    collectionState.dataByCollection.set("userStats", [
      {
        id: "stats-demo-user",
        userId: "demo-user",
        wins: 3,
      },
    ]);

    render(
      <MemoryRouter>
        <UserProfileView userId="demo-user" isOwnProfile={false} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /maya rivera/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("lets the signed-in user update their display name and bio", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UserProfileView userId="demo-user" isOwnProfile />
      </MemoryRouter>,
    );

    const displayNameInput = screen.getByLabelText(/display name/i);
    expect(displayNameInput).toHaveAttribute("maxlength", "30");

    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Maya Park");
    await user.clear(screen.getByLabelText(/^bio$/i));
    await user.type(screen.getByLabelText(/^bio$/i), "Updated bio.");
    await user.click(screen.getByRole("button", { name: /save profile details/i }));

    expect(authState.updateProfile).toHaveBeenCalledWith({
      displayName: "Maya Park",
      bio: "Updated bio.",
    });
  });

  it("shows how many followers and follows the profile has", () => {
    collectionState.dataByCollection.set("follows", [
      { id: "f1", followerId: "james", followingId: "maya", createdAt: "" },
      { id: "f2", followerId: "mia", followingId: "maya", createdAt: "" },
      { id: "f3", followerId: "maya", followingId: "james", createdAt: "" },
    ]);

    render(
      <MemoryRouter>
        <UserProfileView userId="maya" isOwnProfile />
      </MemoryRouter>,
    );

    // The count and its label are separate nodes, so assert on the container.
    const counts = document.querySelector(".profile-follow-counts");
    expect(counts?.textContent).toContain("2 followers");
    expect(counts?.textContent).toContain("1 following");
  });

  it("links authored posts from Activity to the actual community post", async () => {
    collectionState.dataByCollection.set("posts", [{ id: "post-42", authorId: "demo-user", title: "Tournament recap", category: "All Posts", replyCount: 0 }]);
    render(<MemoryRouter><UserProfileView userId="demo-user" isOwnProfile /></MemoryRouter>);
    await userEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByRole("link", { name: /Tournament recap/ })).toHaveAttribute("href", "/app/community?post=post-42");
  });

  it("shows only synced events, not sync controls, on someone else's Tabroom tab", async () => {
    collectionState.dataByCollection.set("users", [demoUser, { ...demoUser, id: "other", showTabroomHistory: true }]);
    render(<MemoryRouter><UserProfileView userId="other" isOwnProfile={false} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("tab", { name: "Tabroom" }));
    expect(screen.getByRole("heading", { name: "Synced events" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tabroom sync" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link Tabroom" })).not.toBeInTheDocument();
  });

  it("shares, reports, and blocks another profile from its actions menu", async () => {
    collectionState.dataByCollection.set("users", [demoUser, { ...demoUser, id: "other", displayName: "Taylor Kim" }]);
    const user = userEvent.setup();
    render(<MemoryRouter><UserProfileView userId="other" isOwnProfile={false} /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Actions for Taylor Kim" }));
    expect(screen.getByRole("button", { name: "Actions for Taylor Kim" }).closest(".profile-overview-card")).toHaveClass("has-open-menu");
    await user.click(screen.getByRole("button", { name: "Share profile" }));
    expect(screen.getByRole("dialog", { name: "Share" })).toHaveTextContent("/app/users/other");

    await user.click(screen.getByRole("button", { name: "Actions for Taylor Kim" }));
    await user.click(screen.getByRole("button", { name: "Report" }));
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(profileActions.reportUserProfile).toHaveBeenCalledWith("demo-user", "other", "Harassment", "");

    await user.click(screen.getByRole("button", { name: "Actions for Taylor Kim" }));
    await user.click(screen.getByRole("button", { name: "Block" }));
    expect(screen.getByRole("dialog", { name: "Block Taylor Kim?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Block account" }));
    expect(profileActions.setUserBlocked).toHaveBeenCalledWith("demo-user", "other", true);
  });
});
