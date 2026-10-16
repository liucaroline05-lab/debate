import { useEffect, useMemo, useRef, useState } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { MoreHorizontal, Pencil, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import {
  addContentFolderComment,
  deleteContentFolderComment,
  toggleContentFolderCommentReaction,
  updateContentFolderComment,
} from "@/features/folders/folderService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ContentFolder, ContentFolderComment, ContentFolderCommentReaction } from "@/types/models";

const EMPTY_COMMENTS: ContentFolderComment[] = [];
const EMPTY_COMMENT_REACTIONS: ContentFolderCommentReaction[] = [];
// Matches the reveal transition in styles.css so the page scroll and the
// panel's growth finish together.
const REVEAL_SCROLL_MS = 520;
const REVEAL_SCROLL_TOP_GAP_PX = 24;

export const FOLDER_COMMENTS_SECTION_ID = "folder-comments";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const easeInOutCubic = (progress: number) =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

/**
 * Scrolls the window toward a target that may move while it runs (the panel
 * grows as it opens), recomputing the destination every frame. A wheel,
 * touch, or key press hands control straight back to the user.
 */
const animateWindowScroll = (getTarget: () => number) => {
  if (prefersReducedMotion()) {
    window.scrollTo(0, getTarget());
    return () => undefined;
  }
  const startY = window.scrollY;
  const startedAt = performance.now();
  let frame = 0;
  const stop = () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };
  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / REVEAL_SCROLL_MS);
    window.scrollTo(0, startY + (getTarget() - startY) * easeInOutCubic(progress));
    if (progress < 1) frame = window.requestAnimationFrame(step);
    else stop();
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  frame = window.requestAnimationFrame(step);
  return stop;
};

interface FolderCommentsSectionProps {
  folder: ContentFolder;
  currentUser: { id: string; displayName: string };
  canModerate: boolean;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Public folder comments, revealed in place below the engagement bar. The
 * section stays mounted so opening and closing can animate its height, and
 * the page scrolls down with it on open and back up on close.
 */
export const FolderCommentsSection = ({ folder, currentUser, canModerate, isOpen, onClose }: FolderCommentsSectionProps) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const returnScrollYRef = useRef<number | null>(null);
  const wasOpenRef = useRef(isOpen);
  const commentConstraints = useMemo<QueryConstraint[]>(
    () => [where("folderId", "==", folder.id), where("visibility", "==", "public")],
    [folder.id],
  );
  const commentsState = useSeededFirestoreCollection<ContentFolderComment>(
    "folderComments",
    EMPTY_COMMENTS,
    commentConstraints,
    true,
    `folder-comments:${folder.id}:public`,
  );
  const reactionConstraints = useMemo<QueryConstraint[]>(
    () => [where("userId", "==", currentUser.id), where("folderId", "==", folder.id)],
    [currentUser.id, folder.id],
  );
  const reactionsState = useSeededFirestoreCollection<ContentFolderCommentReaction>(
    "folderCommentReactions",
    EMPTY_COMMENT_REACTIONS,
    reactionConstraints,
    true,
    `folder-comment-reactions:${currentUser.id}:${folder.id}`,
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingReactionId, setPendingReactionId] = useState("");
  const [notice, setNotice] = useState("");
  // Comment menus can overflow the panel, so clipping is lifted once the
  // reveal has finished growing.
  const [isSettled, setIsSettled] = useState(isOpen);
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const comments = useMemo(
    () => [...commentsState.data].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [commentsState.data],
  );
  const reactionByComment = useMemo(
    () => new Map(reactionsState.data.map((reaction) => [reaction.commentId, reaction])),
    [reactionsState.data],
  );

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (wasOpen === isOpen) return;

    if (isOpen) {
      returnScrollYRef.current = window.scrollY;
      if (prefersReducedMotion()) setIsSettled(true);
      return animateWindowScroll(() => {
        const section = sectionRef.current;
        if (!section) return window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const target = section.getBoundingClientRect().top + window.scrollY - REVEAL_SCROLL_TOP_GAP_PX;
        return Math.max(0, Math.min(maxScroll, target));
      });
    }

