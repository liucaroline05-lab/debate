import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileUp,
  Search,
  Upload,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededResources } from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import { createResource } from "@/features/resources/resourceService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ResourceItem } from "@/types/models";

const categories: Array<"All" | ResourceItem["category"]> = [
  "All",
  "Case Building",
  "Rebuttal",
  "Research",
  "Delivery",
];
const levels: Array<"All" | ResourceItem["level"]> = ["All", "Starter", "Growth", "Advanced"];
const formats: Array<"All" | NonNullable<ResourceItem["format"]>> = [
  "All",
  "All Formats",
  "Policy",
  "Lincoln-Douglas",
  "Public Forum",
  "Congress",
  "Extemp",
];
const mediaTypes: Array<"All" | NonNullable<ResourceItem["mediaType"]>> = [
  "All",
  "Article",
  "Audio",
  "Video",
  "Link",
  "Worksheet",
];

const initialComposer = {
  title: "",
  category: "Research" as ResourceItem["category"],
  description: "",
  level: "Starter" as ResourceItem["level"],
  format: "All Formats" as NonNullable<ResourceItem["format"]>,
  mediaType: "Link" as NonNullable<ResourceItem["mediaType"]>,
  tags: "",
  body: "",
  externalUrl: "",
  thumbnailUrl: "",
  file: null as File | null,
};

const roleLabel = (role?: string) =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : "Curator";

const getResourcePath = (resource: ResourceItem) =>
  `/app/resources/${resource.slug || resource.id}`;

