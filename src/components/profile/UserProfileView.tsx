import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Radar } from "react-chartjs-2";
import { Ban, CalendarClock, Flag, History, MapPin, MoreVertical, Share2 } from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { ShareToMessageDialog } from "@/features/messages/ShareToMessageDialog";
import {
  seededChannelMemberships,
  seededChannels,
  seededDebates,
  seededFollows,
  seededPosts,
  seededTabroomImports,
  seededTabroomLinks,
  seededUserStats,
  seededUsers,
} from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import {
  linkTabroomSession,
  maxDisplayNameLength,
  reportUserProfile,
  setUserBlocked,
  syncTabroomSession,
  toggleFollowUser,
  unlinkTabroomSession,
} from "@/features/profile/profileService";
import { normalizeUserProfile } from "@/features/users/defaultProfile";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type {
  PerformancePoint,
  RadarPoint,
  TabroomEvent,
  TabroomImport,
  UserProfile,
  UserBlock,
  UserStats,
} from "@/types/models";

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
);

interface UserProfileViewProps {
  userId: string;
  isOwnProfile: boolean;
}

type ProfileStats = Pick<
  UserStats,
  | "wins"
  | "losses"
  | "averageScore"
  | "winRate"
  | "totalRounds"
  | "performanceOverTime"
  | "formatBreakdown"
  | "topicStrengths"
>;

type ProfileTab = "Overview" | "Performance" | "Tabroom" | "Activity";

const defaultStats: ProfileStats = {
  wins: 0,
  losses: 0,
  averageScore: 0,
  winRate: 0,
  totalRounds: 0,
  performanceOverTime: [],
  formatBreakdown: [],
  topicStrengths: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toStringValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const normalizePerformancePoints = (value: unknown): PerformancePoint[] =>
  Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((entry) => ({
          label: toStringValue(entry.label, "Round"),
          score: toNumber(entry.score),
          wins: typeof entry.wins === "number" ? entry.wins : undefined,
          losses: typeof entry.losses === "number" ? entry.losses : undefined,
        }))
    : [];

const normalizeRadarPoints = (value: unknown): RadarPoint[] =>
  Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((entry) => ({
          skill: toStringValue(entry.skill, "Skill"),
          value: toNumber(entry.value),
        }))
    : [];

const normalizeProfileStats = (
  stats: Partial<UserStats> | null | undefined,
): ProfileStats => ({
  wins: toNumber(stats?.wins, defaultStats.wins),
  losses: toNumber(stats?.losses, defaultStats.losses),
  averageScore: toNumber(stats?.averageScore, defaultStats.averageScore),
  winRate: toNumber(stats?.winRate, defaultStats.winRate),
  totalRounds: toNumber(stats?.totalRounds, defaultStats.totalRounds),
  performanceOverTime: normalizePerformancePoints(stats?.performanceOverTime),
  formatBreakdown: normalizePerformancePoints(stats?.formatBreakdown),
  topicStrengths: normalizeRadarPoints(stats?.topicStrengths),
});

const getTabroomEvents = (
  tabroomImport: Partial<TabroomImport> | undefined,
): TabroomEvent[] =>
  Array.isArray(tabroomImport?.events)
    ? tabroomImport.events.filter(isRecord).map((event, index) => ({
        id: toStringValue(event.id, `tabroom-event-${index}`),
        name: toStringValue(event.name, "Tabroom event"),
        date: toStringValue(event.date),
        result: toStringValue(event.result, "Imported result"),
        sourceUrl: toStringValue(event.sourceUrl, "#"),
      }))
    : [];

const normalizeProfileForView = (profile: UserProfile) => ({
  ...profile,
  focusAreas: toStringArray(profile.focusAreas),
  organizationTags: toStringArray(profile.organizationTags),
  recommendationSlots: toStringArray(profile.recommendationSlots),
  activeChannelIds: toStringArray(profile.activeChannelIds),
});

const chartOptions = {
  responsive: true,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      suggestedMax: 100,
      ticks: {
        precision: 0 as const,
      },
    },
  },
};

const safeName = (value?: string | null, fallback = "Unknown Speaker") => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

const safeInitial = (value?: string | null) => safeName(value).charAt(0).toUpperCase();

const TABROOM_PAGE_SIZE = 5;

const formatEventDates = (event: TabroomEvent) => {
  const start = new Date(event.date);
  if (Number.isNaN(start.getTime())) return "Date unknown";

  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const end = event.endDate ? new Date(event.endDate) : null;
  if (!end || Number.isNaN(end.getTime()) || end.toDateString() === start.toDateString()) {
    return startLabel;
  }

  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
};

