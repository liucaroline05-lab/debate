import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import { ArrowLeft, Bookmark, ExternalLink } from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededResources } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import { useAuth } from "@/features/auth/AuthContext";
import { saveResourceNote, toggleResourceSave, updateResource } from "@/features/resources/resourceService";
import type { ResourceItem, ResourceNote, ResourceSave } from "@/types/models";

const EMPTY_RESOURCE_NOTES: ResourceNote[] = [];
const EMPTY_RESOURCE_SAVES: ResourceSave[] = [];

const findResource = (resources: ResourceItem[], resourceId?: string) =>
  resources.find((resource) => resource.id === resourceId || resource.slug === resourceId);

const roleLabel = (role?: string) =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : "Curator";

const renderMedia = (resource: ResourceItem) => {
  if (resource.mediaType === "Video" && resource.mediaPath) {
    return (
      <video className="resource-detail-native-media" controls poster={resource.thumbnailUrl}>
        <source src={resource.mediaPath} />
      </video>
    );
  }

  if (resource.mediaType === "Audio" && resource.mediaPath) {
    return (
      <div className="resource-detail-audio">
        {resource.thumbnailUrl ? <img src={resource.thumbnailUrl} alt="" /> : null}
        <audio controls src={resource.mediaPath}>
          <a href={resource.mediaPath}>Open audio</a>
        </audio>
      </div>
    );
  }

  if (resource.thumbnailUrl) {
    return <img src={resource.thumbnailUrl} alt="" className="resource-detail-image" />;
  }

  return (
    <div className="resource-detail-placeholder">
      <span>{resource.mediaType ?? "Article"}</span>
    </div>
  );
};