    setIsSettled(false);
    setMenuCommentId(null);
    const returnY = returnScrollYRef.current;
    returnScrollYRef.current = null;
    // Only slide back up; never pull the page down past where the reader is.
    if (returnY === null || window.scrollY <= returnY) return;
    return animateWindowScroll(() => returnY);
  }, [isOpen]);

  useEffect(() => {
    if (!menuCommentId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.(`[data-comment-menu="${menuCommentId}"]`)) setMenuCommentId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuCommentId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuCommentId]);

  const post = async () => {
    setBusy(true);
    setNotice("");
    try {
      await addContentFolderComment(folder.id, currentUser.id, currentUser.displayName, draft);
      setDraft("");
      setNotice("Comment posted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to post this comment.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment: ContentFolderComment) => {
    setMenuCommentId(null);
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteContentFolderComment(comment);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to remove this comment.");
    }
  };

  const startEditing = (comment: ContentFolderComment) => {
    setMenuCommentId(null);
    setEditingCommentId(comment.id);
    setEditDraft(comment.content);
    setNotice("");
  };

  const saveEdit = async (comment: ContentFolderComment) => {
    setSavingEdit(true);
    setNotice("");
    try {
      await updateContentFolderComment(comment, editDraft);
      setEditingCommentId(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save this comment.");
    } finally {
      setSavingEdit(false);
    }
  };

  const react = async (comment: ContentFolderComment, reaction: "like" | "dislike") => {
    if (pendingReactionId) return;
    setPendingReactionId(comment.id);
    setNotice("");
    try {
      await toggleContentFolderCommentReaction(comment, currentUser.id, reaction);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update your reaction.");
    } finally {
      setPendingReactionId("");
    }
  };

  const revealClassName = [
    "folder-comments-reveal",
    isOpen ? "is-open" : "",
    isOpen && isSettled ? "is-settled" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={revealClassName}
      inert={!isOpen}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "grid-template-rows" && isOpen) setIsSettled(true);
      }}
    >
      <div className="folder-comments-reveal-inner">
        <section
          ref={sectionRef}
          id={FOLDER_COMMENTS_SECTION_ID}
          className="app-card folder-comments-panel"
          aria-labelledby="folder-comments-heading"
          aria-hidden={!isOpen}
        >
          <div className="folder-comments-panel-header">
            <div><p className="eyebrow">Community</p><h2 id="folder-comments-heading">Comments</h2></div>
            <button type="button" className="forum-icon-button" aria-label="Hide comments" onClick={onClose}><X size={19} aria-hidden="true" /></button>
          </div>
          <p className="folder-comments-count">{folder.commentCount ?? comments.length} comments on {folder.name}</p>
          <form className="folder-comment-form" onSubmit={(event) => { event.preventDefault(); void post(); }}>
            <label className="sr-only" htmlFor="folderComment">Write a comment</label>
            <textarea id="folderComment" maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a useful note or question about this folder…" />
            <div className="row-between"><span className="meta-line">{draft.length}/2,000</span><button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>{busy ? "Posting…" : "Post comment"}</button></div>
          </form>
          {notice ? <p className="meta-line" role="status">{notice}</p> : null}
          <div className="folder-comment-list">
            {comments.map((comment) => {
              const reaction = reactionByComment.get(comment.id);
              const liked = Boolean(reaction?.like);
              const disliked = Boolean(reaction?.dislike);
              const isAuthor = comment.userId === currentUser.id;
              const canDelete = isAuthor || canModerate;
              const isEditing = editingCommentId === comment.id;
              return (
                <article className="folder-comment" key={comment.id}>
                  <div className="folder-comment-header">
                    <div className="folder-comment-byline">
                      <strong>{comment.authorName}</strong>
                      <span className="meta-line">
                        {new Date(comment.createdAt).toLocaleDateString()}
                        {comment.editedAt ? " · Edited" : ""}
                      </span>
                    </div>
                    {canDelete && !isEditing ? (
                      <div className="forum-post-menu" data-comment-menu={comment.id}>
                        <button
                          type="button"
                          className="forum-icon-button folder-comment-menu-button"
                          aria-label={`Options for comment from ${comment.authorName}`}
                          aria-haspopup="menu"
                          aria-expanded={menuCommentId === comment.id}
                          onClick={() => setMenuCommentId((current) => current === comment.id ? null : comment.id)}
                        >
                          <MoreHorizontal size={17} aria-hidden="true" />
                        </button>
                        {menuCommentId === comment.id ? (
                          <div className="forum-menu-dropdown" role="menu">
                            {isAuthor ? (
                              <button type="button" role="menuitem" className="forum-menu-item" onClick={() => startEditing(comment)}>
                                <Pencil size={16} aria-hidden="true" /> Edit
                              </button>
                            ) : null}
                            <button type="button" role="menuitem" className="forum-menu-item" onClick={() => void remove(comment)}>
                              <Trash2 size={16} aria-hidden="true" /> Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {isEditing ? (
                    <form className="folder-comment-edit" onSubmit={(event) => { event.preventDefault(); void saveEdit(comment); }}>
                      <label className="sr-only" htmlFor={`folderCommentEdit-${comment.id}`}>Edit your comment</label>
                      <textarea
                        id={`folderCommentEdit-${comment.id}`}
                        maxLength={2000}
                        value={editDraft}
                        autoFocus
                        onChange={(event) => setEditDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Escape") setEditingCommentId(null); }}
                      />
                      <div className="button-row">
                        <button type="submit" className="btn btn-primary" disabled={savingEdit || !editDraft.trim() || editDraft.trim() === comment.content}>
                          {savingEdit ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={savingEdit} onClick={() => setEditingCommentId(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <p>{comment.content}</p>
                  )}
                  <div className="forum-comment-actions">
                    <button
                      type="button"
                      className={liked ? "forum-action-button is-like" : "forum-action-button"}
                      aria-pressed={liked}
                      aria-label={`Like comment from ${comment.authorName}`}
                      disabled={pendingReactionId === comment.id}
                      onClick={() => void react(comment, "like")}
                    >
                      <ThumbsUp size={14} aria-hidden="true" /> {comment.likeCount ?? 0}
                    </button>
                    <button
                      type="button"
                      className={disliked ? "forum-action-button is-dislike" : "forum-action-button"}
                      aria-pressed={disliked}
                      aria-label={`Dislike comment from ${comment.authorName}`}
                      disabled={pendingReactionId === comment.id}
                      onClick={() => void react(comment, "dislike")}
                    >
                      <ThumbsDown size={14} aria-hidden="true" /> {comment.dislikeCount ?? 0}
                    </button>
                  </div>
                </article>
              );
            })}
            {comments.length === 0 ? <p className="meta-line">Be the first to comment.</p> : null}
          </div>
          {commentsState.error ? <p className="folder-error" role="alert">Comments could not be loaded: {commentsState.error}</p> : null}
        </section>
      </div>
    </div>
  );
};
