import { useEffect, useMemo, useState } from "react";
import { Check, FolderPlus, Link as LinkIcon, X } from "lucide-react";
import { Link } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import { useAuth } from "@/features/auth/AuthContext";
import {
  addContentToFolder,
  removeContentFromFolder,
} from "@/features/folders/folderService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ContentFolder, ContentFolderItem, FolderItemType } from "@/types/models";

const EMPTY_FOLDERS: ContentFolder[] = [];
const EMPTY_FOLDER_ITEMS: ContentFolderItem[] = [];

interface FolderPickerButtonProps {
  itemType: FolderItemType;
  itemId: string;
  itemTitle: string;
  itemSubtitle: string;
  itemSummary: string;
  itemSlug?: string;
  itemVisibility: "public" | "private";
}

export const FolderPickerButton = (props: FolderPickerButtonProps) => {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const folderConstraints = useMemo<QueryConstraint[]>(
    () => userId ? [where("userId", "==", userId)] : [],
    [userId],
  );
  const foldersState = useSeededFirestoreCollection<ContentFolder>(
    "folders",
    EMPTY_FOLDERS,
    folderConstraints,
    Boolean(userId),
    userId ? `folders:${userId}` : undefined,
  );
  const sharedFolderConstraints = useMemo<QueryConstraint[]>(
    () => userId ? [where("collaboratorIds", "array-contains", userId)] : [],
    [userId],
  );
  const sharedFoldersState = useSeededFirestoreCollection<ContentFolder>(
    "folders",
    EMPTY_FOLDERS,
    sharedFolderConstraints,
    Boolean(userId),
    userId ? `folders:shared:${userId}` : undefined,
  );
  const itemConstraints = useMemo<QueryConstraint[]>(
    () => userId ? [where("userId", "==", userId)] : [],
    [userId],
  );
  const itemsState = useSeededFirestoreCollection<ContentFolderItem>(
    "folderItems",
    EMPTY_FOLDER_ITEMS,
    itemConstraints,
    Boolean(userId),
    userId ? `folder-items:${userId}` : undefined,
  );
  const folders = [...foldersState.data, ...sharedFoldersState.data].filter((folder) =>
    folder.visibility !== "public" || props.itemVisibility === "public",
  );
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  // Another collaborator may already have added this item to a shared folder.
  const isSharedSelection = sharedFoldersState.data.some((folder) => folder.id === selectedFolderId);
  const sharedItemConstraints = useMemo<QueryConstraint[]>(
    () => isSharedSelection ? [where("folderId", "==", selectedFolderId)] : [],
    [isSharedSelection, selectedFolderId],
  );
  const sharedItemsState = useSeededFirestoreCollection<ContentFolderItem>(
    "folderItems",
    EMPTY_FOLDER_ITEMS,
    sharedItemConstraints,
    isSharedSelection,
    isSharedSelection ? `folder-items:shared:${selectedFolderId}` : undefined,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(folders[0]?.id ?? "");
    }
  }, [folders, selectedFolderId]);

  const selectedEntry = [...itemsState.data, ...sharedItemsState.data].find((entry) =>
    entry.folderId === selectedFolderId
    && entry.itemType === props.itemType
    && entry.itemId === props.itemId,
  );

  if (!currentUser) return null;

  const toggleItem = async () => {
    if (!selectedFolderId || !userId) return;
    setIsBusy(true);
    setMessage("");
    try {
      if (selectedEntry) {
        await removeContentFromFolder(selectedEntry.id);
        setMessage("Removed from folder.");
      } else {
        await addContentToFolder({
          userId,
          folderId: selectedFolderId,
          itemType: props.itemType,
          itemId: props.itemId,
          sourceVisibility: props.itemVisibility,
          itemTitle: props.itemTitle,
          itemSubtitle: props.itemSubtitle,
          itemSummary: props.itemSummary,
          itemSlug: props.itemSlug,
          visibility: folders.find((folder) => folder.id === selectedFolderId)?.visibility ?? "private",
        });
        setMessage("Added to folder.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this folder.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="folder-picker-wrap">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
          setMessage("");
        }}
      >
        <FolderPlus size={16} aria-hidden="true" /> Add to folder
      </button>
      {isOpen ? (
        <section className="folder-picker-panel" aria-label="Add to folder">
          <div className="row-between">
            <strong>Organize this item</strong>
            <button type="button" className="forum-icon-button" aria-label="Close folder picker" onClick={() => setIsOpen(false)}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          {folders.length ? (
            <>
              <label className="form-field folder-picker-select">
                <span>Choose a folder</span>
                <select value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)}>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}{folder.tournamentName ? ` · ${folder.tournamentName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={selectedEntry ? "btn btn-toggle" : "btn btn-primary"} disabled={isBusy || !selectedFolderId} onClick={() => void toggleItem()}>
                {selectedEntry ? <Check size={16} aria-hidden="true" /> : <FolderPlus size={16} aria-hidden="true" />}
                {isBusy ? "Saving..." : selectedEntry ? "In folder · Remove" : "Add to folder"}
              </button>
              {selectedFolderId ? (
                <Link className="folder-picker-open-link" to={`/app/folders/${selectedFolderId}`}>
                  <LinkIcon size={14} aria-hidden="true" /> Open folder
                </Link>
              ) : null}
            </>
          ) : (
            <p className="card-copy">
              No compatible folders yet. <Link to="/app/folders?create=1">Create a folder</Link> to organize this item safely.
            </p>
          )}
          {message ? <p className="meta-line" role="status">{message}</p> : null}
          {foldersState.error || sharedFoldersState.error || itemsState.error ? <p className="folder-error" role="alert">Folders could not load.</p> : null}
        </section>
      ) : null}
    </div>
  );
};
