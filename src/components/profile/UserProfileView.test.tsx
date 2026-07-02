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
});
