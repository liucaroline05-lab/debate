import { useState } from "react";
import { Bookmark, MessageCircle, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ShareToMessageDialog } from "@/features/messages/ShareToMessageDialog";
import {
  incrementContentFolderShareCount,
  toggleContentFolderReaction,
  toggleContentFolderSave,
} from "@/features/folders/folderService";
import type { ContentFolder, ContentFolderReaction } from "@/types/models";

interface FolderEngagementBarProps {
  folder: ContentFolder;
  userId: string;
  reaction?: ContentFolderReaction;
  isSaved: boolean;
  compact?: boolean;
  onOpenComments?: () => void;
}

export const FolderEngagementBar = ({
  folder,
  userId,
  reaction,
  isSaved,
  compact = false,
  onOpenComments,
}: FolderEngagementBarProps) => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<"like" | "dislike" | "save" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [message, setMessage] = useState("");

  if (folder.visibility !== "public") return null;

  const changeReaction = async (type: "like" | "dislike") => {
    if (pending) return;
    setPending(type);
    setMessage("");
    try {
      await toggleContentFolderReaction(folder.id, userId, type);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update your reaction.");
    } finally {
      setPending(null);
    }
  };

  const changeSave = async () => {
    if (pending) return;
    setPending("save");
    setMessage("");
    try {
      await toggleContentFolderSave(folder.id, userId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update saved folders.");
    } finally {
      setPending(null);
    }
  };

  const url = `${window.location.origin}/app/folders/${folder.id}`;
  const openComments = () => {
    if (onOpenComments) {
      onOpenComments();
      return;
    }
    navigate(`/app/folders/${folder.id}?comments=1`);
  };

  return (
    <>
      <div className={compact ? "folder-engagement-bar is-compact" : "folder-engagement-bar"}>
        <button
          type="button"
          className="btn btn-toggle"
          aria-label={`Like ${folder.name}`}
          aria-pressed={Boolean(reaction?.like)}
          disabled={pending !== null}
          onClick={() => void changeReaction("like")}
        >
          <ThumbsUp size={16} aria-hidden="true" /> <span>{folder.likeCount ?? 0}</span>
        </button>
        <button
          type="button"
          className="btn btn-toggle"
          aria-label={`Dislike ${folder.name}`}
          aria-pressed={Boolean(reaction?.dislike)}
          disabled={pending !== null}
          onClick={() => void changeReaction("dislike")}
        >
          <ThumbsDown size={16} aria-hidden="true" /> <span>{folder.dislikeCount ?? 0}</span>
        </button>
        <button
          type="button"
          className="btn btn-toggle"
          aria-pressed={isSaved}
          aria-label={`${isSaved ? "Unsave" : "Save"} ${folder.name}`}
          title={isSaved ? "Unsave folder" : "Save folder"}
          disabled={pending !== null}
          onClick={() => void changeSave()}
        >
          <Bookmark size={16} aria-hidden="true" />{!compact ? <span>{folder.saveCount ?? 0}</span> : null}
        </button>
        <button type="button" className="btn btn-ghost" aria-label={`Share ${folder.name}`} title="Share folder" onClick={() => setShareOpen(true)}>
          <Share2 size={16} aria-hidden="true" /> {!compact ? <span>{folder.shareCount ?? 0}</span> : null}
        </button>
        <button type="button" className="btn btn-ghost" onClick={openComments} aria-label={`Comments on ${folder.name}`} title="View comments">
          <MessageCircle size={16} aria-hidden="true" /> {!compact ? <span>{folder.commentCount ?? 0}</span> : null}
        </button>
        {message ? <span className="folder-action-message" role="status">{message}</span> : null}
      </div>
      {shareOpen ? (
        <ShareToMessageDialog
          title={folder.name}
          url={url}
          previewKind="folder"
          onClose={() => setShareOpen(false)}
          onAfterShare={() => incrementContentFolderShareCount(folder.id)}
        />
      ) : null}
    </>
  );
};
