import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import { Check, FolderPlus, X } from "lucide-react";
import {
  acceptContentFolderInvite,
  removeContentFolderInvite,
} from "@/features/folders/folderService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ContentFolderInvite } from "@/types/models";

const EMPTY_INVITES: ContentFolderInvite[] = [];

/** Pending folder invitations for the signed-in user, with accept/decline. */
export const FolderInvitesBanner = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const constraints = useMemo<QueryConstraint[]>(() => [where("inviteeId", "==", userId)], [userId]);
  const invitesState = useSeededFirestoreCollection<ContentFolderInvite>(
    "folderInvites",
    EMPTY_INVITES,
    constraints,
    true,
    `folder-invites:received:${userId}`,
  );
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  if (!invitesState.data.length && !notice) return null;

  const respond = async (invite: ContentFolderInvite, accept: boolean) => {
    if (busyId) return;
    setBusyId(invite.id);
    setNotice("");
    try {
      if (accept) {
        await acceptContentFolderInvite(invite, userId);
        navigate(`/app/folders/${invite.folderId}`);
      } else {
        await removeContentFolderInvite(invite.id);
        setNotice(`Declined the invite to “${invite.folderName}”.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to answer this invite.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="app-card folder-invites" aria-label="Folder invites">
      {invitesState.data.map((invite) => (
        <div className="folder-invite" key={invite.id}>
          <FolderPlus size={20} aria-hidden="true" />
          <p><strong>{invite.inviterName}</strong> invited you to collaborate on <strong>{invite.folderName}</strong>.</p>
          <div className="button-row">
            <button type="button" className="btn btn-primary" disabled={Boolean(busyId)} onClick={() => void respond(invite, true)}>
              <Check size={15} aria-hidden="true" /> {busyId === invite.id ? "Joining…" : "Accept"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={Boolean(busyId)} onClick={() => void respond(invite, false)}>
              <X size={15} aria-hidden="true" /> Decline
            </button>
          </div>
        </div>
      ))}
      {notice ? <p className="meta-line" role="status">{notice}</p> : null}
    </section>
  );
};
