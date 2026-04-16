import { useMemo, useState } from "react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededResources } from "@/data/firestoreSeeds";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";

export const ResourcesPage = () => {
  const resourceState = useSeededFirestoreCollection("resources", seededResources);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = useMemo(
    () =>
      resourceState.data.filter((resource) => {
        const matchesQuery =
          resource.title.toLowerCase().includes(query.toLowerCase()) ||
          resource.description.toLowerCase().includes(query.toLowerCase());
        const matchesCategory =
          category === "All" ? true : resource.category === category;
        return matchesQuery && matchesCategory;
      }),
    [category, query, resourceState.data],
  );

  return (
    <>
      <PageMeta
        title="Resources"
        description="Search, filter, and save coach-curated speech and debate resources."
      />
      <header className="route-header">
        <p className="eyebrow">Resources</p>
        <h1>A curated library for research, rebuttal, and delivery.</h1>
        <p>
          Filter by category, save your favorites, and grow a workflow that
          stays useful between rounds.
        </p>
      </header>

      <section className="app-card" style={{ marginBottom: "1.5rem" }}>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="query">Search</label>
            <input
              id="query"
              placeholder="Search drills, templates, or topics"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option>All</option>
              <option>Case Building</option>
              <option>Rebuttal</option>
              <option>Research</option>
              <option>Delivery</option>
            </select>
          </div>
        </div>
      </section>

      <section className="resources-grid">
        {filtered.map((resource) => (
          <article key={resource.id} className="resource-card">
            <span className="pill">{resource.category}</span>
            <h3 className="card-title" style={{ marginTop: "0.85rem", fontSize: "1.45rem" }}>
              {resource.title}
            </h3>
            <p className="card-copy">{resource.description}</p>
            <p className="meta-line">
              {resource.level} • Curated by {resource.curatedBy}
            </p>
            <div className="pill-row" style={{ marginTop: "1rem" }}>
              {resource.tags.map((tag) => (
                <span key={tag} className="pill">
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
};
