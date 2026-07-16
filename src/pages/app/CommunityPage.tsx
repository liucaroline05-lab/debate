import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bookmark,
  Check,
  Download,
  FileText,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
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
  createPracticeGroup,
  createPost,
  deletePostById,
  incrementPostShareCount,
  joinPracticeGroupByCode,
  reportPostById,
  togglePostReaction,
  updatePostContent,
} from "@/features/community/communityService";
import { useAuth } from "@/features/auth/AuthContext";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { UserProfile } from "@/types/models";

type ForumTab = "All Posts" | "Question" | "Speech Review" | "Tips & Strategies";
type FeedScope = "all" | "following";

interface PostReaction {
  id: string;
  postId: string;
  userId: string;
  like?: boolean;
  dislike?: boolean;
  favorite?: boolean;
}

// Stable reference so the seeded-collection hook does not re-subscribe each render.
const EMPTY_REACTIONS: PostReaction[] = [];

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

interface ProfileHoverLinkProps {
  user: UserProfile | undefined;
  userId: string;
  name: string;
  children: ReactNode;
  className?: string;
}

const ProfileHoverLink = ({
  user,
  userId,
  name,
  children,
  className,
}: ProfileHoverLinkProps) => (
  <span className="profile-hover-wrap">
    <Link to={`/app/users/${userId}`} className={className ?? "forum-author-link"}>
      {children}
    </Link>
    <span className="profile-hover-card" role="status">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={`${name} avatar`} className="profile-hover-avatar" />
      ) : (
        <span className="profile-hover-avatar profile-hover-avatar-fallback" aria-hidden="true">
          {safeInitial(name)}
        </span>
      )}
      <span className="profile-hover-content">
        <strong>{name}</strong>
        <span className="pill-row">
          <span className="forum-mini-pill">{user?.role ?? "member"}</span>
          {user?.username ? <span className="forum-mini-pill subtle">@{user.username}</span> : null}
        </span>
        <span className="profile-hover-bio">
          {user?.bio?.trim() || "This member has not added a bio yet."}
        </span>
      </span>
    </span>
  </span>
);

