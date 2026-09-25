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

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: profile,
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

describe("SettingsPage notification history", () => {
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

