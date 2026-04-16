import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import {
  seededChannels,
  seededComments,
  seededFollows,
  seededPosts,
  seededUsers,
} from "@/data/firestoreSeeds";
import {
  addCommentToPost,
  createPost,
  deletePostById,
  incrementPostShareCount,
  reportPostById,
  togglePostReaction,
  updatePostContent,
} from "@/features/community/communityService";
import { useAuth } from "@/features/auth/AuthContext";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";

type ForumTab = "All Posts" | "Question" | "Speech Review" | "Tips & Strategies";
type FeedScope = "all" | "following";

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

const safeName = (value?: string | null, fallback = "Unknown Speaker") => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

const safeInitial = (value?: string | null) => safeName(value).charAt(0).toUpperCase();

export const CommunityPage = () => {
  const { currentUser } = useAuth();
  const author = currentUser;
  if (!author) {
    return null;
  }
  const authorName = safeName(author.displayName, "You");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeTab, setActiveTab] = useState<ForumTab>("All Posts");
  const [feedScope, setFeedScope] = useState<FeedScope>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [composer, setComposer] = useState({
    title: "",
    content: "",
    category: "All Posts" as ForumTab,
    debateType: "",
    channelId: "channel-community",
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const usersState = useSeededFirestoreCollection("users", seededUsers);
  const channelState = useSeededFirestoreCollection("channels", seededChannels);
  const postState = useSeededFirestoreCollection("posts", seededPosts);
  const commentState = useSeededFirestoreCollection("postComments", seededComments);
  const followsState = useSeededFirestoreCollection("follows", seededFollows);

  const followingIds = followsState.data
    .filter((follow) => follow.followerId === author.id)
    .map((follow) => follow.followingId);

  const filteredPosts = useMemo(() => {
    const loweredQuery = searchQuery.toLowerCase();

    return postState.data.filter((post) => {
      const channel = channelState.data.find((item) => item.id === post.channelId);
      const authorProfile = usersState.data.find((item) => item.id === post.authorId);

      const matchesFeed =
        feedScope === "all" ? true : followingIds.includes(post.authorId);
      const matchesCategory =
        activeTab === "All Posts" ? true : post.category === activeTab;
      const matchesQuery =
        loweredQuery.length === 0
          ? true
          : [
              post.title,
              post.content,
              post.author,
              post.debateType,
              channel?.name,
              authorProfile?.displayName,
            ]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(loweredQuery));

      return matchesFeed && matchesCategory && matchesQuery;
    });
  }, [
    activeTab,
    channelState.data,
    feedScope,
    followingIds,
    postState.data,
    searchQuery,
    usersState.data,
  ]);

  const practiceGroups = useMemo(
    () =>
      channelState.data.filter((channel) =>
        ["Practice Group", "Debate Type"].includes(channel.category ?? ""),
      ),
    [channelState.data],
  );

  const schoolAndTournamentChannels = useMemo(
    () =>
      channelState.data.filter((channel) =>
        ["Tournament", "School"].includes(channel.category ?? ""),
      ),
    [channelState.data],
  );

  const topContributors = useMemo(() => {
    const counts = postState.data.reduce<Record<string, number>>((accumulator, post) => {
      accumulator[post.authorId] = (accumulator[post.authorId] ?? 0) + 1;
      return accumulator;
    }, {});

    return usersState.data
      .map((user) => ({
        id: user.id,
        name: safeName(user.displayName),
        role: user.role,
        count: counts[user.id] ?? 0,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 3);
  }, [postState.data, usersState.data]);

  const trendingTopics = useMemo(() => {
    const counts = postState.data.reduce<Record<string, number>>((accumulator, post) => {
      const key = post.debateType || post.category || "Community";
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([label, count]) => ({ label, postsThisWeek: count }))
      .sort((left, right) => right.postsThisWeek - left.postsThisWeek)
      .slice(0, 4);
  }, [postState.data]);

  const createNewPost = async () => {
    if (!composer.content.trim()) {
      setMessage("Write something before posting.");
      return;
    }

    try {
      await createPost({
        authorId: author.id,
        author: authorName,
        authorRole: author.role,
        category: composer.category,
        debateType: composer.debateType || undefined,
        channelId: composer.channelId,
        title: composer.title || "Community update",
        content: composer.content,
      });
      setComposer((current) => ({
        ...current,
        title: "",
        content: "",
        debateType: "",
      }));
      setMessage("Post published.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish post.");
    }
  };

  const submitComment = async (postId: string) => {
    const content = commentDrafts[postId]?.trim();
    if (!content) {
      return;
    }

    try {
      await addCommentToPost(postId, author.id, authorName, content);
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add comment.");
    }
  };

  const sharePost = async (postId: string, shareCount = 0) => {
    try {
      await incrementPostShareCount(postId, shareCount);
      await navigator.clipboard.writeText(`${window.location.origin}/app/community#${postId}`);
      setMessage("Post link copied.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to share post.");
    }
  };

  const editPost = async (postId: string, currentTitle?: string, currentContent?: string, currentCategory?: ForumTab, currentDebateType?: string) => {
    const nextTitle = window.prompt("Edit post title", currentTitle ?? "");
    if (nextTitle === null) {
      return;
    }

    const nextContent = window.prompt("Edit post content", currentContent ?? "");
    if (nextContent === null) {
      return;
    }

    try {
      await updatePostContent(postId, {
        title: nextTitle,
        content: nextContent,
        category: currentCategory,
        debateType: currentDebateType,
      });
      setMenuPostId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to edit post.");
    }
  };

  return (
    <>
      <PageMeta
        title="Community"
        description="A Firestore-backed forum for debate discussion, speech reviews, following, and profile discovery."
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
          <button
            type="button"
            className="btn btn-primary forum-primary-cta"
            onClick={() => composerRef.current?.focus()}
          >
            New Post
          </button>
        </div>
      </header>

      <div className="forum-layout">
        <section className="forum-main">
          <article className="forum-composer-card">
            <div className="forum-author-row">
              {author.avatarUrl ? (
                <img
                  src={author.avatarUrl}
                  alt={`${authorName} avatar`}
                  className="forum-avatar"
                />
              ) : (
                <div className="forum-avatar">{safeInitial(author.displayName)}</div>
              )}
              <div className="space-apart">
                <strong>{authorName}</strong>
                <span className="meta-line">Share a round thought, question, or review request.</span>
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <div className="form-field full">
                <label htmlFor="postTitle">Title</label>
                <input
                  id="postTitle"
                  value={composer.title}
                  onChange={(event) =>
                    setComposer((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="What do you want to ask or share?"
                />
              </div>
              <div className="form-field full">
                <label htmlFor="postContent">Post</label>
                <textarea
                  id="postContent"
                  ref={composerRef}
                  value={composer.content}
                  onChange={(event) =>
                    setComposer((current) => ({ ...current, content: event.target.value }))
                  }
                  placeholder="Start the conversation..."
                />
              </div>
              <div className="form-field">
                <label htmlFor="postCategory">Category</label>
                <select
                  id="postCategory"
                  value={composer.category}
                  onChange={(event) =>
                    setComposer((current) => ({
                      ...current,
                      category: event.target.value as ForumTab,
                    }))
                  }
                >
                  <option>All Posts</option>
                  <option>Question</option>
                  <option>Speech Review</option>
                  <option>Tips & Strategies</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="postChannel">Channel</label>
                <select
                  id="postChannel"
                  value={composer.channelId}
                  onChange={(event) =>
                    setComposer((current) => ({ ...current, channelId: event.target.value }))
                  }
                >
                  {channelState.data.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="forum-composer-footer">
              {message ? <span className="meta-line">{message}</span> : <span className="meta-line">placeholder.</span>}
              <div className="button-row">
                <button type="button" className="btn btn-primary forum-primary-cta" onClick={() => void createNewPost()}>
                  Publish Post
                </button>
              </div>
            </div>
          </article>

          <div className="forum-toolbar">
            <label className="forum-search" htmlFor="communitySearch">
              <Search size={18} />
              <input
                id="communitySearch"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search posts, users, channels, or topics"
              />
            </label>

            <div className="forum-feed-toggle">
              <button
                type="button"
                className={feedScope === "all" ? "forum-scope-button is-active" : "forum-scope-button"}
                onClick={() => setFeedScope("all")}
              >
                All
              </button>
              <button
                type="button"
                className={feedScope === "following" ? "forum-scope-button is-active" : "forum-scope-button"}
                onClick={() => setFeedScope("following")}
              >
                Following
              </button>
            </div>
          </div>

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
              const authorProfile = usersState.data.find((item) => item.id === post.authorId);
              const postAuthorName = safeName(authorProfile?.displayName ?? post.author);
              const comments = commentState.data.filter((entry) => entry.postId === post.id);
              const isOwner = author.id === post.authorId;

              return (
                <article key={post.id} className="forum-post-card" id={post.id}>
                  <div className="forum-post-header">
                    <div className="forum-author-row">
                      <Link to={`/app/users/${post.authorId}`} className="forum-author-link">
                        {authorProfile?.avatarUrl ? (
                          <img
                            src={authorProfile.avatarUrl}
                            alt={`${postAuthorName} avatar`}
                            className="forum-avatar"
                          />
                        ) : (
                          <div className="forum-avatar">{safeInitial(postAuthorName)}</div>
                        )}
                      </Link>
                      <div>
                        <Link to={`/app/users/${post.authorId}`} className="forum-author-link">
                          <strong>{postAuthorName}</strong>
                        </Link>
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

                    <div className="forum-post-menu">
                      <button type="button" className="forum-icon-button" onClick={() => setMenuPostId(menuPostId === post.id ? null : post.id)}>
                        <MoreHorizontal size={18} />
                      </button>
                      {menuPostId === post.id ? (
                        <div className="forum-menu-dropdown">
                          {isOwner ? (
                            <>
                              <button
                                type="button"
                                className="forum-menu-item"
                                onClick={() => void editPost(post.id, post.title, post.content, post.category as ForumTab, post.debateType)}
                              >
                                <Pencil size={16} /> Edit
                              </button>
                              <button
                                type="button"
                                className="forum-menu-item"
                                onClick={() => void deletePostById(post.id).then(() => setMenuPostId(null))}
                              >
                                <Trash2 size={16} /> Delete
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="forum-menu-item"
                            onClick={() => void reportPostById(post.id).then(() => setMenuPostId(null))}
                          >
                            <Flag size={16} /> Report
                          </button>
                        </div>
                      ) : null}
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
                      <button
                        type="button"
                        className="forum-action-button"
                        onClick={() => void togglePostReaction(post.id, author.id, "like")}
                      >
                        <ThumbsUp size={16} /> {post.likeCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className="forum-action-button"
                        onClick={() => void togglePostReaction(post.id, author.id, "dislike")}
                      >
                        <ThumbsDown size={16} /> {post.dislikeCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className="forum-action-button"
                        onClick={() => void togglePostReaction(post.id, author.id, "favorite")}
                      >
                        <Bookmark size={16} /> {post.favoriteCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className="forum-action-button"
                        onClick={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)}
                      >
                        <MessageCircle size={16} /> {comments.length}
                      </button>
                      <button
                        type="button"
                        className="forum-action-button"
                        onClick={() => void sharePost(post.id, post.shareCount)}
                      >
                        <Share2 size={16} /> {post.shareCount ?? 0}
                      </button>
                    </div>
                  </div>

                  {expandedPostId === post.id ? (
                    <div className="forum-comments-panel">
                      <div className="stack">
                        {comments.map((comment) => (
                          <div key={comment.id} className="forum-comment-item">
                            <Link to={`/app/users/${comment.authorId}`} className="forum-author-link">
                              <strong>{safeName(comment.authorName)}</strong>
                            </Link>
                            <span className="meta-line">
                              {new Date(comment.createdAt).toLocaleString([], {
                                hour: "numeric",
                                minute: "2-digit",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            <p className="card-copy">{comment.content}</p>
                          </div>
                        ))}
                      </div>

                      <div className="forum-comment-form">
                        <input
                          value={commentDrafts[post.id] ?? ""}
                          onChange={(event) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [post.id]: event.target.value,
                            }))
                          }
                          placeholder="Write a comment..."
                        />
                        <button type="button" className="btn btn-secondary" onClick={() => void submitComment(post.id)}>
                          Reply
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}

            {filteredPosts.length === 0 ? (
              <div className="empty-state">
                <h2 className="card-title">No posts match this view</h2>
                <p className="card-copy">
                  Try broadening the search, switching feed scope, or making the first post.
                </p>
              </div>
            ) : null}
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
              {schoolAndTournamentChannels.map((channel) => (
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
              {topContributors.map((person, index) => (
                <Link key={person.id} to={`/app/users/${person.id}`} className="forum-contributor-row">
                  <div className="forum-avatar">{safeInitial(person.name)}</div>
                  <div>
                    <strong>{safeName(person.name)}</strong>
                    <span className="meta-line">{person.role}</span>
                  </div>
                  <span className="forum-rank">#{index + 1}</span>
                </Link>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </>
  );
};