export const CommunityPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedChannelId = searchParams.get("channel");
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
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupInviteNotice, setGroupInviteNotice] = useState("");
  const [groupJoinCode, setGroupJoinCode] = useState("");
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    visibility: "public" as "public" | "private",
  });
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
  const reactionState = useSeededFirestoreCollection<PostReaction>("postReactions", EMPTY_REACTIONS);

  const myReactions = useMemo(() => {
    const map = new Map<string, PostReaction>();
    reactionState.data.forEach((reaction) => {
      if (reaction.userId === author.id) {
        map.set(reaction.postId, reaction);
      }
    });
    return map;
  }, [reactionState.data, author.id]);

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
      const matchesChannel = selectedChannelId ? post.channelId === selectedChannelId : true;
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

      return matchesFeed && matchesCategory && matchesChannel && matchesQuery;
    });
  }, [
    activeTab,
    channelState.data,
    feedScope,
    followingIds,
    postState.data,
    searchQuery,
    selectedChannelId,
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
        files: composerFiles,
      });
      setComposer((current) => ({
        ...current,
        title: "",
        content: "",
        debateType: "",
      }));
      setIsComposerOpen(false);
      setComposerFiles([]);
      setMessage("Post published.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish post.");
    }
  };

  const submitPracticeGroup = async () => {
    try {
      const result = await createPracticeGroup({
        ...groupForm,
        creatorId: author.id,
      });
      setGroupInviteNotice(
        result.inviteCode
          ? `Group created. Share invite code ${result.inviteCode}.`
          : "Practice group created.",
      );
      setGroupForm({ name: "", description: "", visibility: "public" });
      setIsGroupModalOpen(false);
    } catch (error) {
      setGroupInviteNotice(error instanceof Error ? error.message : "Unable to create group.");
    }
  };

  const joinPracticeGroup = async () => {
    try {
      const groupName = await joinPracticeGroupByCode(groupJoinCode, author.id);
      setGroupInviteNotice(`Joined ${groupName}.`);
      setGroupJoinCode("");
    } catch (error) {
      setGroupInviteNotice(error instanceof Error ? error.message : "Unable to join group.");
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

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    // Fallback for browsers/non-secure contexts without the async clipboard API.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  const sharePost = async (postId: string, shareCount = 0) => {
    const url = `${window.location.origin}/app/community#${postId}`;

    try {
      if (navigator.share) {
        // Native share sheet (mobile / supported desktops).
        await navigator.share({ title: "Debate Studio community post", url });
      } else {
        await copyToClipboard(url);
        setSharedPostId(postId);
        window.setTimeout(
          () => setSharedPostId((current) => (current === postId ? null : current)),
          2000,
        );
      }
    } catch (error) {
      // The user dismissing the native share sheet is not an error.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessage("Unable to share this post right now.");
      return;
    }

    // Best-effort: record the share without blocking or breaking the copy above.
    void incrementPostShareCount(postId, shareCount).catch(() => {});
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
            onClick={() => {
              setIsComposerOpen(true);
              window.setTimeout(() => composerRef.current?.focus(), 180);
            }}
          >
            New Post
          </button>
        </div>
      </header>

      <div className="forum-layout">
        <section className="forum-main">
          {isComposerOpen ? (
          <article className="forum-composer-card composer-slide-down">
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
              <div className="form-field full">
                <label htmlFor="postFiles">Media and files</label>
                <div className="file-input-shell forum-file-input">
                  <input
                    id="postFiles"
                    type="file"
                    multiple
                    className="file-input-native"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.csv"
                    onChange={(event) => setComposerFiles(Array.from(event.target.files ?? []))}
                  />
                  <label htmlFor="postFiles" className="file-input-trigger">
                    <Paperclip size={16} /> Add media or files
                  </label>
                  <span className={composerFiles.length ? "file-input-name has-file" : "file-input-name"}>
                    {composerFiles.length
                      ? `${composerFiles.length} file${composerFiles.length === 1 ? "" : "s"} selected`
                      : "Images, video, audio, PDFs, Word files, and more"}
                  </span>
                </div>
                {composerFiles.length ? (
                  <div className="forum-selected-files">
                    {composerFiles.map((file) => <span key={`${file.name}-${file.size}`} className="pill">{file.name}</span>)}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="forum-composer-footer">
              {message ? <span className="meta-line">{message}</span> : <span className="meta-line">Attach media or files if they help tell the story.</span>}
              <div className="button-row">
                <button type="button" className="btn btn-secondary" onClick={() => setIsComposerOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary forum-primary-cta" onClick={() => void createNewPost()}>
                  Publish Post
                </button>
              </div>
            </div>
          </article>
          ) : null}

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
          {selectedChannelId ? (
            <div className="debate-banner">
              Showing {channelState.data.find((channel) => channel.id === selectedChannelId)?.name ?? "selected channel"}
              <button type="button" className="forum-icon-button" aria-label="Clear channel filter" onClick={() => setSearchParams({})}>×</button>
            </div>
          ) : null}

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
              const reaction = myReactions.get(post.id);
              const liked = reaction?.like ?? false;
              const disliked = reaction?.dislike ?? false;
              const favorited = reaction?.favorite ?? false;
              const isCommentsOpen = expandedPostId === post.id;
              const hasCommented = comments.some((entry) => entry.authorId === author.id);
              const justShared = sharedPostId === post.id;

              return (
                <article key={post.id} className="forum-post-card" id={post.id}>
                  <div className="forum-post-header">
                    <div className="forum-author-row">
                      <ProfileHoverLink
                        user={authorProfile}
                        userId={post.authorId}
                        name={postAuthorName}
                        className="forum-author-link"
                      >
                        {authorProfile?.avatarUrl ? (
                          <img
                            src={authorProfile.avatarUrl}
                            alt={`${postAuthorName} avatar`}
                            className="forum-avatar"
                          />
                        ) : (
                          <div className="forum-avatar">{safeInitial(postAuthorName)}</div>
                        )}
                      </ProfileHoverLink>
                      <div>
                        <ProfileHoverLink
                          user={authorProfile}
                          userId={post.authorId}
                          name={postAuthorName}
                          className="forum-author-link"
                        >
                          <strong>{postAuthorName}</strong>
                        </ProfileHoverLink>
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

                    {post.attachments?.length ? (
                      <div className="forum-attachment-grid">
                        {post.attachments.map((attachment) => (
                          <div key={attachment.storagePath} className="forum-uploaded-attachment">
                            {attachment.kind === "image" ? (
                              <img src={attachment.url} alt={attachment.name} />
                            ) : attachment.kind === "video" ? (
                              <video controls preload="metadata" src={attachment.url} />
                            ) : attachment.kind === "audio" ? (
                              <audio controls preload="metadata" src={attachment.url} />
                            ) : (
                              <FileText size={28} aria-hidden="true" />
                            )}
                            <div>
                              <strong>{attachment.name}</strong>
                              <span className="meta-line">{Math.max(1, Math.round(attachment.size / 1024))} KB</span>
                            </div>
                            <a
                              className="forum-icon-button"
                              href={attachment.url}
                              download={attachment.name}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Download ${attachment.name}`}
                            >
                              <Download size={17} />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="forum-post-actions">
                      <button
                        type="button"
                        className={liked ? "forum-action-button is-like" : "forum-action-button"}
                        aria-pressed={liked}
                        onClick={() => void togglePostReaction(post.id, author.id, "like")}
                      >
                        <ThumbsUp size={16} /> {post.likeCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className={disliked ? "forum-action-button is-dislike" : "forum-action-button"}
                        aria-pressed={disliked}
                        onClick={() => void togglePostReaction(post.id, author.id, "dislike")}
                      >
                        <ThumbsDown size={16} /> {post.dislikeCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className={favorited ? "forum-action-button is-favorite" : "forum-action-button"}
                        aria-pressed={favorited}
                        onClick={() => void togglePostReaction(post.id, author.id, "favorite")}
                      >
                        <Bookmark size={16} /> {post.favoriteCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className={
                          isCommentsOpen || hasCommented
                            ? "forum-action-button is-comment"
                            : "forum-action-button"
                        }
                        aria-pressed={isCommentsOpen}
                        onClick={() => setExpandedPostId(isCommentsOpen ? null : post.id)}
                      >
                        <MessageCircle size={16} /> {comments.length}
                      </button>
                      <button
                        type="button"
                        className={justShared ? "forum-action-button is-share" : "forum-action-button"}
                        onClick={() => void sharePost(post.id, post.shareCount)}
                      >
                        {justShared ? <Check size={16} /> : <Share2 size={16} />}{" "}
                        {justShared ? "Copied" : post.shareCount ?? 0}
                      </button>
                    </div>
                  </div>

                  {expandedPostId === post.id ? (
                    <div className="forum-comments-panel">
                      <div className="stack">
                        {comments.map((comment) => (
                          <div key={comment.id} className="forum-comment-item">
                            <ProfileHoverLink
                              user={usersState.data.find((item) => item.id === comment.authorId)}
                              userId={comment.authorId}
                              name={safeName(comment.authorName)}
                              className="forum-author-link"
                            >
                              <strong>{safeName(comment.authorName)}</strong>
                            </ProfileHoverLink>
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
              <button
                type="button"
                className="forum-channel-row forum-create-group-row"
                onClick={() => {
                  setGroupInviteNotice("");
                  setIsGroupModalOpen(true);
                }}
              >
                <span className="forum-channel-badge forum-create-group-icon"><Plus size={20} /></span>
                <span><strong>Create Group</strong><span className="meta-line">Start a public or private practice space</span></span>
              </button>
              {practiceGroups.map((channel) => (
                <Link key={channel.id} to={`/app/community?channel=${channel.id}`} className="forum-channel-row dashboard-list-link">
                  <div className={channelAccentClass(channel.accent)}>{channel.shortCode ?? "DB"}</div>
                  <div>
                    <strong>{channel.name}</strong>
                    <span className="meta-line">
                      {channel.memberCount ?? channel.followers} members • {channel.activityLabel ?? "Active recently"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="debate-join-row forum-group-join">
              <input
                aria-label="Practice group invite code"
                value={groupJoinCode}
                onChange={(event) => setGroupJoinCode(event.target.value.toUpperCase())}
                placeholder="Private group code"
              />
              <button type="button" className="btn btn-ghost" onClick={() => void joinPracticeGroup()}>Join</button>
            </div>
            {groupInviteNotice ? <p className="meta-line" role="status">{groupInviteNotice}</p> : null}
          </article>

          <article className="forum-sidebar-card">
            <h2>School & Tournament Channels</h2>
            <div className="stack">
              {schoolAndTournamentChannels.map((channel) => (
                <Link key={channel.id} to={`/app/community?channel=${channel.id}`} className="forum-channel-row dashboard-list-link">
                  <div className={channelAccentClass(channel.accent)}>{channel.shortCode ?? "CH"}</div>
                  <div>
                    <strong>{channel.name}</strong>
                    <span className="meta-line">
                      {channel.category} • {channel.activityLabel}
                    </span>
                  </div>
                </Link>
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
                <ProfileHoverLink
                  key={person.id}
                  user={usersState.data.find((item) => item.id === person.id)}
                  userId={person.id}
                  name={person.name}
                  className="forum-contributor-row"
                >
                  <div className="forum-avatar">{safeInitial(person.name)}</div>
                  <div>
                    <strong>{safeName(person.name)}</strong>
                    <span className="meta-line">{person.role}</span>
                  </div>
                  <span className="forum-rank">#{index + 1}</span>
                </ProfileHoverLink>
              ))}
            </div>
          </article>
        </aside>
      </div>

      {isGroupModalOpen ? (
        <div className="community-modal-overlay" role="presentation" onMouseDown={() => setIsGroupModalOpen(false)}>
          <section
            className="community-modal app-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="createGroupTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="row-between">
              <div>
                <p className="eyebrow">Practice groups</p>
                <h2 id="createGroupTitle" className="card-title">Create a practice group</h2>
              </div>
              <button type="button" className="forum-icon-button" aria-label="Close group form" onClick={() => setIsGroupModalOpen(false)}>×</button>
            </div>
            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <div className="form-field full">
                <label htmlFor="practiceGroupName">Name</label>
                <input
                  id="practiceGroupName"
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Weekly PF drills"
                />
              </div>
              <div className="form-field full">
                <label htmlFor="practiceGroupDescription">Description</label>
                <textarea
                  id="practiceGroupDescription"
                  value={groupForm.description}
                  onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What will members practice together?"
                />
              </div>
              <div className="form-field full">
                <label htmlFor="practiceGroupVisibility">Who can join?</label>
                <select
                  id="practiceGroupVisibility"
                  value={groupForm.visibility}
                  onChange={(event) => setGroupForm((current) => ({
                    ...current,
                    visibility: event.target.value as "public" | "private",
                  }))}
                >
                  <option value="public">Public — anyone can discover it</option>
                  <option value="private">Private — invite code required</option>
                </select>
              </div>
            </div>
            {groupForm.visibility === "private" ? (
              <p className="helper-line">An invite code will be generated after the group is created.</p>
            ) : null}
            <div className="button-row community-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsGroupModalOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void submitPracticeGroup()}>Create group</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
