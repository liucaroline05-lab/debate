import { useEffect, useMemo, useRef, useState } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { ThumbsDown, ThumbsUp, X } from "lucide-react";
import {
  addContentFolderComment,
  deleteContentFolderComment,
  toggleContentFolderCommentReaction,
} from "@/features/folders/folderService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ContentFolder, ContentFolderComment, ContentFolderCommentReaction } from "@/types/models";

const EMPTY_COMMENTS: ContentFolderComment[] = [];
const EMPTY_COMMENT_REACTIONS: ContentFolderCommentReaction[] = [];

export const FOLDER_COMMENTS_SECTION_ID = "folder-comments";

interface FolderCommentsSectionProps {
  folder: ContentFolder;
  currentUser: { id: string; displayName: string };
  canModerate: boolean;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Public folder comments, revealed in place below the engagement bar. The
 * section stays mounted so opening and closing can animate its height.
 */
export const FolderCommentsSection = ({ folder, currentUser, canModerate, isOpen, onClose }: FolderCommentsSectionProps) => {
  const sectionRef = useRef<HTMLElement | null>(null);
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

  const comments = useMemo(
    () => [...commentsState.data].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [commentsState.data],
  );
  const reactionByComment = useMemo(
    () => new Map(reactionsState.data.map((reaction) => [reaction.commentId, reaction])),
    [reactionsState.data],
  );

  useEffect(() => {
    if (!isOpen) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [isOpen]);

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
    try {
      await deleteContentFolderComment(comment);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to remove this comment.");
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

  return (
    <div className={isOpen ? "folder-comments-reveal is-open" : "folder-comments-reveal"} inert={!isOpen}>
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
              return (
                <article className="folder-comment" key={comment.id}>
                  <div className="row-between"><strong>{comment.authorName}</strong><span className="meta-line">{new Date(comment.createdAt).toLocaleDateString()}</span></div>
                  <p>{comment.content}</p>
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
                    {comment.userId === currentUser.id || canModerate ? <button type="button" className="btn btn-ghost" onClick={() => void remove(comment)}>Delete</button> : null}
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
