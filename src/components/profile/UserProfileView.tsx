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
import { updateUserBio, requestTabroomSync, toggleFollowUser } from "@/features/profile/profileService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { UserProfile } from "@/types/models";

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

const defaultStats = {
  wins: 0,
  losses: 0,
  averageScore: 0,
  winRate: 0,
  totalRounds: 0,
  performanceOverTime: [],
  formatBreakdown: [],
  topicStrengths: [],
};

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
  const { currentUser } = useAuth();
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
      return (userFromCollection ?? currentUser ?? null) as UserProfile | null;
    }

    return userFromCollection ?? null;
  }, [currentUser, isOwnProfile, userId, usersState.data]);

  const profileName = safeName(profile?.displayName);

  const [bioDraft, setBioDraft] = useState(profile?.bio ?? "");
  const [tabroomDraft, setTabroomDraft] = useState(
    profile?.tabroomProfileUrl ?? "",
  );
  const [handleDraft, setHandleDraft] = useState(
    safeHandle(profile?.username, profile?.displayName),
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!profile) {
      return;
    }

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
        debate.participantIds?.includes(userId),
      ),
    [debatesState.data, userId],
  );
  const activeChannelIds = [
    ...new Set([
      ...membershipsState.data
        .filter((membership) => membership.userId === userId)
        .map((membership) => membership.channelId),
      ...(profile?.activeChannelIds ?? []),
    ]),
  ];
  const activeChannels = channelsState.data.filter((channel) =>
    activeChannelIds.includes(channel.id),
  );
  const stats =
    statsState.data.find((entry) => entry.userId === userId) ?? defaultStats;
  const tabroomLink = tabroomLinksState.data.find((entry) => entry.userId === userId);
  const tabroomImport = tabroomImportsState.data.find((entry) => entry.userId === userId);
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

  const saveBio = async () => {
    if (!currentUser) {
      return;
    }

    try {
      await updateUserBio(currentUser.id, bioDraft);
      setMessage("Bio saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save bio.");
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
      await requestTabroomSync(currentUser.id, tabroomDraft, handleDraft);
      setMessage("Tabroom sync requested.");
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
                  <textarea
                    className="profile-bio-input"
                    value={bioDraft}
                    onChange={(event) => setBioDraft(event.target.value)}
                  />
                  <div className="button-row">
                    <button type="button" className="btn btn-primary" onClick={() => void saveBio()}>
                      Save bio
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
            <h2 className="card-title">Performance over time</h2>
            <div className="chart-panel">
              <Bar
                key={`profile-performance-${userId}`}
                redraw
                data={performanceData}
                options={chartOptions}
              />
            </div>
          </article>

          <article className="app-card">
            <h2 className="card-title">Topic strengths</h2>
            <div className="chart-panel">
              <Radar
                key={`profile-radar-${userId}`}
                redraw
                data={radarData}
                options={radarOptions}
              />
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

          <article className="app-card">
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
                  <label htmlFor="tabroomHandle">Tabroom handle</label>
                  <input
                    id="tabroomHandle"
                    value={handleDraft}
                    onChange={(event) => setHandleDraft(event.target.value)}
                    placeholder="your_tabroom_handle"
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

            <div className="list" style={{ marginTop: "1rem" }}>
              {tabroomImport?.events.map((event) => (
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
