import type { UserProfile, UserPreferences, UserRole } from "@/types/models";

export const defaultUserPreferences: UserPreferences = {
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
};

export const normalizeUserProfile = (
  profile: Partial<UserProfile> | null | undefined,
): UserProfile => ({
  id: profile?.id ?? "",
  displayName: profile?.displayName?.trim() || "Debate Studio Member",
  username: profile?.username?.trim() || undefined,
  email: profile?.email?.trim() || "",
  role: (profile?.role as UserRole | undefined) ?? "student",
  avatarUrl: profile?.avatarUrl?.trim() || undefined,
  bio: profile?.bio ?? "",
  focusAreas: profile?.focusAreas ?? [],
  organizationTags: profile?.organizationTags ?? [],
  recommendationSlots: profile?.recommendationSlots ?? [],
  preferences: {
    notifications: {
      ...defaultUserPreferences.notifications,
      ...profile?.preferences?.notifications,
    },
    debateDefaults: {
      ...defaultUserPreferences.debateDefaults,
      ...profile?.preferences?.debateDefaults,
    },
  },
  followersCount: profile?.followersCount ?? 0,
  followingCount: profile?.followingCount ?? 0,
  activeChannelIds: profile?.activeChannelIds ?? [],
  tabroomProfileUrl: profile?.tabroomProfileUrl?.trim() || undefined,
  createdAt: profile?.createdAt || new Date().toISOString(),
});
