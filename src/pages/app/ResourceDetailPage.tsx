import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bookmark, ExternalLink } from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededResources } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ResourceItem } from "@/types/models";

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
  const resourceState = useSeededFirestoreCollection("resources", seededResources);
  const resource = findResource(resourceState.data, resourceId);

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
            <button type="button" className="btn btn-secondary">
              <Bookmark size={16} /> {resource.saved ? "Saved" : "Save"}
            </button>
            {resource.externalUrl ? (
              <a className="btn btn-primary" href={resource.externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open Link
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="resource-detail-layout">
        <article className="app-card resource-detail-content">
          <p className="resource-detail-lead">{resource.description}</p>
          {(resource.contentSections?.length ? resource.contentSections : [
            {
              title: "Overview",
              body: resource.description,
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
          <h2 className="card-title" style={{ marginTop: "1.5rem" }}>Practice move</h2>
          <p className="card-copy">
            Use this resource, record a short practice speech, then compare your
            next round notes against the drill.
          </p>
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
