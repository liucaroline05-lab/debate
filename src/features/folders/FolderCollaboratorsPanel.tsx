import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import { LogOut, Search, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import {
  inviteContentFolderCollaborator,
  removeContentFolderCollaborator,
  removeContentFolderInvite,
} from "@/features/folders/folderService";
import { normalizeUserProfile } from "@/features/users/defaultProfile";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ContentFolder, ContentFolderInvite, UserProfile } from "@/types/models";

const EMPTY_USERS: UserProfile[] = [];
const EMPTY_INVITES: ContentFolderInvite[] = [];
const MAX_INVITE_RESULTS = 6;

interface FolderCollaboratorsPanelProps {
  folder: ContentFolder;
  currentUser: { id: string; displayName: string };
}

/**
 * Lists who can edit a folder. Owners invite and remove collaborators;
 * collaborators can see the member list and leave.
 */
export const FolderCollaboratorsPanel = ({ folder, currentUser }: FolderCollaboratorsPanelProps) => {
  const navigate = useNavigate();
  const isOwner = folder.userId === currentUser.id;
  const collaboratorIds = useMemo(() => folder.collaboratorIds ?? [], [folder.collaboratorIds]);
  const usersState = useSeededFirestoreCollection<UserProfile>("users", EMPTY_USERS);
  const inviteConstraints = useMemo<QueryConstraint[]>(
    () => [where("inviterId", "==", currentUser.id), where("folderId", "==", folder.id)],
    [currentUser.id, folder.id],
  );
  const invitesState = useSeededFirestoreCollection<ContentFolderInvite>(
    "folderInvites",
    EMPTY_INVITES,
    inviteConstraints,
    isOwner,
    isOwner ? `folder-invites:sent:${folder.id}` : undefined,
  );
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const people = useMemo(
    () => usersState.data.map((user) => normalizeUserProfile(user)),
    [usersState.data],
  );
  const nameById = useMemo(
    () => new Map(people.map((person) => [person.id, person.displayName])),
    [people],
  );
  const pendingIds = useMemo(
    () => new Set(invitesState.data.map((invite) => invite.inviteeId)),
    [invitesState.data],
  );
  const matches = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return [];
    return people
      .filter((person) =>
        person.id
        && person.id !== folder.userId
        && !collaboratorIds.includes(person.id)
        && !pendingIds.has(person.id)
        && [person.displayName, person.username].some((value) => value?.toLowerCase().includes(normalized)))
      .slice(0, MAX_INVITE_RESULTS);
  }, [collaboratorIds, folder.userId, pendingIds, people, search]);

  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    if (busyId) return;
    setBusyId(id);
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update collaborators.");
    } finally {
      setBusyId("");
    }
  };

  const invite = (person: UserProfile) => run(
    person.id,
    () => inviteContentFolderCollaborator(folder, currentUser, { id: person.id, displayName: person.displayName }),
    `Invited ${person.displayName}.`,
  ).then(() => setSearch(""));

  const leave = async () => {
    if (!window.confirm(`Leave “${folder.name}”? You will need a new invite to edit it again.`)) return;
    await run(currentUser.id, () => removeContentFolderCollaborator(folder.id, currentUser.id), "You left this folder.");
    if (folder.visibility !== "public") navigate("/app/folders");
  };

  return (
    <section className="app-card folder-collaborators" aria-labelledby="folder-collaborators-heading">
      <div className="folder-detail-section-heading">
        <div><p className="eyebrow">Shared editing</p><h2 id="folder-collaborators-heading">Collaborators</h2></div>
        <UsersRound size={22} aria-hidden="true" />
      </div>

      <ul className="folder-collaborator-list">
        <li>
          <span className="folder-collaborator-name">{isOwner ? "You" : folder.ownerName || nameById.get(folder.userId) || "Folder owner"}</span>
          <span className="forum-mini-pill subtle">Owner</span>
        </li>
        {collaboratorIds.map((id) => {
          const name = id === currentUser.id ? "You" : nameById.get(id) ?? "Collaborator";
          return (
            <li key={id}>
              <span className="folder-collaborator-name">{name}</span>
              {isOwner ? (
                <button type="button" className="btn btn-ghost" disabled={Boolean(busyId)} onClick={() => void run(id, () => removeContentFolderCollaborator(folder.id, id), `Removed ${name}.`)}>
                  <UserMinus size={15} aria-hidden="true" /> Remove
                </button>
              ) : id === currentUser.id ? (
                <button type="button" className="btn btn-ghost" disabled={Boolean(busyId)} onClick={() => void leave()}>
                  <LogOut size={15} aria-hidden="true" /> Leave
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!collaboratorIds.length && isOwner ? <p className="meta-line">Invite people to add items, upload files, and arrange this board with you.</p> : null}

      {isOwner ? (
        <>
          <label className="forum-search folder-invite-search" htmlFor="folderInviteSearch">
            <Search size={17} aria-hidden="true" />
            <input
              id="folderInviteSearch"
              type="search"
              placeholder="Search people to invite"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {search.trim() ? (
            matches.length ? (
              <ul className="folder-collaborator-list is-results" aria-label="People to invite">
                {matches.map((person) => (
                  <li key={person.id}>
                    <span className="folder-collaborator-name">{person.displayName}{person.username ? <small> @{person.username}</small> : null}</span>
                    <button type="button" className="btn btn-secondary" disabled={Boolean(busyId)} onClick={() => void invite(person)}>
                      <UserPlus size={15} aria-hidden="true" /> {busyId === person.id ? "Inviting…" : "Invite"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="meta-line">No one else matches “{search.trim()}”.</p>
          ) : null}

          {invitesState.data.length ? (
            <>
              <h3 className="folder-collaborator-subheading">Pending invites</h3>
              <ul className="folder-collaborator-list">
                {invitesState.data.map((pending) => (
                  <li key={pending.id}>
                    <span className="folder-collaborator-name">{pending.inviteeName}</span>
                    <button type="button" className="btn btn-ghost" disabled={Boolean(busyId)} onClick={() => void run(pending.id, () => removeContentFolderInvite(pending.id), `Cancelled the invite for ${pending.inviteeName}.`)}>
                      <X size={15} aria-hidden="true" /> Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}

      {notice ? <p className="meta-line" role="status">{notice}</p> : null}
      {invitesState.error ? <p className="folder-error" role="alert">Invites could not load: {invitesState.error}</p> : null}
    </section>
  );
};
