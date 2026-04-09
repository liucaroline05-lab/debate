import { useMemo, useState } from "react";
import { PageMeta } from "@/components/common/PageMeta";
import { channels, posts } from "@/data/mockData";
import { useFirebaseCollection } from "@/hooks/useFirebaseCollection";

type ForumTab = "All Posts" | "Question" | "Speech Review" | "Tips & Strategies";

const forumTabs: Array<{ id: ForumTab; label: string }> = [
  { id: "All Posts", label: "All Posts" },
  { id: "Question", label: "Questions" },
  { id: "Speech Review", label: "Speech Reviews" },
  { id: "Tips & Strategies", label: "Tips & Strategies" },
];

const channelAccentClass = (accent?: string) => {
  switch (accent) {
    case "gold":
      return "forum-channel-badge is-gold";
    case "terracotta":
      return "forum-channel-badge is-terracotta";
    case "sand":
      return "forum-channel-badge is-sand";
    default:
      return "forum-channel-badge is-sage";
  }
};

export const CommunityPage = () => {
  const [activeTab, setActiveTab] = useState<ForumTab>("All Posts");
  const channelState = useFirebaseCollection("channels", channels);
  const postState = useFirebaseCollection("posts", posts);

  const filteredPosts = useMemo(
    () =>
      postState.data.filter((post) =>
        activeTab === "All Posts" ? true : post.category === activeTab,
      ),
    [activeTab, postState.data],
  );

  const practiceGroups = useMemo(
    () =>
      channelState.data.filter((channel) =>
        ["Practice Group", "Debate Type"].includes(channel.category ?? ""),
      ),
    [channelState.data],
  );

  const tournamentChannels = useMemo(
    () =>
      channelState.data.filter((channel) =>
        ["Tournament", "School"].includes(channel.category ?? ""),
      ),
    [channelState.data],
  );

  const trendingTopics = [
    { label: "Mar/Apr LD Resolution Prep", postsThisWeek: 142 },
    { label: "NSDA Nationals Qualification Tips", postsThisWeek: 98 },
    { label: "AI Debate Tools — Help or Harm?", postsThisWeek: 76 },
    { label: "Overcoming Speech Anxiety", postsThisWeek: 65 },
  ];

  const topContributors = [
    { name: "Alex Chen", role: "Coach", points: "#1" },
    { name: "Maya Rivera", role: "PF Captain", points: "#2" },
    { name: "Coach Rodriguez", role: "Reviewer", points: "#3" },
  ];

  return (
    <>
      <PageMeta
        title="Community"
        description="A fuller forum experience for discussion, speech feedback, channels, tournaments, and school groups."
      />
      <header className="route-header">
        <div className="row-between">
          <div>
            <p className="eyebrow">Community</p>
            <h1>Connect, discuss, and grow with fellow speakers.</h1>
            <p>
              A forum-style community for questions, speech reviews, practice
              groups, school spaces, and tournament-specific channels.
            </p>
          </div>
          <button type="button" className="btn btn-primary">
            + New Post
          </button>
        </div>
      </header>

      <div className="forum-layout">
        <section className="forum-main">
          <div className="forum-tabs" role="tablist" aria-label="Community feed filters">
            {forumTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "forum-tab is-active" : "forum-tab"}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="stack">
            {filteredPosts.map((post) => {
              const channel = channelState.data.find((item) => item.id === post.channelId);

              return (
                <article key={post.id} className="forum-post-card">
                  <div className="forum-post-header">
                    <div className="forum-author-row">
                      <div className="forum-avatar">{post.author.charAt(0)}</div>
                      <div>
                        <strong>{post.author}</strong>
                        <div className="pill-row">
                          {post.authorRole ? <span className="forum-mini-pill">{post.authorRole}</span> : null}
                          {post.debateType ? <span className="forum-mini-pill subtle">{post.debateType}</span> : null}
                        </div>
                        <span className="meta-line">
                          {new Date(post.createdAt).toLocaleString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            month: "short",
                            day: "numeric",
                          })}
                          {channel ? ` • ${channel.name}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="forum-post-body">
                    <h2 className="forum-post-title">{post.title ?? "Community post"}</h2>
                    <p className="card-copy">{post.content}</p>

                    {post.attachmentTitle ? (
                      <div className="forum-attachment">
                        <div className="forum-play">Play</div>
                        <div>
                          <strong>{post.attachmentTitle}</strong>
                          <span className="meta-line">{post.attachmentMeta}</span>
                        </div>
                        {post.aiScoreLabel ? (
                          <span className="forum-attachment-score">{post.aiScoreLabel}</span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="forum-post-actions">
                      <span className="meta-line">♡ {post.likeCount ?? 0}</span>
                      <span className="meta-line">💬 {post.replyCount}</span>
                      <span className="meta-line">↗ {post.shareCount ?? 0}</span>
                      <span className="meta-line">🔖 Save</span>
                    </div>
                  </div>

                  {post.featuredReplyAuthor && post.featuredReplyPreview ? (
                    <div className="forum-reply-preview">
                      <strong>{post.featuredReplyAuthor}</strong>
                      <span className="meta-line">{post.featuredReplyPreview}</span>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="forum-sidebar">
          <article className="forum-sidebar-card">
            <h2>Practice Groups</h2>
            <div className="stack">
              {practiceGroups.map((channel) => (
                <div key={channel.id} className="forum-channel-row">
                  <div className={channelAccentClass(channel.accent)}>{channel.shortCode ?? "DB"}</div>
                  <div>
                    <strong>{channel.name}</strong>
                    <span className="meta-line">
                      {channel.memberCount ?? channel.followers} members • {channel.activityLabel ?? "Active recently"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost forum-sidebar-button">
              Browse All Groups
            </button>
          </article>

          <article className="forum-sidebar-card">
            <h2>School & Tournament Channels</h2>
            <div className="stack">
              {tournamentChannels.map((channel) => (
                <div key={channel.id} className="forum-channel-row">
                  <div className={channelAccentClass(channel.accent)}>{channel.shortCode ?? "CH"}</div>
                  <div>
                    <strong>{channel.name}</strong>
                    <span className="meta-line">
                      {channel.category} • {channel.activityLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="forum-sidebar-card">
            <h2>Trending Topics</h2>
            <div className="stack">
              {trendingTopics.map((topic, index) => (
                <div key={topic.label} className="forum-topic-row">
                  <span className="forum-topic-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{topic.label}</strong>
                    <span className="meta-line">{topic.postsThisWeek} posts this week</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="forum-sidebar-card">
            <h2>Top Contributors</h2>
            <div className="stack">
              {topContributors.map((person) => (
                <div key={person.name} className="forum-contributor-row">
                  <div className="forum-avatar">{person.name.charAt(0)}</div>
                  <div>
                    <strong>{person.name}</strong>
                    <span className="meta-line">{person.role}</span>
                  </div>
                  <span className="forum-rank">{person.points}</span>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </>
  );
};