export const ResourceDetailPage = () => {
  const { resourceId } = useParams();
  const { currentUser } = useAuth();
  const resourceState = useSeededFirestoreCollection("resources", seededResources);
  const noteConstraints = useMemo<QueryConstraint[]>(
    () => (currentUser ? [where("userId", "==", currentUser.id)] : []),
    [currentUser?.id],
  );
  const noteState = useSeededFirestoreCollection<ResourceNote>(
    "resourceNotes",
    EMPTY_RESOURCE_NOTES,
    noteConstraints,
    Boolean(currentUser),
    currentUser ? `resource-notes:${currentUser.id}` : undefined,
  );
  const saveState = useSeededFirestoreCollection<ResourceSave>(
    "resourceSaves", EMPTY_RESOURCE_SAVES, noteConstraints, Boolean(currentUser),
    currentUser ? `resource-saves:${currentUser.id}` : undefined,
  );
  const resource = findResource(resourceState.data, resourceId);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [draft, setDraft] = useState({ title: "", description: "", longDescription: "", tags: "", body: "" });
  const [personalNote, setPersonalNote] = useState("");
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [isSaveBusy, setIsSaveBusy] = useState(false);

  const savedNote = noteState.data.find((note) => note.resourceId === resource?.id);
  const isSaved = saveState.data.some((save) => save.resourceId === resource?.id);
  useEffect(() => {
    setPersonalNote(savedNote?.content ?? "");
  }, [savedNote?.content, resource?.id]);

  if (!resource) {
    return (
      <>
        <PageMeta title="Resource not found" description="This resource could not be found." />
        <section className="app-card">
          <Link to="/app/resources" className="forum-author-link">
            <ArrowLeft size={16} /> Back to resources
          </Link>
          <h1 className="card-title" style={{ marginTop: "1rem" }}>Resource not found</h1>
          <p className="card-copy">This resource may have been moved or removed.</p>
        </section>
      </>
    );
  }

  const relatedResources = resourceState.data
    .filter((item) => item.id !== resource.id)
    .filter(
      (item) =>
        item.category === resource.category ||
        item.format === resource.format ||
        item.tags.some((tag) => resource.tags.includes(tag)),
    )
    .slice(0, 4);
  const isOwner = currentUser?.id === resource.creatorId;
  const beginEditing = () => {
    setDraft({
      title: resource.title,
      description: resource.description,
      longDescription: resource.longDescription ?? resource.description,
      tags: resource.tags.join(", "),
      body: resource.contentSections?.map((section) => section.body).join("\n\n") ?? "",
    });
    setEditMessage("");
    setIsEditing(true);
  };
  const saveEdits = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await updateResource(resource.id, currentUser.id, {
        title: draft.title,
        description: draft.description,
        longDescription: draft.longDescription,
        category: resource.category,
        level: resource.level,
        format: resource.format ?? "All Formats",
        mediaType: resource.mediaType ?? "Article",
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        body: draft.body,
        externalUrl: resource.externalUrl,
        thumbnailUrl: resource.thumbnailUrl,
      });
      setIsEditing(false);
      setEditMessage("Resource updated.");
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "Unable to update resource.");
    } finally {
      setIsSaving(false);
    }
  };
  const savePersonalNote = async () => {
    if (!currentUser) return;
    setIsNoteSaving(true);
    try {
      await saveResourceNote(resource.id, currentUser.id, personalNote);
      setNoteMessage("Notes saved privately.");
    } catch (error) {
      setNoteMessage(error instanceof Error ? error.message : "Unable to save notes.");
    } finally {
      setIsNoteSaving(false);
    }
  };
  const toggleSaved = async () => {
    if (!currentUser) return;
    setIsSaveBusy(true);
    try { await toggleResourceSave(resource.id, currentUser.id); } finally { setIsSaveBusy(false); }
  };

  return (
    <>
      <PageMeta title={resource.title} description={resource.description} />
      <div className="resource-detail-back">
        <Link to="/app/resources" className="forum-author-link">
          <ArrowLeft size={16} /> Back to resources
        </Link>
      </div>

      <section className="resource-detail-hero">
        <div className="resource-detail-media">{renderMedia(resource)}</div>
        <div className="resource-detail-summary">
          <div className="pill-row">
            <span className="pill">{resource.category}</span>
            <span className="forum-mini-pill subtle">{resource.mediaType ?? "Article"}</span>
            {resource.creatorRole ? (
              <span className="forum-mini-pill">{roleLabel(resource.creatorRole)}</span>
            ) : null}
          </div>
          <h1>{resource.title}</h1>
          <p>{resource.description}</p>
          <div className="resource-detail-meta">
            <span>{resource.level}</span>
            <span>{resource.format ?? "All Formats"}</span>
            <span>{resource.estimatedTime ?? "Self-paced"}</span>
            <span>Curated by {resource.curatedBy}</span>
          </div>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="button" className={isSaved ? "forum-action-button is-favorite" : "btn btn-secondary"} disabled={isSaveBusy} onClick={() => void toggleSaved()}>
              <Bookmark size={16} /> {isSaved ? "Saved" : "Save"}
            </button>
            {isOwner ? <button type="button" className="btn btn-ghost" onClick={beginEditing}>Edit resource</button> : null}
            {resource.externalUrl ? (
              <a className="btn btn-primary" href={resource.externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open Link
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {isEditing ? (
        <section className="app-card resource-upload-card">
          <h2 className="card-title">Edit resource</h2>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <div className="form-field full"><label htmlFor="editResourceTitle">Title</label><input id="editResourceTitle" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="form-field full"><label htmlFor="editResourceShort">Short description</label><input id="editResourceShort" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="form-field full"><label htmlFor="editResourceLong">Long description</label><textarea id="editResourceLong" value={draft.longDescription} onChange={(event) => setDraft((current) => ({ ...current, longDescription: event.target.value }))} /></div>
            <div className="form-field full"><label htmlFor="editResourceTags">Tags</label><input id="editResourceTags" value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /></div>
            <div className="form-field full"><label htmlFor="editResourceNotes">Notes</label><textarea id="editResourceNotes" value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></div>
          </div>
          <div className="button-row" style={{ marginTop: "1rem" }}><button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={isSaving} onClick={() => void saveEdits()}>{isSaving ? "Saving..." : "Save changes"}</button></div>
        </section>
      ) : null}
      {editMessage ? <p className="meta-line">{editMessage}</p> : null}

      <section className="resource-detail-layout">
        <article className="app-card resource-detail-content">
          <p className="resource-detail-lead">{resource.longDescription ?? resource.description}</p>
          {(resource.contentSections?.length ? resource.contentSections : [
            {
              title: "Overview",
              body: resource.longDescription ?? resource.description,
            },
          ]).map((section) => (
            <section key={section.title} className="resource-detail-section">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </article>

        <aside className="app-card resource-detail-sidebar">
          <h2 className="card-title">At a glance</h2>
          <dl className="resource-detail-facts">
            <div>
              <dt>Level</dt>
              <dd>{resource.level}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{resource.format ?? "All Formats"}</dd>
            </div>
            <div>
              <dt>Media</dt>
              <dd>{resource.mediaType ?? "Article"}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{resource.estimatedTime ?? "Self-paced"}</dd>
            </div>
          </dl>
          <h2 className="card-title" style={{ marginTop: "1.5rem" }}>Tags</h2>
          <div className="pill-row">
            {resource.tags.map((tag) => (
              <span key={tag} className="pill">
                {tag}
              </span>
            ))}
          </div>
          <h2 className="card-title" style={{ marginTop: "1.5rem" }}>My Notes</h2>
          <textarea
            aria-label="My Notes"
            value={personalNote}
            onChange={(event) => setPersonalNote(event.target.value)}
            placeholder="Write private notes about this resource..."
            style={{ minHeight: "9rem", marginTop: "0.75rem" }}
          />
          <div className="button-row" style={{ justifyContent: "flex-end", marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-primary" disabled={isNoteSaving} onClick={() => void savePersonalNote()}>
              {isNoteSaving ? "Saving..." : "Save notes"}
            </button>
          </div>
          {noteMessage ? <p className="meta-line">{noteMessage}</p> : null}
        </aside>
      </section>

      {relatedResources.length > 0 ? (
        <section>
          <h2 className="section-kicker">Related resources</h2>
          <div className="resources-grid">
            {relatedResources.map((item) => (
              <Link key={item.id} to={`/app/resources/${item.slug || item.id}`} className="resource-card resource-card-link">
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" className="resource-card-media" />
                ) : (
                  <div className="resource-card-media resource-card-media-fallback">{item.mediaType ?? "Article"}</div>
                )}
                <div className="resource-card-body">
                  <span className="pill">{item.category}</span>
                  <h3 className="card-title">{item.title}</h3>
                  <p className="card-copy">{item.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
};
