import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { PageMeta } from "@/components/common/PageMeta";
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
  maxDisplayNameLength,
  requestTabroomSync,
  toggleFollowUser,
} from "@/features/profile/profileService";
import { normalizeUserProfile } from "@/features/users/defaultProfile";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type {
  PerformancePoint,
  RadarPoint,
  TabroomEvent,
  TabroomImport,
  UserProfile,
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

const currentSchoolYear = () => {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `SY_${String(startYear).slice(-2)}_${String(startYear + 1).slice(-2)}`;
};

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
const safeHandle = (username?: string | null, displayName?: string | null) =>
  username?.trim() || safeName(displayName).toLowerCase().replace(/\s+/g, "_");

export const UserProfileView = ({ userId, isOwnProfile }: UserProfileViewProps) => {
  const { currentUser, isDemoMode, updateProfile } = useAuth();
  const usersState = useSeededFirestoreCollection("users", seededUsers);
  const postsState = useSeededFirestoreCollection("posts", seededPosts);
  const followsState = useSeededFirestoreCollection("follows", seededFollows);
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
  const [tabroomDraft, setTabroomDraft] = useState(
    profile?.tabroomProfileUrl ?? "",
  );
  const [handleDraft, setHandleDraft] = useState(
    safeHandle(profile?.username, profile?.displayName),
  );
  const [tabroomFormat, setTabroomFormat] = useState<"PF" | "LD" | "CX">("PF");
  const [tabroomCircuit, setTabroomCircuit] = useState("National");
  const [tabroomYear, setTabroomYear] = useState(currentSchoolYear);
  const [message, setMessage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setDisplayNameDraft(safeName(profile.displayName));
    setBioDraft(profile.bio ?? "");
    setTabroomDraft(profile.tabroomProfileUrl ?? "");
    setHandleDraft(safeHandle(profile.username, profile.displayName));
  }, [profile]);

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
  const tabroomLink = tabroomLinksState.data.find((entry) => entry.userId === userId);
  const tabroomImport = tabroomImportsState.data.find((entry) => entry.userId === userId);
  const tabroomEvents = getTabroomEvents(tabroomImport);
  const isFollowing = followsState.data.some(
    (follow) =>
      follow.followerId === currentUser?.id && follow.followingId === userId,
  );

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
    if (!currentUser || currentUser.id === userId) {
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

  const syncTabroom = async () => {
    if (!currentUser || !tabroomDraft.trim()) {
      return;
    }

    try {
      await requestTabroomSync(tabroomDraft, handleDraft, {
        format: tabroomFormat,
        circuit: tabroomCircuit,
        year: tabroomYear,
      });
      setMessage("Tabroom stats and tournament results synced.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to request Tabroom sync.",
      );
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

      <section className="user-profile-layout">
        <article className="app-card">
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

            {!isOwnProfile ? (
              <button type="button" className="btn btn-primary" onClick={() => void toggleFollow()}>
                {isFollowing ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>

          {message ? <p className="meta-line" style={{ marginTop: "1rem" }}>{message}</p> : null}
        </article>

        <section className="user-profile-metrics">
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
        </section>

        <section className="settings-grid">
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
        </section>

        <section className="settings-grid">
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
        </section>

        <section className="settings-grid">
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
                <div key={post.id} className="list-item">
                  <strong>{post.title}</strong>
                  <span className="meta-line">
                    {post.category} • {post.likeCount ?? 0} likes • {post.replyCount} comments
                  </span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="settings-grid">
          <article className="app-card">
            <h2 className="card-title">Active channels</h2>
            <div className="pill-row" style={{ marginTop: "1rem" }}>
              {activeChannels.map((channel) => (
                <span key={channel.id} className="pill">
                  {channel.name}
                </span>
              ))}
            </div>
          </article>

          <article className="app-card" id="tabroom">
            <h2 className="card-title">Tabroom sync</h2>
            {isOwnProfile ? (
              <div className="form-grid" style={{ marginTop: "1rem" }}>
                <div className="form-field full">
                  <label htmlFor="tabroomProfileUrl">Tabroom profile URL</label>
                  <input
                    id="tabroomProfileUrl"
                    value={tabroomDraft}
                    onChange={(event) => setTabroomDraft(event.target.value)}
                    placeholder="https://www.tabroom.com/user/profile/..."
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="tabroomHandle">Debater or team name</label>
                  <input
                    id="tabroomHandle"
                    value={handleDraft}
                    onChange={(event) => setHandleDraft(event.target.value)}
                    placeholder="Name as listed on Tabroom"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="tabroomFormat">Debate format</label>
                  <select
                    id="tabroomFormat"
                    value={tabroomFormat}
                    onChange={(event) => setTabroomFormat(event.target.value as "PF" | "LD" | "CX")}
                  >
                    <option value="PF">Public Forum</option>
                    <option value="LD">Lincoln-Douglas</option>
                    <option value="CX">Policy</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="tabroomYear">School year</label>
                  <input
                    id="tabroomYear"
                    value={tabroomYear}
                    onChange={(event) => setTabroomYear(event.target.value.toUpperCase())}
                    placeholder="SY_25_26"
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="tabroomCircuit">Circuit</label>
                  <input
                    id="tabroomCircuit"
                    value={tabroomCircuit}
                    onChange={(event) => setTabroomCircuit(event.target.value)}
                    placeholder="National"
                  />
                </div>
                <div className="button-row">
                  <button type="button" className="btn btn-primary" onClick={() => void syncTabroom()}>
                    Sync Tabroom
                  </button>
                </div>
              </div>
            ) : (
              <p className="card-copy">
                Linked account: {tabroomLink?.handle ?? "Not linked"}
              </p>
            )}

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

            <div className="list" style={{ marginTop: "1rem" }}>
              {tabroomEvents.map((event) => (
                <a
                  key={event.id}
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="list-item"
                >
                  <strong>{event.name}</strong>
                  <span className="meta-line">
                    {event.result} • {new Date(event.date).toLocaleDateString()}
                  </span>
                </a>
              ))}
            </div>
          </article>
        </section>
      </section>
    </>
  );
};