const countdownLabel = (event: TabroomEvent) => {
  const start = Date.parse(event.date);
  if (!Number.isFinite(start)) return "";
  const days = Math.ceil((start - Date.now()) / 86_400_000);
  if (days <= 0) return "Happening now";
  if (days === 1) return "Tomorrow";
  if (days <= 30) return `In ${days} days`;
  return "";
};

interface TabroomEventListProps {
  upcoming: TabroomEvent[];
  past: TabroomEvent[];
  view: "upcoming" | "past";
  onViewChange: (view: "upcoming" | "past") => void;
  showAll: boolean;
  onShowAll: () => void;
  isLinked: boolean;
}

/**
 * Tabroom tournaments, split so what is still ahead leads and history is one
 * click away. Only a page of entries renders at a time; a linked account can
 * carry dozens.
 */
const TabroomEventList = ({
  upcoming,
  past,
  view,
  onViewChange,
  showAll,
  onShowAll,
  isLinked,
}: TabroomEventListProps) => {
  const events = view === "upcoming" ? upcoming : past;
  const visible = showAll ? events : events.slice(0, TABROOM_PAGE_SIZE);

  return (
    <section className="tabroom-events">
      <div className="settings-segment tabroom-event-tabs" role="group" aria-label="Tabroom tournaments">
        <button
          type="button"
          className={view === "upcoming" ? "settings-segment-option is-on" : "settings-segment-option"}
          aria-pressed={view === "upcoming"}
          onClick={() => onViewChange("upcoming")}
        >
          <CalendarClock size={16} aria-hidden="true" /> Upcoming ({upcoming.length})
        </button>
        <button
          type="button"
          className={view === "past" ? "settings-segment-option is-on" : "settings-segment-option"}
          aria-pressed={view === "past"}
          onClick={() => onViewChange("past")}
        >
          <History size={16} aria-hidden="true" /> Past ({past.length})
        </button>
      </div>

      {events.length === 0 ? (
        <p className="card-copy">
          {!isLinked
            ? "Link a Tabroom account to import your tournament schedule."
            : view === "upcoming"
              ? "No upcoming tournaments are on this Tabroom account."
              : "No past tournaments were found on this Tabroom account."}
        </p>
      ) : null}

      <div className="list" style={{ marginTop: "1rem" }}>
        {visible.map((event) => {
          const countdown = view === "upcoming" ? countdownLabel(event) : "";
          return (
            <a
              key={event.id}
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="list-item tabroom-event-item"
            >
              <span className="tabroom-event-heading">
                <strong>{event.name}</strong>
                {countdown ? <span className="pill">{countdown}</span> : null}
              </span>
              <span className="meta-line">{formatEventDates(event)}</span>
              {event.location ? (
                <span className="meta-line">
                  <MapPin size={13} aria-hidden="true" /> {event.location}
                </span>
              ) : null}
              {event.role || event.judgeCategory || event.schoolName ? (
                <span className="pill-row" style={{ marginTop: "0.5rem" }}>
                  {event.role ? <span className="forum-mini-pill">{event.role}</span> : null}
                  {event.judgeCategory ? (
                    <span className="forum-mini-pill subtle">{event.judgeCategory}</span>
                  ) : null}
                  {event.schoolName ? (
                    <span className="forum-mini-pill subtle">{event.schoolName}</span>
                  ) : null}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>

      {!showAll && events.length > TABROOM_PAGE_SIZE ? (
        <button type="button" className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={onShowAll}>
          Show all {events.length}
        </button>
      ) : null}
    </section>
  );
};

export const UserProfileView = ({ userId, isOwnProfile }: UserProfileViewProps) => {
  const { currentUser, isDemoMode, updateProfile } = useAuth();
  const location = useLocation();
  const usersState = useSeededFirestoreCollection("users", seededUsers);
  const postsState = useSeededFirestoreCollection("posts", seededPosts);
  const followsState = useSeededFirestoreCollection("follows", seededFollows);
  const blockConstraints = useMemo<QueryConstraint[]>(
    () => currentUser ? [where("blockerId", "==", currentUser.id)] : [],
    [currentUser?.id],
  );
  const blocksState = useSeededFirestoreCollection<UserBlock>(
    "userBlocks", [], blockConstraints, Boolean(currentUser),
    currentUser ? `user-blocks:${currentUser.id}` : undefined,
  );
  const channelsState = useSeededFirestoreCollection("channels", seededChannels);
  const membershipsState = useSeededFirestoreCollection(
    "channelMemberships",
    seededChannelMemberships,
  );
  const debatesState = useSeededFirestoreCollection("debates", seededDebates);
  const statsState = useSeededFirestoreCollection("userStats", seededUserStats);
  const tabroomLinksState = useSeededFirestoreCollection("tabroomLinks", seededTabroomLinks);
  const tabroomImportsState = useSeededFirestoreCollection(
    "tabroomImports",
    seededTabroomImports,
  );

  const profile = useMemo(() => {
    const userFromCollection = usersState.data.find((user) => user.id === userId);

    if (isOwnProfile) {
      return userFromCollection || currentUser
        ? normalizeProfileForView(normalizeUserProfile(userFromCollection ?? currentUser))
        : null;
    }

    return userFromCollection
      ? normalizeProfileForView(normalizeUserProfile(userFromCollection))
      : null;
  }, [currentUser, isOwnProfile, userId, usersState.data]);

  const profileName = safeName(profile?.displayName);

  const [displayNameDraft, setDisplayNameDraft] = useState(profileName);
  const [bioDraft, setBioDraft] = useState(profile?.bio ?? "");
  const [tabroomEmail, setTabroomEmail] = useState(profile?.email ?? "");
  const [tabroomPassword, setTabroomPassword] = useState("");
  const [isTabroomBusy, setIsTabroomBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [reportReason, setReportReason] = useState<"Harassment" | "Inappropriate content" | "Spam" | "Impersonation" | "Other">("Harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("Overview");
  const [showTabroomHistory, setShowTabroomHistory] = useState(profile?.showTabroomHistory ?? false);
  const [isSavingTabroomVisibility, setIsSavingTabroomVisibility] = useState(false);
  const [tabroomView, setTabroomView] = useState<"upcoming" | "past">("upcoming");
  const [showAllTabroomEvents, setShowAllTabroomEvents] = useState(false);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setDisplayNameDraft(safeName(profile.displayName));
    setBioDraft(profile.bio ?? "");
    setTabroomEmail((current) => current || profile.email || "");
    setShowTabroomHistory(profile.showTabroomHistory ?? false);
  }, [profile]);

  useEffect(() => {
    if (location.hash === "#tabroom") {
      setActiveTab("Tabroom");
    }
  }, [location.hash]);

  const authoredPosts = useMemo(
    () => postsState.data.filter((post) => post.authorId === userId),
    [postsState.data, userId],
  );
  const authoredDebates = useMemo(
    () =>
      debatesState.data.filter((debate) =>
        Array.isArray(debate.participantIds) && debate.participantIds.includes(userId),
      ),
    [debatesState.data, userId],
  );
  const activeChannelIds = [
    ...new Set([
      ...membershipsState.data
        .filter((membership) => membership.userId === userId)
        .map((membership) => membership.channelId),
      ...toStringArray(profile?.activeChannelIds),
    ]),
  ];
  const activeChannels = channelsState.data.filter((channel) =>
    activeChannelIds.includes(channel.id),
  );
  const stats = useMemo(
    () => normalizeProfileStats(statsState.data.find((entry) => entry.userId === userId)),
    [statsState.data, userId],
  );
  // followersCount/followingCount on the profile document are never written,
  // so derive both from the follows collection, which is the source of truth.
  const followerCount = useMemo(
    () => followsState.data.filter((follow) => follow.followingId === userId).length,
    [followsState.data, userId],
  );
  const followingCount = useMemo(
    () => followsState.data.filter((follow) => follow.followerId === userId).length,
    [followsState.data, userId],
  );

  const tabroomLink = tabroomLinksState.data.find((entry) => entry.userId === userId);
  const tabroomImport = tabroomImportsState.data.find((entry) => entry.userId === userId);
  const tabroomEvents = getTabroomEvents(tabroomImport);
  const { upcomingTabroomEvents, pastTabroomEvents } = useMemo(() => {
    const now = Date.now();
    const upcoming: TabroomEvent[] = [];
    const past: TabroomEvent[] = [];

    tabroomEvents.forEach((event) => {
      const endsAt = Date.parse(event.endDate || event.date);
      if (Number.isFinite(endsAt) && endsAt >= now) {
        upcoming.push(event);
      } else {
        past.push(event);
      }
    });

    // Soonest-first for what is still ahead; most recent first for history.
    upcoming.sort((left, right) => left.date.localeCompare(right.date));
    past.sort((left, right) => right.date.localeCompare(left.date));
    return { upcomingTabroomEvents: upcoming, pastTabroomEvents: past };
  }, [tabroomEvents]);
  const isTabroomLinked = tabroomLink?.status === "linked" || tabroomLink?.status === "syncing";
  const isFollowing = followsState.data.some(
    (follow) =>
      follow.followerId === currentUser?.id && follow.followingId === userId,
  );
  const isBlocked = blocksState.data.some((block) => block.blockedId === userId);

  const performanceData = useMemo(
    () => ({
      labels: stats.performanceOverTime.map((entry) => entry.label),
      datasets: [
        {
          label: "Average score",
          data: stats.performanceOverTime.map((entry) => entry.score),
          backgroundColor: "rgba(118, 128, 107, 0.55)",
          borderRadius: 18,
        },
      ],
    }),
    [stats.performanceOverTime],
  );

  const radarData = useMemo(
    () => ({
      labels: stats.topicStrengths.map((entry) => entry.skill),
      datasets: [
        {
          label: "Strength",
          data: stats.topicStrengths.map((entry) => entry.value),
          backgroundColor: "rgba(203, 141, 108, 0.18)",
          borderColor: "rgba(189, 109, 79, 0.72)",
          pointBackgroundColor: "rgba(78, 90, 71, 0.9)",
        },
      ],
    }),
    [stats.topicStrengths],
  );

  const radarOptions = useMemo(
    () => ({
      plugins: {
        legend: { display: false },
      },
      scales: {
        r: {
          suggestedMin: 0,
          suggestedMax: 100,
        },
      },
    }),
    [],
  );
  const hasPerformanceData = stats.performanceOverTime.length > 0;
  const hasTopicStrengths = stats.topicStrengths.length > 0;

  if (usersState.isLoading && !profile) {
    return (
      <section className="empty-state">
        <h2 className="card-title">Loading profile</h2>
        <p className="card-copy">Pulling this speaker's profile from Firebase.</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="empty-state">
        <h2 className="card-title">User profile not found</h2>
        <p className="card-copy">
          This account has not been created in Firebase yet.
        </p>
      </section>
    );
  }

  const saveProfileDetails = async () => {
    if (!currentUser || !isOwnProfile || isSavingProfile) {
      return;
    }

    const nextDisplayName = displayNameDraft.trim();
    if (!nextDisplayName) {
      setMessage("Add a display name before saving.");
      return;
    }

    if (nextDisplayName.length > maxDisplayNameLength) {
      setMessage(`Display name must be ${maxDisplayNameLength} characters or fewer.`);
      return;
    }

    setMessage("");
    setIsSavingProfile(true);

    try {
      await updateProfile({
        displayName: nextDisplayName,
        bio: bioDraft,
      });
      setMessage(
        isDemoMode
          ? "Saved for this session. Connect Firebase to save it to your account."
          : "Profile details saved.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save profile details.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const toggleFollow = async () => {
    if (!currentUser || currentUser.id === userId || isBlocked) {
      return;
    }

    try {
      await toggleFollowUser(currentUser.id, userId);
      setMessage(isFollowing ? "Unfollowed user." : "Now following user.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update follow status.",
      );
    }
  };

  const toggleBlock = async () => {
    if (!currentUser || isBlocking) return;
    setIsBlocking(true);
    try {
      await setUserBlocked(currentUser.id, userId, !isBlocked);
      setMessage(isBlocked ? "Account unblocked." : "Account blocked. Direct messages between you are disabled.");
      setBlockConfirmOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change block status.");
    } finally {
      setIsBlocking(false);
    }
  };

  const submitReport = async () => {
    if (!currentUser || isReporting) return;
    setIsReporting(true);
    setReportError("");
    try {
      const created = await reportUserProfile(currentUser.id, userId, reportReason, reportDetails);
      setMessage(created ? "Report submitted. Thank you." : "You have already reported this account.");
      setReportOpen(false);
      setReportDetails("");
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Unable to submit report.");
    } finally {
      setIsReporting(false);
    }
  };

  const saveTabroomVisibility = async (nextValue: boolean) => {
    if (isSavingTabroomVisibility) return;
    const previousValue = showTabroomHistory;
    setShowTabroomHistory(nextValue);
    setIsSavingTabroomVisibility(true);
    try {
      await updateProfile({ showTabroomHistory: nextValue });
      setMessage(
        nextValue
          ? "Your Tabroom history is now visible on your profile."
          : "Your Tabroom history is now hidden from your profile.",
      );
    } catch (error) {
      setShowTabroomHistory(previousValue);
      setMessage(
        error instanceof Error ? error.message : "Unable to save Tabroom visibility.",
      );
    } finally {
      setIsSavingTabroomVisibility(false);
    }
  };

  const linkTabroom = async () => {
    if (!currentUser || isTabroomBusy) return;
    if (!tabroomEmail.trim() || !tabroomPassword) {
      setMessage("Enter your Tabroom email and password.");
      return;
    }

    setIsTabroomBusy(true);
    setMessage("");
    try {
      const result = await linkTabroomSession(tabroomEmail, tabroomPassword);
      setMessage(
        `Tabroom account linked and ${result.eventCount} ${result.eventCount === 1 ? "tournament" : "tournaments"} imported. Future syncs reuse the saved session.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to link Tabroom.");
    } finally {
      setTabroomPassword("");
      setIsTabroomBusy(false);
    }
  };

  const syncTabroom = async () => {
    if (!currentUser || isTabroomBusy) return;
    setIsTabroomBusy(true);
    setMessage("");
    try {
      const result = await syncTabroomSession();
      setMessage(
        `Tabroom synced: ${result.eventCount} ${result.eventCount === 1 ? "tournament" : "tournaments"} imported.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sync Tabroom.");
    } finally {
      setIsTabroomBusy(false);
    }
  };

  const unlinkTabroom = async () => {
    if (!currentUser || isTabroomBusy) return;
    setIsTabroomBusy(true);
    setMessage("");
    try {
      await unlinkTabroomSession();
      setMessage("Tabroom account unlinked and its saved session removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to unlink Tabroom.");
    } finally {
      setTabroomPassword("");
      setIsTabroomBusy(false);
    }
  };

  return (
    <>
      <PageMeta
        title={isOwnProfile ? "Profile" : `${profileName}`}
        description={`Profile, debates, stats, and community activity for ${profileName}.`}
      />
      <header className="route-header">
        <p className="eyebrow">{isOwnProfile ? "Profile" : "Speaker Profile"}</p>
        <h1>{profileName}</h1>
        <p>
          Debate history, active channels, authored posts, performance trends,
          and linked Tabroom imports live here.
        </p>
      </header>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {(["Overview", "Performance", "Tabroom", "Activity"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "profile-tab is-active" : "profile-tab"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="user-profile-layout">
        {activeTab === "Overview" ? <article className="app-card">
          <div className="user-profile-hero">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={`${profileName} avatar`}
                className="user-profile-avatar"
              />
            ) : (
              <div className="user-profile-avatar user-profile-avatar-fallback" aria-hidden="true">
                {safeInitial(profile.displayName)}
              </div>
            )}

            <div className="stack" style={{ gap: "0.55rem" }}>
              <div className="pill-row">
                <span className="pill">{profile.role}</span>
                {profile.username ? <span className="pill">@{profile.username}</span> : null}
              </div>
              <div className="profile-follow-counts">
                <span>
                  <strong>{followerCount}</strong>
                  {followerCount === 1 ? " follower" : " followers"}
                </span>
                <span>
                  <strong>{followingCount}</strong> following
                </span>
              </div>
              {isOwnProfile ? (
                <div className="stack" style={{ gap: "0.65rem" }}>
                  <div className="form-field">
                    <label htmlFor="profileDisplayName">Display name</label>
                    <input
                      id="profileDisplayName"
                      value={displayNameDraft}
                      maxLength={maxDisplayNameLength}
                      onChange={(event) => setDisplayNameDraft(event.target.value)}
                    />
                    <span className="meta-line">
                      {displayNameDraft.trim().length}/{maxDisplayNameLength} characters
                    </span>
                  </div>
                  <div className="form-field">
                    <label htmlFor="profileBio">Bio</label>
                    <textarea
                      id="profileBio"
                      className="profile-bio-input"
                      value={bioDraft}
                      onChange={(event) => setBioDraft(event.target.value)}
                    />
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={isSavingProfile}
                      onClick={() => void saveProfileDetails()}
                    >
                      {isSavingProfile ? "Saving..." : "Save profile details"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="card-copy">{profile.bio}</p>
              )}
            </div>

            {!isOwnProfile ? <div className="profile-hero-actions">
              <div className="forum-post-menu">
                <button type="button" className="forum-icon-button" aria-label={`Actions for ${profileName}`} aria-expanded={actionsOpen} onClick={() => setActionsOpen((value) => !value)}>
                  <MoreVertical size={19} aria-hidden="true" />
                </button>
                {actionsOpen ? <div className="forum-menu-dropdown">
                  <button type="button" className="forum-menu-item" onClick={() => { setActionsOpen(false); setShareOpen(true); }}><Share2 size={16} /> Share profile</button>
                  <button type="button" className="forum-menu-item" onClick={() => { setActionsOpen(false); setReportOpen(true); }}><Flag size={16} /> Report</button>
                  <button type="button" className="forum-menu-item" onClick={() => { setActionsOpen(false); if (isBlocked) void toggleBlock(); else setBlockConfirmOpen(true); }}><Ban size={16} /> {isBlocked ? "Unblock" : "Block"}</button>
                </div> : null}
              </div>
              <button type="button" className="btn btn-primary" disabled={isBlocked} onClick={() => void toggleFollow()}>
                {isBlocked ? "Blocked" : isFollowing ? "Following" : "Follow"}
              </button>
            </div> : null}
          </div>

          {message ? <p className="meta-line" role="status" style={{ marginTop: "1rem" }}>{message}</p> : null}
          <span className="sr-only">{stats.wins}</span>
        </article> : null}

        {activeTab === "Performance" ? <section className="user-profile-metrics">
          <article className="metric-card">
            <span>Wins</span>
            <strong>{stats.wins}</strong>
          </article>
          <article className="metric-card">
            <span>Losses</span>
            <strong>{stats.losses}</strong>
          </article>
          <article className="metric-card">
            <span>Win rate</span>
            <strong>{stats.winRate}%</strong>
          </article>
          <article className="metric-card">
            <span>Average score</span>
            <strong>{stats.averageScore}</strong>
          </article>
        </section> : null}

        {activeTab === "Overview" ? <section className="settings-grid">
          <article className="app-card">
            <h2 className="card-title">Profile details</h2>
            <div className="profile-detail-grid">
              <div className="profile-detail-item">
                <span>Role</span>
                <strong>{profile.role}</strong>
              </div>
              <div className="profile-detail-item">
                <span>Preferred format</span>
                <strong>{profile.preferences.debateDefaults.preferredFormat}</strong>
              </div>
              <div className="profile-detail-item">
                <span>Preferred side</span>
                <strong>{profile.preferences.debateDefaults.preferredSide}</strong>
              </div>
              <div className="profile-detail-item">
                <span>Async cadence</span>
                <strong>{profile.preferences.debateDefaults.asyncResponseCadence}</strong>
              </div>
            </div>
          </article>

          <article className="app-card">
            <h2 className="card-title">Debate preferences</h2>
            <div className="profile-preference-block">
              <span className="meta-line">Focus areas</span>
              <div className="pill-row">
                {(profile.focusAreas.length > 0 ? profile.focusAreas : ["No focus areas yet"]).map((area) => (
                  <span key={area} className="pill">
                    {area}
                  </span>
                ))}
              </div>
            </div>
            <div className="profile-preference-block">
              <span className="meta-line">Organizations</span>
              <div className="pill-row">
                {(profile.organizationTags.length > 0 ? profile.organizationTags : ["No organizations listed"]).map((tag) => (
                  <span key={tag} className="pill">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="profile-preference-block">
              <span className="meta-line">Recommendation slots</span>
              <div className="pill-row">
                {(profile.recommendationSlots.length > 0 ? profile.recommendationSlots : ["No recommendation slots yet"]).map((slot) => (
                  <span key={slot} className="pill">
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </article>
        </section> : null}

        {activeTab === "Performance" ? <section className="settings-grid">
          <article className="app-card">
            <h2 className="card-title">Performance over time</h2>
            <div className="chart-panel">
              {hasPerformanceData ? (
                <Bar
                  key={`profile-performance-${userId}`}
                  redraw
                  data={performanceData}
                  options={chartOptions}
                />
              ) : (
                <div className="empty-state chart-empty-state">
                  <h3 className="card-title">No performance data yet</h3>
                  <p className="card-copy">Completed rounds will appear here once this profile has stats.</p>
                </div>
              )}
            </div>
          </article>

          <article className="app-card">
            <h2 className="card-title">Topic strengths</h2>
            <div className="chart-panel">
              {hasTopicStrengths ? (
                <Radar
                  key={`profile-radar-${userId}`}
                  redraw
                  data={radarData}
                  options={radarOptions}
                />
              ) : (
                <div className="empty-state chart-empty-state">
                  <h3 className="card-title">No topic data yet</h3>
                  <p className="card-copy">Topic strengths will appear here after more judged rounds.</p>
                </div>
              )}
            </div>
          </article>
        </section> : null}

        {activeTab === "Activity" ? <section className="settings-grid">
          <article className="app-card">
            <h2 className="card-title">Debates</h2>
            <div className="list" style={{ marginTop: "1rem" }}>
              {authoredDebates.map((debate) => (
                <Link key={debate.id} to={debate.watchPath ?? `/app/debates/${debate.id}`} className="list-item">
                  <strong>{debate.topic}</strong>
                  <span className="meta-line">
                    {debate.format} • {debate.status} • {debate.summary ?? "Watch debate"}
                  </span>
                </Link>
              ))}
            </div>
          </article>

          <article className="app-card">
            <h2 className="card-title">Posts</h2>
            <div className="list" style={{ marginTop: "1rem" }}>
              {authoredPosts.map((post) => (
                <Link key={post.id} to={`/app/community?post=${encodeURIComponent(post.id)}`} className="list-item dashboard-list-link">
                  <strong>{post.title}</strong>
                  <span className="meta-line">
                    {post.category} • {post.likeCount ?? 0} likes • {post.replyCount} comments
                  </span>
                </Link>
              ))}
            </div>
          </article>
        </section> : null}

        {activeTab === "Activity" ? <section className="settings-grid">
          <article className="app-card">
            <h2 className="card-title">Active channels</h2>
            <div className="list" style={{ marginTop: "1rem" }}>
              {activeChannels.map((channel) => (
                <Link key={channel.id} to={`/app/community?channel=${channel.id}`} className="list-item dashboard-list-link">
                  <strong>{channel.name}</strong>
                  <span className="meta-line">{channel.category ?? "Community"} • {channel.memberCount ?? channel.followers} members</span>
                </Link>
              ))}
            </div>
          </article>
        </section> : null}

        {activeTab === "Tabroom" ? <section className="settings-grid" id="tabroom">{isOwnProfile ? <article className="app-card">
            <h2 className="card-title">Tabroom sync</h2>
              <div className="form-grid" style={{ marginTop: "1rem" }}>
                {isTabroomLinked ? (
                  <>
                    <div className="debate-banner is-invite form-field full">
                      <strong>{tabroomLink?.handle ?? "Tabroom account"}</strong>
                      <span className="meta-line">
                        Authenticated session saved securely
                      </span>
                    </div>
                    <div className="button-row full">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isTabroomBusy}
                        onClick={() => void syncTabroom()}
                      >
                        {isTabroomBusy ? "Syncing..." : "Sync now"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isTabroomBusy}
                        onClick={() => void unlinkTabroom()}
                      >
                        Unlink
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-field full">
                      <label htmlFor="tabroomEmail">Tabroom email</label>
                      <input
                        id="tabroomEmail"
                        type="email"
                        autoComplete="username"
                        value={tabroomEmail}
                        onChange={(event) => setTabroomEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="form-field full">
                      <label htmlFor="tabroomPassword">Tabroom password</label>
                      <input
                        id="tabroomPassword"
                        type="password"
                        autoComplete="current-password"
                        value={tabroomPassword}
                        onChange={(event) => setTabroomPassword(event.target.value)}
                      />
                      <span className="meta-line">
                        Your password is used once to sign in and is never stored. Only an encrypted Tabroom session is retained.
                      </span>
                    </div>
                    <div className="button-row full">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isTabroomBusy}
                        onClick={() => void linkTabroom()}
                      >
                        {isTabroomBusy ? "Linking..." : "Link Tabroom"}
                      </button>
                    </div>
                  </>
                )}
              </div>

            {isOwnProfile ? (
              <div className="profile-tabroom-visibility">
                <button
                  type="button"
                  className="settings-toggle-row"
                  aria-pressed={showTabroomHistory}
                  disabled={isSavingTabroomVisibility}
                  onClick={() => void saveTabroomVisibility(!showTabroomHistory)}
                >
                  <span>
                    <strong>Display my Tabroom history</strong>
                    <span className="meta-line">
                      Show your imported tournaments and results on your public profile.
                    </span>
                  </span>
                  <span className={showTabroomHistory ? "settings-toggle is-on" : "settings-toggle"}>
                    {isSavingTabroomVisibility ? "..." : showTabroomHistory ? "On" : "Off"}
                  </span>
                </button>
              </div>
            ) : null}

            {(isOwnProfile || profile.showTabroomHistory) ? <>
              <div className="list" style={{ marginTop: "1rem" }}>
                <div className="list-item">
                  <strong>Status</strong>
                  <span className="meta-line">
                    {tabroomLink?.status ?? tabroomImport?.status ?? "Not linked"}
                  </span>
                </div>
                <div className="list-item">
                  <strong>Last sync</strong>
                  <span className="meta-line">
                    {tabroomLink?.lastSyncedAt ?? tabroomImport?.lastSuccessfulAt ?? "No successful sync yet"}
                  </span>
                </div>
              </div>

              {tabroomImport?.stats ? (
                <div className="profile-detail-grid" style={{ marginTop: "1rem" }}>
                  <div className="profile-detail-item"><span>Imported record</span><strong>{tabroomImport.stats.wins}-{tabroomImport.stats.losses}</strong></div>
                  <div className="profile-detail-item"><span>Speaker points</span><strong>{tabroomImport.stats.averageSpeakerPoints || "—"}</strong></div>
                  <div className="profile-detail-item"><span>OTR score</span><strong>{tabroomImport.stats.otrScore || "—"}</strong></div>
                  <div className="profile-detail-item"><span>Bids</span><strong>{(tabroomImport.stats.goldBids ?? 0) + (tabroomImport.stats.silverBids ?? 0)}</strong></div>
                </div>
              ) : null}
              {tabroomImport?.errorMessage ? <p className="meta-line is-error">{tabroomImport.errorMessage}</p> : null}
            </> : null}

          </article> : null}
          <article className="app-card">
            <h2 className="card-title">Synced events</h2>
            {(isOwnProfile || profile.showTabroomHistory) ? (
              <TabroomEventList
                upcoming={upcomingTabroomEvents}
                past={pastTabroomEvents}
                view={tabroomView}
                onViewChange={(nextView) => {
                  setTabroomView(nextView);
                  setShowAllTabroomEvents(false);
                }}
                showAll={showAllTabroomEvents}
                onShowAll={() => setShowAllTabroomEvents(true)}
                isLinked={isOwnProfile ? isTabroomLinked : true}
              />
            ) : <p className="card-copy">This user has not chosen to display their Tabroom history.</p>}
          </article>
        </section> : null}
      </section>
      {shareOpen && !isOwnProfile ? <ShareToMessageDialog
        title={profileName}
        url={`${window.location.origin}/app/users/${userId}`}
        previewKind="profile"
        media={profile.avatarUrl ? [{ kind: "image", url: profile.avatarUrl, name: `${profileName} avatar` }] : undefined}
        onClose={() => setShareOpen(false)}
      /> : null}
      {reportOpen && !isOwnProfile ? <div className="community-modal-overlay" role="presentation" onMouseDown={() => !isReporting && setReportOpen(false)}>
        <div className="community-modal app-card" role="dialog" aria-modal="true" aria-labelledby="profileReportTitle" onMouseDown={(event) => event.stopPropagation()}>
          <h2 id="profileReportTitle" className="card-title">Report {profileName}</h2>
          <p className="card-copy">Tell us what needs review. Your report is not shown to this member.</p>
          <div className="form-field">
            <label htmlFor="profileReportReason">Reason</label>
            <select id="profileReportReason" value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)}>
              <option>Harassment</option><option>Inappropriate content</option><option>Spam</option><option>Impersonation</option><option>Other</option>
            </select>
          </div>
          <div className="form-field" style={{ marginTop: "1rem" }}>
            <label htmlFor="profileReportDetails">Details (optional)</label>
            <textarea id="profileReportDetails" value={reportDetails} maxLength={1000} onChange={(event) => setReportDetails(event.target.value)} placeholder="Add context that will help a reviewer." />
          </div>
          {reportError ? <p className="speech-field-error" role="alert">{reportError}</p> : null}
          <div className="button-row community-modal-actions">
            <button type="button" className="btn btn-secondary" disabled={isReporting} onClick={() => setReportOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={isReporting} onClick={() => void submitReport()}>{isReporting ? "Submitting..." : "Submit report"}</button>
          </div>
        </div>
      </div> : null}
      {blockConfirmOpen && !isOwnProfile ? <div className="community-modal-overlay" role="presentation" onMouseDown={() => !isBlocking && setBlockConfirmOpen(false)}>
        <div className="community-modal app-card" role="dialog" aria-modal="true" aria-labelledby="profileBlockTitle" onMouseDown={(event) => event.stopPropagation()}>
          <h2 id="profileBlockTitle" className="card-title">Block {profileName}?</h2>
          <p className="card-copy">You will stop following this member, and direct messages between your accounts will be disabled. You can unblock them in Settings.</p>
          <div className="button-row community-modal-actions">
            <button type="button" className="btn btn-secondary" disabled={isBlocking} onClick={() => setBlockConfirmOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={isBlocking} onClick={() => void toggleBlock()}>{isBlocking ? "Blocking..." : "Block account"}</button>
          </div>
        </div>
      </div> : null}
    </>
  );
};
