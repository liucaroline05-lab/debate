import { useEffect, useMemo, useState } from "react";
import { Check, FolderPlus, Link as LinkIcon, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getContentFolderMoveTargets,
  getContentFolderPath,
  moveContentFolder,
} from "@/features/folders/folderService";
import type { ContentFolder } from "@/types/models";

interface FolderMoveButtonProps {
  folder: ContentFolder;
  /** Folders owned by the same user, which are the only valid destinations. */
  ownedFolders: ContentFolder[];
}

export const FolderMoveButton = ({ folder, ownedFolders }: FolderMoveButtonProps) => {
  // Sorting by path keeps each subfolder directly under its parent.
  const targets = useMemo(() => getContentFolderMoveTargets(folder, ownedFolders)
    .map((target) => ({ target, path: getContentFolderPath(target, ownedFolders) }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ target }) => target), [folder, ownedFolders]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState(folder.parentFolderId ?? "");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!targets.some((target) => target.id === selectedFolderId)) {
      setSelectedFolderId(folder.parentFolderId ?? targets[0]?.id ?? "");
    }
  }, [folder.parentFolderId, selectedFolderId, targets]);

  const selectedFolder = targets.find((target) => target.id === selectedFolderId);
  const isInSelectedFolder = Boolean(selectedFolderId && folder.parentFolderId === selectedFolderId);
  const willBecomePrivate = Boolean(selectedFolder && !isInSelectedFolder
    && folder.visibility === "public" && selectedFolder.visibility !== "public");

  const toggleFolder = async () => {
    if (!selectedFolder) return;
    setIsBusy(true);
    setMessage("");
    try {
      await moveContentFolder(folder.id, isInSelectedFolder ? null : selectedFolder.id);
      setMessage(isInSelectedFolder ? "Removed from folder." : "Added to folder.");
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
            <strong>Organize this folder</strong>
            <button type="button" className="forum-icon-button" aria-label="Close folder picker" onClick={() => setIsOpen(false)}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          {targets.length ? (
            <>
              <label className="form-field folder-picker-select">
                <span>Choose a folder</span>
                <select value={selectedFolderId} onChange={(event) => { setSelectedFolderId(event.target.value); setMessage(""); }}>
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {getContentFolderPath(target, ownedFolders)}{target.tournamentName ? ` · ${target.tournamentName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {willBecomePrivate ? <p className="meta-line">This folder and everything in it will become private to match “{selectedFolder?.name}”.</p> : null}
              <button type="button" className={isInSelectedFolder ? "btn btn-toggle" : "btn btn-primary"} disabled={isBusy || !selectedFolder} onClick={() => void toggleFolder()}>
                {isInSelectedFolder ? <Check size={16} aria-hidden="true" /> : <FolderPlus size={16} aria-hidden="true" />}
                {isBusy ? "Saving..." : isInSelectedFolder ? "In folder · Remove" : "Add to folder"}
              </button>
              {selectedFolderId ? (
                <Link className="folder-picker-open-link" to={`/app/folders/${selectedFolderId}`}>
                  <LinkIcon size={14} aria-hidden="true" /> Open folder
                </Link>
              ) : null}
            </>
          ) : (
            <p className="card-copy">
              No compatible folders yet. <Link to="/app/folders?create=1">Create a folder</Link> to organize this one.
            </p>
          )}
          {message ? <p className="meta-line" role="status">{message}</p> : null}
        </section>
      ) : null}
    </div>
  );
};
