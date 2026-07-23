import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import { Flag, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import {
  seededChannels,
  seededDebates,
  seededEvents,
  seededResources,
} from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import {
  deleteSpeechRecord,
  reportSpeechRecord,
} from "@/features/speeches/speechService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import { formatDate, formatDateTime } from "@/lib/date";
import type { SpeechRecord } from "@/types/models";

const EMPTY_SPEECH_SEEDS: SpeechRecord[] = [];

export const DashboardPage = () => {
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const [menuSpeechId, setMenuSpeechId] = useState<string | null>(null);
  const [speechMessage, setSpeechMessage] = useState("");
  const speechConstraints = useMemo<QueryConstraint[]>(
    () => (currentUserId ? [where("creatorId", "==", currentUserId)] : []),
    [currentUserId],
  );
  const speechState = useSeededFirestoreCollection<SpeechRecord>(
    "speeches",
    EMPTY_SPEECH_SEEDS,
    speechConstraints,
    Boolean(currentUserId),
    currentUserId ? `speeches:owner:${currentUserId}` : undefined,
  );
  const debateState = useSeededFirestoreCollection("debates", seededDebates);
  const resourceState = useSeededFirestoreCollection("resources", seededResources);
  const channelState = useSeededFirestoreCollection("channels", seededChannels);
  const eventState = useSeededFirestoreCollection("events", seededEvents);
  const dashboardDebates = useMemo(
    () => debateState.data.filter((debate) =>
      (debate.participantIds ?? []).includes(currentUser?.id ?? ""),
    ),
    [currentUser?.id, debateState.data],
  );
  const savedResources = useMemo(
    () => resourceState.data.filter((resource) => resource.saved),
    [resourceState.data],
  );
  const followedChannels = useMemo(() => {
    const ids = new Set(currentUser?.activeChannelIds ?? []);
    return ids.size ? channelState.data.filter((channel) => ids.has(channel.id)) : channelState.data;
  }, [channelState.data, currentUser?.activeChannelIds]);
  const upcomingEvents = useMemo(
    () => [...eventState.data].sort((left, right) => left.date.localeCompare(right.date)),
    [eventState.data],
  );

  const handleDeleteSpeech = async (speechId: string) => {
    await deleteSpeechRecord(speechId);
    setMenuSpeechId(null);
    setSpeechMessage("Speech deleted.");
  };

  const handleReportSpeech = async (speechId: string) => {
    await reportSpeechRecord(speechId);
    setMenuSpeechId(null);
    setSpeechMessage("Speech reported.");
  };

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
              <div key={speech.id} className="list-item speech-list-item">
                <NavLink
                  to={`/app/speeches/${speech.id}`}
                  className="speech-list-link"
                >
                  <strong>{speech.title}</strong>
                  <span className="meta-line">
                    {speech.format} • {speech.status} • {formatDateTime(speech.uploadedAt)}
                  </span>
                </NavLink>
                <div className="forum-post-menu">
                  <button
                    type="button"
                    className="forum-icon-button"
                    aria-label={`Actions for ${speech.title}`}
                    onClick={() =>
                      setMenuSpeechId(menuSpeechId === speech.id ? null : speech.id)
                    }
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuSpeechId === speech.id ? (
                    <div className="forum-menu-dropdown">
                      {speech.creatorId === currentUser?.id ? (
                        <>
                          <NavLink
                            className="forum-menu-item"
                            to={`/app/speeches/${speech.id}?mode=edit`}
                            onClick={() => setMenuSpeechId(null)}
                          >
                            <Pencil size={16} /> Edit
                          </NavLink>
                          <button
                            type="button"
                            className="forum-menu-item"
                            onClick={() => void handleDeleteSpeech(speech.id)}
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="forum-menu-item"
                          onClick={() => void handleReportSpeech(speech.id)}
                        >
                          <Flag size={16} /> Report
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {speechMessage ? <p className="meta-line">{speechMessage}</p> : null}
        </article>

        <article className="app-card">
          <span className="pill">Upcoming</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Events
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {upcomingEvents.map((event) => (
              <div key={event.id} className="list-item">
                <strong>{event.name}</strong>
                <span className="meta-line">
                  {event.type} • {event.location} • {formatDate(event.date)}
                </span>
              </div>
            ))}
          </div>
          {upcomingEvents.length === 0 ? <p className="card-copy">No upcoming events. Sync Tabroom from your profile to import tournament data.</p> : null}
          <NavLink to="/app/profile#tabroom" className="btn btn-ghost" style={{ marginTop: "1rem" }}>Manage synced events</NavLink>
        </article>

        <article className="app-card">
          <span className="pill">Async practice</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Debate threads
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {dashboardDebates.map((debate) => (
              <NavLink key={debate.id} to={`/app/debates/${debate.id}`} className="list-item dashboard-list-link">
                <strong>{debate.topic}</strong>
                <span className="meta-line">
                  {debate.status} • Due {formatDateTime(debate.nextDeadline)}
                </span>
              </NavLink>
            ))}
          </div>
          {dashboardDebates.length === 0 ? <p className="card-copy">No debate threads yet. Create or join one from Async Debate.</p> : null}
        </article>

        <article className="app-card">
          <span className="pill">Saved</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Resource library
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {savedResources.map((resource) => (
              <NavLink key={resource.id} to={`/app/resources/${resource.slug ?? resource.id}`} className="list-item dashboard-list-link">
                <strong>{resource.title}</strong>
                <span className="meta-line">
                  {resource.category} • {resource.level} • Curated by {resource.curatedBy}
                </span>
              </NavLink>
            ))}
          </div>
          {savedResources.length === 0 ? <p className="card-copy">Save resources to keep them close at hand.</p> : null}
        </article>

        <article className="app-card">
          <span className="pill">Followed community</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            Channels
          </h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            {followedChannels.map((channel) => (
              <NavLink key={channel.id} to={`/app/community?channel=${channel.id}`} className="list-item dashboard-list-link">
                <strong>{channel.name}</strong>
                <span className="meta-line">
                  {channel.followers} members • {channel.topicTags.join(" • ")}
                </span>
              </NavLink>
            ))}
          </div>
        </article>
      </section>
    </>
  );
};