export const ResourcesPage = () => {
  const { currentUser } = useAuth();
  const resourceState = useSeededFirestoreCollection("resources", seededResources);
  const uploadRef = useRef<HTMLDivElement | null>(null);
  const uploadTitleRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [level, setLevel] = useState<(typeof levels)[number]>("All");
  const [format, setFormat] = useState<(typeof formats)[number]>("All");
  const [mediaType, setMediaType] = useState<(typeof mediaTypes)[number]>("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [composer, setComposer] = useState(initialComposer);
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const allTags = useMemo(
    () => Array.from(new Set(resourceState.data.flatMap((resource) => resource.tags))).sort(),
    [resourceState.data],
  );

  const filtered = useMemo(() => {
    const loweredQuery = query.toLowerCase().trim();

    return resourceState.data.filter((resource) => {
      const searchableText = [
        resource.title,
        resource.description,
        resource.curatedBy,
        resource.category,
        resource.level,
        resource.format,
        resource.mediaType,
        ...(resource.tags ?? []),
        ...(resource.contentSections ?? []).flatMap((section) => [section.title, section.body]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = loweredQuery ? searchableText.includes(loweredQuery) : true;
      const matchesCategory = category === "All" || resource.category === category;
      const matchesLevel = level === "All" || resource.level === level;
      const matchesFormat = format === "All" || resource.format === format;
      const matchesMedia = mediaType === "All" || resource.mediaType === mediaType;
      const matchesSaved = savedOnly ? resource.saved : true;

      return (
        matchesQuery &&
        matchesCategory &&
        matchesLevel &&
        matchesFormat &&
        matchesMedia &&
        matchesSaved
      );
    });
  }, [category, format, level, mediaType, query, resourceState.data, savedOnly]);

  const featuredResources = useMemo(
    () => resourceState.data.filter((resource) => resource.saved).slice(0, 12),
    [resourceState.data],
  );

  const featuredTrackRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateFeaturedScroll = useCallback(() => {
    const track = featuredTrackRef.current;
    if (!track) return;
    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 1);
  }, []);

  const scrollFeatured = (direction: "left" | "right") => {
    const track = featuredTrackRef.current;
    if (!track) return;
    const amount = track.clientWidth * 0.8;
    track.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  useEffect(() => {
    updateFeaturedScroll();
    window.addEventListener("resize", updateFeaturedScroll);
    return () => window.removeEventListener("resize", updateFeaturedScroll);
  }, [updateFeaturedScroll, featuredResources.length]);

  const submitResource = async () => {
    if (!currentUser) {
      setMessage("Sign in before uploading a resource.");
      return;
    }

    setIsUploading(true);
    setMessage("");

    try {
      await createResource({
        ...composer,
        curatedBy: currentUser.displayName || "Debate Studio Member",
        creatorId: currentUser.id,
        creatorRole: currentUser.role,
        tags: composer.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setComposer(initialComposer);
      setIsUploadOpen(false);
      setMessage("Resource uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload resource.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Resources"
        description="Search, filter, save, and upload curated speech and debate resources."
      />
      <header className="route-header">
        <div className="row-between">
          <div>
            <p className="eyebrow">Resources</p>
            <h1>A curated library for research, rebuttal, and delivery.</h1>
            <p>
              Browse topic hubs with media, notes, and practice moves built for
              the moments between rounds.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary forum-primary-cta"
            onClick={() => {
              setIsUploadOpen(true);
              window.setTimeout(() => {
                uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                uploadTitleRef.current?.focus();
              }, 180);
            }}
          >
            <Upload size={18} /> Upload Resource
          </button>
        </div>
      </header>

      {isUploadOpen ? (
      <section ref={uploadRef} className="forum-composer-card resource-upload-card composer-slide-down">
        <div className="forum-author-row">
          <div className="forum-avatar">
            <FileUp size={18} />
          </div>
          <div className="space-apart">
            <strong>Upload a resource</strong>
            <span className="meta-line">
              Audio, video, links, and notes are available to signed-in members.
            </span>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: "1rem" }}>
          <div className="form-field">
            <label htmlFor="resourceTitle">Title</label>
            <input
              id="resourceTitle"
              ref={uploadTitleRef}
              value={composer.title}
              onChange={(event) => setComposer((current) => ({ ...current, title: event.target.value }))}
              placeholder="Evidence triage drill"
            />
          </div>
          <div className="form-field">
            <label htmlFor="resourceCategory">Category</label>
            <select
              id="resourceCategory"
              value={composer.category}
              onChange={(event) =>
                setComposer((current) => ({
                  ...current,
                  category: event.target.value as ResourceItem["category"],
                }))
              }
            >
              {categories.filter((item) => item !== "All").map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="form-field full">
            <label htmlFor="resourceDescription">Short description</label>
            <input
              id="resourceDescription"
              value={composer.description}
              onChange={(event) =>
                setComposer((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="What will this help debaters do?"
            />
          </div>
          <div className="form-field">
            <label htmlFor="resourceLevel">Level</label>
            <select
              id="resourceLevel"
              value={composer.level}
              onChange={(event) =>
                setComposer((current) => ({
                  ...current,
                  level: event.target.value as ResourceItem["level"],
                }))
              }
            >
              {levels.filter((item) => item !== "All").map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="resourceFormat">Format</label>
            <select
              id="resourceFormat"
              value={composer.format}
              onChange={(event) =>
                setComposer((current) => ({
                  ...current,
                  format: event.target.value as NonNullable<ResourceItem["format"]>,
                }))
              }
            >
              {formats.filter((item) => item !== "All").map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="resourceMediaType">Media type</label>
            <select
              id="resourceMediaType"
              value={composer.mediaType}
              onChange={(event) =>
                setComposer((current) => ({
                  ...current,
                  mediaType: event.target.value as NonNullable<ResourceItem["mediaType"]>,
                }))
              }
            >
              {mediaTypes.filter((item) => item !== "All").map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="resourceTags">Tags</label>
            <input
              id="resourceTags"
              value={composer.tags}
              onChange={(event) => setComposer((current) => ({ ...current, tags: event.target.value }))}
              placeholder="Research, PF, Weighing"
            />
          </div>
          <div className="form-field">
            <label htmlFor="resourceLink">External link</label>
            <input
              id="resourceLink"
              value={composer.externalUrl}
              onChange={(event) =>
                setComposer((current) => ({ ...current, externalUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="form-field">
            <label htmlFor="resourceFile">Audio/video file</label>
            <div className="file-input-shell">
              <input
                id="resourceFile"
                type="file"
                accept="audio/*,video/*"
                className="file-input-native"
                onChange={(event) =>
                  setComposer((current) => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
              />
              <label htmlFor="resourceFile" className="file-input-trigger">
                Choose file
              </label>
              <span className={composer.file ? "file-input-name has-file" : "file-input-name"}>
                {composer.file ? composer.file.name : "No file chosen"}
              </span>
            </div>
          </div>
          <div className="form-field full">
            <label htmlFor="resourceThumbnail">Thumbnail URL</label>
            <input
              id="resourceThumbnail"
              value={composer.thumbnailUrl}
              onChange={(event) =>
                setComposer((current) => ({ ...current, thumbnailUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="form-field full">
            <label htmlFor="resourceBody">Notes</label>
            <textarea
              id="resourceBody"
              value={composer.body}
              onChange={(event) => setComposer((current) => ({ ...current, body: event.target.value }))}
              placeholder="Add drills, instructions, examples, or context for the resource."
            />
          </div>
        </div>

        <div className="forum-composer-footer">
          <span className="meta-line">{message || "Resources appear in the library after upload."}</span>
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={() => setIsUploadOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary forum-primary-cta"
              disabled={isUploading}
              onClick={() => void submitResource()}
            >
              {isUploading ? "Uploading..." : "Publish Resource"}
            </button>
          </div>
        </div>
      </section>
      ) : null}

      <section className="app-card resource-filter-panel">
        <label className="forum-search resource-search" htmlFor="resourceSearch">
          <Search size={18} />
          <input
            id="resourceSearch"
            placeholder="Search titles, tags, curators, formats, or topic notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="resource-filter-grid">
          <div className="form-field">
            <label htmlFor="category">Category</label>
            <select id="category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="level">Level</label>
            <select id="level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>
              {levels.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="format">Format</label>
            <select id="format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
              {formats.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="mediaType">Media</label>
            <select id="mediaType" value={mediaType} onChange={(event) => setMediaType(event.target.value as typeof mediaType)}>
              {mediaTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="resource-filter-footer">
          <label className="forum-action-button">
            <input
              type="checkbox"
              checked={savedOnly}
              onChange={(event) => setSavedOnly(event.target.checked)}
            />
            <Bookmark size={16} /> Saved only
          </label>
          <span className="meta-line">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        {allTags.length > 0 ? (
          <div className="pill-row" style={{ marginTop: "1rem" }}>
            {allTags.slice(0, 10).map((tag) => (
              <button key={tag} type="button" className="pill resource-tag-button" onClick={() => setQuery(tag)}>
                {tag}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {featuredResources.length > 0 ? (
        <section className="resource-featured" aria-label="Recommended resources">
          <h2 className="card-title">Recommended for you</h2>
          <div className="resource-featured-viewport">
            <button
              type="button"
              className="carousel-button carousel-button-left"
              aria-label="Scroll featured resources left"
              onClick={() => scrollFeatured("left")}
              disabled={!canScrollLeft}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="resource-featured-row" ref={featuredTrackRef} onScroll={updateFeaturedScroll}>
              {featuredResources.map((resource, index) => (
                <Link key={resource.id} to={getResourcePath(resource)} className={index === 1 ? "resource-featured-card is-center" : "resource-featured-card"}>
                  <span className="pill">{resource.category}</span>
                  <strong>{resource.title}</strong>
                  <span className="meta-line">
                    {resource.level} • {resource.mediaType ?? "Article"} • {resource.estimatedTime ?? "Quick read"}
                  </span>
                </Link>
              ))}
            </div>
            <button
              type="button"
              className="carousel-button carousel-button-right"
              aria-label="Scroll featured resources right"
              onClick={() => scrollFeatured("right")}
              disabled={!canScrollRight}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </section>
      ) : null}

      <section className="resources-grid">
        {filtered.map((resource) => (
          <Link key={resource.id} to={getResourcePath(resource)} className="resource-card resource-card-link">
            {resource.thumbnailUrl ? (
              <img src={resource.thumbnailUrl} alt="" className="resource-card-media" />
            ) : (
              <div className="resource-card-media resource-card-media-fallback">{resource.mediaType ?? "Article"}</div>
            )}
            <div className="resource-card-body">
              <div className="resource-card-kicker">
                <span className="pill">{resource.category}</span>
                <span className="forum-mini-pill subtle">{resource.mediaType ?? "Article"}</span>
              </div>
              <h3 className="card-title">{resource.title}</h3>
              <p className="card-copy">{resource.description}</p>
              <p className="meta-line">
                {resource.level} • {resource.format ?? "All Formats"} • Curated by {resource.curatedBy}
              </p>
              <div className="pill-row" style={{ marginTop: "1rem" }}>
                {resource.creatorRole ? (
                  <span className="forum-mini-pill">{roleLabel(resource.creatorRole)}</span>
                ) : null}
                {resource.externalUrl ? (
                  <span className="forum-mini-pill subtle">
                    <ExternalLink size={13} /> Link
                  </span>
                ) : null}
                {resource.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="pill">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </section>

      {filtered.length === 0 ? (
        <section className="app-card">
          <h2 className="card-title">No resources found</h2>
          <p className="card-copy">Try a broader search or clear one of the filters.</p>
        </section>
      ) : null}
    </>
  );
};
