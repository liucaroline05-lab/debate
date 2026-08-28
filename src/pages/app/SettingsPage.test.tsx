import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { SettingsPage } from "@/pages/app/SettingsPage";
import type { UserProfile } from "@/types/models";

const mocks = vi.hoisted(() => ({ updateProfile: vi.fn() }));

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

