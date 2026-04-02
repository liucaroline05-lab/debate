import { NavLink } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { channels, debateThreads, events, resources, speeches } from "@/data/mockData";
import { useFirebaseCollection } from "@/hooks/useFirebaseCollection";
import { formatDate, formatDateTime } from "@/lib/date";

export const DashboardPage = () => {
  const speechState = useFirebaseCollection("speeches", speeches);
  const debateState = useFirebaseCollection("debates", debateThreads);
  const resourceState = useFirebaseCollection("resources", resources);
  const channelState = useFirebaseCollection("channels", channels);
  const eventState = useFirebaseCollection("events", events);

  return (
    <>
      <PageMeta
        title="Dashboard"
        description="See recent uploads, upcoming events, community activity, and saved resources."
      />

      <header className="route-header">
        <p className="eyebrow">Dashboard</p>
        <h1>Your debate week at a glance.</h1>
        <p>
          Uploaded speeches, next rounds, saved study material, and followed
          channels are all organized here.
        </p>
      </header>

      <section className="dashboard-grid">
        <article className="app-card">
          <div className="row-between">
            <div>
              <span className="pill">Next actions</span>
              <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
                Recent speeches
              </h2>
            </div>
            <NavLink to="/app/speeches/new" className="btn btn-primary">
              Upload another
            </NavLink>
          </div>
          <div className="list" style={{ marginTop: "1rem" }}>
            {speechState.data.map((speech) => (
              <NavLink
                key={speech.id}
                to={`/app/speeches/${speech.id}`}
                className="list-item"
              >
                <strong>{speech.title}</strong>
                <span className="meta-line">
                  {speech.format} • {speech.status} • {formatDateTime(speech.uploadedAt)}
                </span>
              </NavLink>
            ))}
          </div>
        </article>

        <article className="app-card">
          <span className="pill">Upcoming</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Events
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {eventState.data.map((event) => (
              <div key={event.id} className="list-item">
                <strong>{event.name}</strong>
                <span className="meta-line">
                  {event.type} • {event.location} • {formatDate(event.date)}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card">
          <span className="pill">Async practice</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Debate threads
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {debateState.data.map((debate) => (
              <div key={debate.id} className="list-item">
                <strong>{debate.topic}</strong>
                <span className="meta-line">
                  {debate.status} • Due {formatDateTime(debate.nextDeadline)}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card">
          <span className="pill">Saved</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Resource library
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {resourceState.data.map((resource) => (
              <div key={resource.id} className="list-item">
                <strong>{resource.title}</strong>
                <span className="meta-line">
                  {resource.category} • {resource.level} • Curated by {resource.curatedBy}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card">
          <span className="pill">Followed community</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Channels
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {channelState.data.map((channel) => (
              <div key={channel.id} className="list-item">
                <strong>{channel.name}</strong>
                <span className="meta-line">
                  {channel.followers} members • {channel.topicTags.join(" • ")}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
};
