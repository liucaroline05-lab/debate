import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { SettingsPage } from "@/pages/app/SettingsPage";
import type { UserProfile } from "@/types/models";

const mocks = vi.hoisted(() => ({ updateProfile: vi.fn(), setUserBlocked: vi.fn() }));

vi.mock("@/features/profile/profileService", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/profile/profileService")>(),
  setUserBlocked: mocks.setUserBlocked,
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionName === "userBlocks"
      ? [{ id: "maya-other", blockerId: "maya", blockedId: "other", createdAt: "2026-09-01" }]
      : collectionName === "users" ? [{ id: "other", displayName: "Taylor Kim" }] : [],
    isLoading: false,
    error: null,
  }),
}));

const profile: UserProfile = {
  id: "maya",
  displayName: "Maya Rivera",
  email: "maya@example.com",
  role: "student",
  bio: "Public Forum debater",
  focusAreas: [],
  organizationTags: [],
  recommendationSlots: [],
  preferences: {
    notifications: {
      speechFeedback: true,
      debateTurnReminders: true,
      communityReplies: true,
      tournamentReminders: true,
    },
    debateDefaults: {
      preferredFormat: "Public Forum",
      preferredSide: "Either",
      asyncResponseCadence: "24 hours",
    },
    messaging: { whoCanMessage: "everyone" },
  },
  createdAt: "2026-08-01T10:00:00.000Z",
};

let currentUser = profile;

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser,
    isDemoMode: false,
    updateProfile: mocks.updateProfile,
  }),
}));

describe("SettingsPage messaging privacy", () => {
  it("saves a people-I-follow restriction", async () => {
    mocks.updateProfile.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("radio", { name: /People I follow/ }));

    expect(mocks.updateProfile).toHaveBeenCalledWith({
      preferences: {
        ...profile.preferences,
        messaging: { whoCanMessage: "following" },
      },
    });
    expect(await screen.findByText("Messaging privacy updated.")).toBeInTheDocument();
  });
});

describe("SettingsPage debate preferences", () => {
  it("saves all three choices without touching other preferences", async () => {
    mocks.updateProfile.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);

    await user.selectOptions(screen.getByLabelText("Preferred format"), "Policy");
    await user.selectOptions(screen.getByLabelText("Preferred side"), "Neg");
    await user.selectOptions(screen.getByLabelText("Async response cadence"), "48 hours");
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save debate preferences" }));

    expect(mocks.updateProfile).toHaveBeenCalledWith({
      preferences: {
        ...profile.preferences,
        debateDefaults: {
          preferredFormat: "Policy",
          preferredSide: "Neg",
          asyncResponseCadence: "48 hours",
        },
      },
    });
    expect(await screen.findByText("Debate preferences saved.")).toBeInTheDocument();
  });

  it("keeps unsaved choices when another card updates the profile, but follows new saved values", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await user.selectOptions(screen.getByLabelText("Preferred format"), "Policy");

    currentUser = { ...profile, hidePerformance: true };
    rerender(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByLabelText("Preferred format")).toHaveValue("Policy");

    currentUser = {
      ...profile,
      preferences: {
        ...profile.preferences,
        debateDefaults: { ...profile.preferences.debateDefaults, preferredFormat: "Congress" },
      },
    };
    rerender(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByLabelText("Preferred format")).toHaveValue("Congress");
    currentUser = profile;
  });

  it("shows the reason when saving fails", async () => {
    mocks.updateProfile.mockReset().mockRejectedValue(new Error("You are offline."));
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Save debate preferences" }));

    expect(await screen.findByText("You are offline.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save debate preferences" })).toBeEnabled();
  });
});

describe("SettingsPage notification history", () => {
  it("stacks Notifications directly below Account in the left column", () => {
    render(<SettingsPage />);
    const leftColumn = screen.getByRole("heading", { name: "Account" }).closest(".settings-left-stack");
    expect(leftColumn).toContainElement(screen.getByRole("heading", { name: "Notifications" }));
    expect(leftColumn).not.toContainElement(screen.getByRole("heading", { name: "Profile photo" }));
  });

  it("stacks the privacy cards under Profile photo, with Debate preferences below both columns", () => {
    render(<SettingsPage />);
    const rightColumn = screen.getByRole("heading", { name: "Profile photo" }).closest(".settings-right-stack");
    expect(Array.from(rightColumn!.querySelectorAll("h2")).map((heading) => heading.textContent)).toEqual([
      "Profile photo",
      "Profile privacy",
      "Messaging privacy",
    ]);
    expect(screen.getByRole("heading", { name: "Debate preferences" }).closest("article")?.parentElement).toHaveClass("settings-grid");
  });

  it("saves the selected number of history days on the profile", async () => {
    mocks.updateProfile.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SettingsPage />);

    const historyDays = screen.getByRole("textbox", { name: "Keep notifications for (days)" });
    expect(historyDays).toHaveValue("30");
    await user.clear(historyDays);
    expect(historyDays).toHaveValue("");
    await user.type(historyDays, "20");
    expect(historyDays).toHaveValue("20");
    await user.click(screen.getByRole("button", { name: "Save notification settings" }));

    expect(mocks.updateProfile).toHaveBeenCalledWith({
      preferences: {
        ...profile.preferences,
        notifications: { ...profile.preferences.notifications, historyDays: 20 },
      },
    });
    expect(await screen.findByText("Notification settings saved.")).toBeInTheDocument();
  });
});

describe("SettingsPage blocked accounts", () => {
  it("lists a blocked member and allows unblocking", async () => {
    mocks.setUserBlocked.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Account" }).closest("article")).toHaveClass("settings-account-card");
    await user.click(screen.getByRole("button", { name: "View blocked accounts (1)" }));
    expect(screen.getByRole("link", { name: "Taylor Kim" })).toHaveAttribute("href", "/app/users/other");
    await user.click(screen.getByRole("button", { name: "Unblock" }));
    expect(mocks.setUserBlocked).toHaveBeenCalledWith("maya", "other", false);
  });
});

