import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import {
  Bookmark,
  Check,
  CornerDownRight,
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
  toggleCommentReaction,
  togglePostReaction,
  updatePostContent,
} from "@/features/community/communityService";
import { useAuth } from "@/features/auth/AuthContext";
import { ShareToMessageDialog } from "@/features/messages/ShareToMessageDialog";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { CommunityPost, PostComment, PostCommentReaction, UserBlock, UserProfile } from "@/types/models";

type ForumTab = "All Posts" | "Saved" | "Question" | "Speech Review" | "Tips & Strategies";
type PostCategory = Exclude<ForumTab, "Saved">;
type FeedScope = "all" | "following";

interface PostReaction {
  id: string;
  postId: string;
  userId: string;
  like?: boolean;
  dislike?: boolean;
  favorite?: boolean;
}

// Stable references so the seeded-collection hook does not re-subscribe each render.
const EMPTY_REACTIONS: PostReaction[] = [];
const EMPTY_COMMENT_REACTIONS: PostCommentReaction[] = [];
const MAX_COMMENT_DEPTH = 4;

const forumTabs: Array<{ id: ForumTab; label: string }> = [
  { id: "All Posts", label: "All Posts" },
  { id: "Saved", label: "Saved" },
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

const byOldestFirst = (left: PostComment, right: PostComment) =>
  left.createdAt.localeCompare(right.createdAt);

/**
 * Groups a post's flat comment list into roots and replies. A reply whose
 * parent is missing (deleted, or not loaded yet) is shown as a root so it is
 * never silently dropped.
 */
const buildCommentTree = (comments: PostComment[]) => {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const repliesByParentId = new Map<string, PostComment[]>();
  const roots: PostComment[] = [];

  [...comments].sort(byOldestFirst).forEach((comment) => {
    const parentId = comment.parentCommentId;
    if (parentId && byId.has(parentId)) {
      const siblings = repliesByParentId.get(parentId) ?? [];
      siblings.push(comment);
      repliesByParentId.set(parentId, siblings);
      return;
    }
    roots.push(comment);
  });

  return { roots, repliesByParentId };
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
  const selectedPostId = searchParams.get("post");
  const { currentUser } = useAuth();
  const author = currentUser;
  if (!author) {
    return null;
  }
  const authorName = safeName(author.displayName, "You");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [postContentMissing, setPostContentMissing] = useState(false);
  const [activeTab, setActiveTab] = useState<ForumTab>("All Posts");
  const [feedScope, setFeedScope] = useState<FeedScope>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    title: string;
    url: string;
    media: Array<{ kind: "image" | "video"; url: string; name: string }>;
    mediaCount: number;
  } | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupInviteNotice, setGroupInviteNotice] = useState("");
  const [groupJoinCode, setGroupJoinCode] = useState("");
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    visibility: "public" as "public" | "private",
    category: "Practice Group" as "Tournament" | "School" | "Practice Group",
  });
  const [message, setMessage] = useState("");
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, Pick<PostReaction, "like" | "dislike" | "favorite">>>({});
  const [composer, setComposer] = useState({
    title: "",
    content: "",
    category: "All Posts" as ForumTab,
    debateType: "",
    topicTags: "",
    channelId: "channel-community",
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [commentVoteOverrides, setCommentVoteOverrides] = useState<
    Record<string, { like: boolean; dislike: boolean }>
  >({});

  const usersState = useSeededFirestoreCollection("users", seededUsers);
  const channelState = useSeededFirestoreCollection("channels", seededChannels);
  const postState = useSeededFirestoreCollection("posts", seededPosts);
  const commentState = useSeededFirestoreCollection("postComments", seededComments);
  const followsState = useSeededFirestoreCollection("follows", seededFollows);
  const blockConstraints = useMemo<QueryConstraint[]>(() => [where("blockerId", "==", author.id)], [author.id]);
  const blocksState = useSeededFirestoreCollection<UserBlock>("userBlocks", [], blockConstraints, true, `user-blocks:${author.id}`);
  const reactionState = useSeededFirestoreCollection<PostReaction>("postReactions", EMPTY_REACTIONS);
  const commentReactionState = useSeededFirestoreCollection<PostCommentReaction>(
    "postCommentReactions",
    EMPTY_COMMENT_REACTIONS,
  );

  const myCommentVotes = useMemo(() => {
    const map = new Map<string, { like: boolean; dislike: boolean }>();
    commentReactionState.data.forEach((reaction) => {
      if (reaction.userId === author.id) {
        map.set(reaction.commentId, {
          like: Boolean(reaction.like),
          dislike: Boolean(reaction.dislike),
        });
      }
    });
    return map;
  }, [commentReactionState.data, author.id]);

  const getMyCommentVote = useCallback(
    (commentId: string) =>
      commentVoteOverrides[commentId]
      ?? myCommentVotes.get(commentId)
      ?? { like: false, dislike: false },
    [commentVoteOverrides, myCommentVotes],
  );

  const myReactions = useMemo(() => {
    const map = new Map<string, PostReaction>();
    reactionState.data.forEach((reaction) => {
      if (reaction.userId === author.id) {
        map.set(reaction.postId, reaction);
      }
    });
    return map;
  }, [reactionState.data, author.id]);

  const getMyReaction = useCallback(
    (postId: string): Pick<PostReaction, "like" | "dislike" | "favorite"> => {
      const persisted = myReactions.get(postId);
      const override = reactionOverrides[postId];
      return {
        like: override?.like ?? persisted?.like ?? false,
        dislike: override?.dislike ?? persisted?.dislike ?? false,
        favorite: override?.favorite ?? persisted?.favorite ?? false,
      };
    },
    [myReactions, reactionOverrides],
  );

  useEffect(() => {
    setReactionOverrides((current) => {
      let next = current;
      Object.entries(current).forEach(([postId, override]) => {
        const persisted = myReactions.get(postId);
        if (!persisted) return;
        const matches = override.like === Boolean(persisted.like)
          && override.dislike === Boolean(persisted.dislike)
          && override.favorite === Boolean(persisted.favorite);
        if (matches) {
          if (next === current) next = { ...current };
          delete next[postId];
        }
      });
      return next;
    });
  }, [myReactions]);

  useEffect(() => {
    setCommentVoteOverrides((current) => {
      let next = current;
      Object.entries(current).forEach(([commentId, override]) => {
        const persisted = myCommentVotes.get(commentId);
        if (!persisted) return;
        if (persisted.like === override.like && persisted.dislike === override.dislike) {
          if (next === current) next = { ...current };
          delete next[commentId];
        }
      });
      return next;
    });
  }, [myCommentVotes]);

  const blockedIds = useMemo(() => new Set(blocksState.data.map((block) => block.blockedId)), [blocksState.data]);
  const followingIds = followsState.data
    .filter((follow) => follow.followerId === author.id)
    .map((follow) => follow.followingId)
    .filter((id) => !blockedIds.has(id));

  const filteredPosts = useMemo(() => {
    const loweredQuery = searchQuery.toLowerCase();

    return postState.data.filter((post) => {
      if (blockedIds.has(post.authorId)) return false;
      const channel = channelState.data.find((item) => item.id === post.channelId);
      const authorProfile = usersState.data.find((item) => item.id === post.authorId);

      const matchesFeed =
        feedScope === "all" ? true : followingIds.includes(post.authorId);
      const matchesCategory =
        activeTab === "All Posts" ? true : activeTab === "Saved" ? getMyReaction(post.id).favorite === true : post.category === activeTab;
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
    blockedIds,
    channelState.data,
    feedScope,
    followingIds,
    getMyReaction,
    postState.data,
    searchQuery,
    selectedChannelId,
    usersState.data,
  ]);

  useEffect(() => {
    if (!selectedPostId || !postState.data.some((post) => post.id === selectedPostId)) return;
    setActiveTab("All Posts");
    setFeedScope("all");
    setSearchQuery("");
    const timer = window.setTimeout(() => {
      document.getElementById(selectedPostId)?.scrollIntoView({ block: "center" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedPostId, postState.data]);

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
      const createdAt = new Date(post.createdAt).getTime();
      if (!Number.isFinite(createdAt) || createdAt < Date.now() - 7 * 24 * 60 * 60 * 1000) {
        return accumulator;
      }
      const topics = post.topicTags?.length
        ? post.topicTags
        : [post.debateType || post.category || "Community"];
      topics.forEach((topic) => {
        accumulator[topic] = (accumulator[topic] ?? 0) + 1;
      });
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([label, count]) => ({ label, postsThisWeek: count }))
      .sort((left, right) => right.postsThisWeek - left.postsThisWeek)
      .slice(0, 4);
  }, [postState.data]);

  const createNewPost = async () => {
    if (!composer.content.trim()) {
      setPostContentMissing(true);
      composerRef.current?.focus();
      return;
    }
    setPostContentMissing(false);

    try {
      await createPost({
        authorId: author.id,
        author: authorName,
        authorRole: author.role,
        category: composer.category as PostCategory,
        debateType: composer.debateType || undefined,
        topicTags: composer.topicTags.split(",").map((tag) => tag.trim()).filter(Boolean),
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
        topicTags: "",
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
      setGroupForm({ name: "", description: "", visibility: "public", category: "Practice Group" });
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

  const submitReply = async (postId: string, parentCommentId: string) => {
    const content = replyDrafts[parentCommentId]?.trim();
    if (!content) {
      return;
    }

    try {
      await addCommentToPost(postId, author.id, authorName, content, parentCommentId);
      setReplyDrafts((current) => ({ ...current, [parentCommentId]: "" }));
      setReplyingToId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to post reply.");
    }
  };

  const handleCommentVote = async (
    comment: PostComment,
    reaction: "like" | "dislike",
  ) => {
    const previous = getMyCommentVote(comment.id);
    const next = { ...previous };

    if (reaction === "like") {
      next.like = !next.like;
      if (next.like) next.dislike = false;
    } else {
      next.dislike = !next.dislike;
      if (next.dislike) next.like = false;
    }

    setCommentVoteOverrides((current) => ({ ...current, [comment.id]: next }));
    try {
      await toggleCommentReaction(comment.id, comment.postId, author.id, reaction);
    } catch (error) {
      setCommentVoteOverrides((current) => {
        const restored = { ...current };
        delete restored[comment.id];
        return restored;
      });
      setMessage(error instanceof Error ? error.message : "Unable to save that vote.");
    }
  };

  const sharePost = (post: CommunityPost) => {
    const media = (post.attachments ?? []).filter(
      (attachment): attachment is typeof attachment & { kind: "image" | "video" } =>
        attachment.kind === "image" || attachment.kind === "video",
    );
    setShareTarget({
      title: post.title || "Debate Studio community post",
      url: `${window.location.origin}/app/community?post=${encodeURIComponent(post.id)}`,
      media: media.slice(0, 3).map(({ kind, url, name }) => ({ kind, url, name })),
      mediaCount: media.length,
    });
    setSharedPostId(post.id);
    // Best-effort: record the share without blocking the dialog.
    void incrementPostShareCount(post.id, post.shareCount).catch(() => {});
  };

  const handleReaction = async (
    postId: string,
    reaction: "like" | "dislike" | "favorite",
  ) => {
    const previous = getMyReaction(postId);
    const next = { ...previous };

    if (reaction === "like") {
      next.like = !next.like;
      if (next.like) next.dislike = false;
    } else if (reaction === "dislike") {
      next.dislike = !next.dislike;
      if (next.dislike) next.like = false;
    } else {
      next.favorite = !next.favorite;
    }

    setReactionOverrides((current) => ({ ...current, [postId]: next }));
    try {
      await togglePostReaction(postId, author.id, reaction);
    } catch (error) {
      setReactionOverrides((current) => {
        const restored = { ...current };
        delete restored[postId];
        return restored;
      });
      setMessage(error instanceof Error ? error.message : "Unable to save that reaction.");
    }
  };

  const editPost = async (postId: string, currentTitle?: string, currentContent?: string, currentCategory?: PostCategory, currentDebateType?: string) => {
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
                  aria-invalid={postContentMissing}
                  ref={composerRef}
                  value={composer.content}
                  onChange={(event) =>
                    { setComposer((current) => ({ ...current, content: event.target.value })); setPostContentMissing(false); }
                  }
                  placeholder="Start the conversation..."
                />
                {postContentMissing ? <span className="speech-field-error" role="alert">Write something before posting.</span> : null}
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
                <label htmlFor="postTopics">Topics</label>
                <input
                  id="postTopics"
                  value={composer.topicTags}
                  onChange={(event) => setComposer((current) => ({ ...current, topicTags: event.target.value }))}
                  placeholder="Comma-separated, e.g. climate, evidence comparison"
                />
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
          {message && !isComposerOpen ? <p className="meta-line" role="status">{message}</p> : null}

          <div className="stack">
            {filteredPosts.map((post) => {
              const channel = channelState.data.find((item) => item.id === post.channelId);
              const authorProfile = usersState.data.find((item) => item.id === post.authorId);
              const postAuthorName = safeName(authorProfile?.displayName ?? post.author);
              const comments = commentState.data.filter((entry) => entry.postId === post.id);
              const isOwner = author.id === post.authorId;
              const reaction = getMyReaction(post.id);
              const liked = reaction?.like ?? false;
              const disliked = reaction?.dislike ?? false;
              const favorited = reaction?.favorite ?? false;
              const isCommentsOpen = expandedPostId === post.id;
              const hasCommented = comments.some((entry) => entry.authorId === author.id);
              const justShared = sharedPostId === post.id;
              const commentTree = buildCommentTree(comments);

              const renderComment = (comment: PostComment, depth: number) => {
                const vote = getMyCommentVote(comment.id);
                const replies = commentTree.repliesByParentId.get(comment.id) ?? [];
                const isReplying = replyingToId === comment.id;
                const commentAuthorName = safeName(comment.authorName);

                return (
                  <div
                    key={comment.id}
                    className={depth > 0 ? "forum-comment-thread is-reply" : "forum-comment-thread"}
                  >
                    <div className="forum-comment-item">
                      <ProfileHoverLink
                        user={usersState.data.find((item) => item.id === comment.authorId)}
                        userId={comment.authorId}
                        name={commentAuthorName}
                        className="forum-author-link"
                      >
                        <strong>{commentAuthorName}</strong>
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

                      <div className="forum-comment-actions">
                        <button
                          type="button"
                          className={vote.like ? "forum-action-button is-like" : "forum-action-button"}
                          aria-pressed={vote.like}
                          aria-label={"Like comment by " + commentAuthorName}
                          onClick={() => void handleCommentVote(comment, "like")}
                        >
                          <ThumbsUp size={14} /> {comment.likeCount ?? 0}
                        </button>
                        <button
                          type="button"
                          className={vote.dislike ? "forum-action-button is-dislike" : "forum-action-button"}
                          aria-pressed={vote.dislike}
                          aria-label={"Dislike comment by " + commentAuthorName}
                          onClick={() => void handleCommentVote(comment, "dislike")}
                        >
                          <ThumbsDown size={14} /> {comment.dislikeCount ?? 0}
                        </button>
                        {depth < MAX_COMMENT_DEPTH ? (
                          <button
                            type="button"
                            className={isReplying ? "forum-action-button is-comment" : "forum-action-button"}
                            aria-pressed={isReplying}
                            aria-label={"Reply to " + commentAuthorName}
                            onClick={() => setReplyingToId(isReplying ? null : comment.id)}
                          >
                            <CornerDownRight size={14} /> Reply
                            {replies.length > 0 ? " (" + replies.length + ")" : ""}
                          </button>
                        ) : null}
                      </div>

                      {isReplying ? (
                        <div className="forum-comment-form forum-reply-form">
                          <input
                            autoFocus
                            aria-label={"Reply to " + commentAuthorName}
                            value={replyDrafts[comment.id] ?? ""}
                            onChange={(event) =>
                              setReplyDrafts((current) => ({
                                ...current,
                                [comment.id]: event.target.value,
                              }))
                            }
                            placeholder={"Reply to " + commentAuthorName + "..."}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void submitReply(post.id, comment.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            aria-label={"Post reply to " + commentAuthorName}
                            onClick={() => void submitReply(post.id, comment.id)}
                          >
                            Reply
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {replies.length > 0 ? (
                      <div className="forum-comment-replies">
                        {replies.map((reply) =>
                          renderComment(reply, Math.min(depth + 1, MAX_COMMENT_DEPTH)),
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              };

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
                                onClick={() => void editPost(post.id, post.title, post.content, post.category as PostCategory, post.debateType)}
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
                        onClick={() => void handleReaction(post.id, "like")}
                      >
                        <ThumbsUp size={16} /> {post.likeCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className={disliked ? "forum-action-button is-dislike" : "forum-action-button"}
                        aria-pressed={disliked}
                        onClick={() => void handleReaction(post.id, "dislike")}
                      >
                        <ThumbsDown size={16} /> {post.dislikeCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className={favorited ? "forum-action-button is-favorite" : "forum-action-button"}
                        aria-pressed={favorited}
                        onClick={() => void handleReaction(post.id, "favorite")}
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
                        aria-label="Toggle comments"
                        onClick={() => setExpandedPostId(isCommentsOpen ? null : post.id)}
                      >
                        <MessageCircle size={16} /> {comments.length}
                      </button>
                      <button
                        type="button"
                        className={justShared ? "forum-action-button is-share" : "forum-action-button"}
                        aria-label="Share post"
                        onClick={() => sharePost(post)}
                      >
                        {justShared ? <Check size={16} /> : <Share2 size={16} />}{" "}
                        {post.shareCount ?? 0}
                      </button>
                    </div>
                  </div>

                  {expandedPostId === post.id ? (
                    <div className="forum-comments-panel">
                      <div className="stack">
                        {commentTree.roots.length > 0
                          ? commentTree.roots.map((comment) => renderComment(comment, 0))
                          : <p className="meta-line">No comments yet. Start the discussion.</p>}
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
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void submitComment(post.id);
                            }
                          }}
                        />
                        <button type="button" className="btn btn-secondary" onClick={() => void submitComment(post.id)}>
                          Comment
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
                <span><strong>Create Channel</strong><span className="meta-line">Start a public or private community space</span></span>
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
              {schoolAndTournamentChannels.length === 0 ? (
                <p className="meta-line">Create a School or Tournament channel to begin.</p>
              ) : null}
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
              {trendingTopics.length === 0 ? (
                <p className="meta-line">No topics have trended in the last seven days.</p>
              ) : null}
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
                <p className="eyebrow">Community channels</p>
                <h2 id="createGroupTitle" className="card-title">Create a channel</h2>
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
                <label htmlFor="channelCategory">Channel type</label>
                <select
                  id="channelCategory"
                  value={groupForm.category}
                  onChange={(event) => setGroupForm((current) => ({
                    ...current,
                    category: event.target.value as "Tournament" | "School" | "Practice Group",
                  }))}
                >
                  <option value="Practice Group">Practice Group</option>
                  <option value="School">School</option>
                  <option value="Tournament">Tournament</option>
                </select>
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
              <button type="button" className="btn btn-primary" onClick={() => void submitPracticeGroup()}>Create channel</button>
            </div>
          </section>
        </div>
      ) : null}

      {shareTarget ? (
        <ShareToMessageDialog
          title={shareTarget.title}
          url={shareTarget.url}
          previewKind="post"
          media={shareTarget.media}
          mediaCount={shareTarget.mediaCount}
          onClose={() => {
            setShareTarget(null);
            setSharedPostId(null);
          }}
        />
      ) : null}
    </>
  );
};
