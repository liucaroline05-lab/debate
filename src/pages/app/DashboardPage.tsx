import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import {
  seededChannels,
  seededDebates,
  seededResources,
} from "@/data/firestoreSeeds";
import { useAuth } from "@/features/auth/AuthContext";
import { deleteSpeechRecord } from "@/features/speeches/speechService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import { formatDate, formatDateTime } from "@/lib/date";
import type {
  ChannelMembership,
  ResourceSave,
  SpeechRecord,
  TabroomImport,
} from "@/types/models";

const EMPTY_SPEECH_SEEDS: SpeechRecord[] = [];
const EMPTY_TABROOM_IMPORTS: TabroomImport[] = [];
const EMPTY_RESOURCE_SAVES: ResourceSave[] = [];
const EMPTY_CHANNEL_MEMBERSHIPS: ChannelMembership[] = [];

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const eventDateKey = (value: string) => value.slice(0, 10);

const dateFromKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

const formatCalendarDate = (value: string, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(dateFromKey(value));

const formatEventRange = (event: TabroomImport["events"][number]) => {
  const start = eventDateKey(event.date);
  const end = event.endDate ? eventDateKey(event.endDate) : start;
  if (start === end) return formatCalendarDate(start);
  return `${formatCalendarDate(start, { month: "short" })} – ${formatCalendarDate(end, {
    month: "short",
  })}`;
};

const getEventDateKeys = (event: TabroomImport["events"][number]) => {
  const start = dateFromKey(eventDateKey(event.date));
  const end = dateFromKey(eventDateKey(event.endDate ?? event.date));
  const lastDate = end >= start ? end : start;
  const keys: string[] = [];

  for (const cursor = new Date(start); cursor <= lastDate; cursor.setDate(cursor.getDate() + 1)) {
    keys.push(toDateKey(cursor));
    // A malformed import should never be able to lock the render in a loop.
    if (keys.length >= 366) break;
  }

  return keys;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 12);

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);

const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);

const uniqueEvents = (events: TabroomImport["events"]) =>
  Array.from(new Map(events.map((event) => [event.id, event])).values());

interface DashboardCalendarProps {
  events: TabroomImport["events"];
}

const DashboardCalendar = ({ events }: DashboardCalendarProps) => {
  const todayKey = toDateKey(new Date());
  const upcomingEvents = useMemo(
    () =>
      uniqueEvents(events)
        .filter((event) => eventDateKey(event.endDate ?? event.date) >= todayKey)
        .sort((left, right) => eventDateKey(left.date).localeCompare(eventDateKey(right.date))),
    [events, todayKey],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, TabroomImport["events"]>();
    uniqueEvents(events).forEach((event) => {
      getEventDateKeys(event).forEach((dateKey) => {
        const dayEvents = grouped.get(dateKey) ?? [];
        grouped.set(dateKey, [...dayEvents, event]);
      });
    });
    return grouped;
  }, [events]);

  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const leadingEmptyDays = startOfMonth(visibleMonth).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1, 12);
    return toDateKey(date);
  });
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  const selectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
  };

  const selectEvent = (event: TabroomImport["events"][number]) => {
    const dateKey = eventDateKey(event.date);
    setSelectedDate(dateKey);
    setVisibleMonth(startOfMonth(dateFromKey(dateKey)));
  };

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => addMonths(current, amount));
    setSelectedDate(null);
  };

  return (
    <article className="app-card dashboard-calendar-card">
      <div className="dashboard-calendar">
        <section className="dashboard-calendar-side" aria-label="Tournament calendar">
          <div className="dashboard-calendar-heading">
            <div>
              <span className="pill"><CalendarDays size={14} aria-hidden="true" /> Tabroom sync</span>
              <h2 className="card-title">Choose a date</h2>
            </div>
            <span className="meta-line">Dates with tournaments are highlighted</span>
          </div>

          <div className="dashboard-calendar-toolbar">
            <button
              type="button"
              className="dashboard-calendar-nav"
              aria-label="Previous month"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <strong>{monthLabel(visibleMonth)}</strong>
            <button
              type="button"
              className="dashboard-calendar-nav"
              aria-label="Next month"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="dashboard-calendar-weekdays" aria-hidden="true">
            {[
              "Sun",
              "Mon",
              "Tue",
              "Wed",
              "Thu",
              "Fri",
              "Sat",
            ].map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>

          <div className="dashboard-calendar-grid" role="grid" aria-label={monthLabel(visibleMonth)}>
            {Array.from({ length: leadingEmptyDays }, (_, index) => (
              <span key={`empty-${index}`} aria-hidden="true" />
            ))}
            {calendarDays.map((dateKey) => {
              const dayEvents = eventsByDate.get(dateKey) ?? [];
              const isSelected = selectedDate === dateKey;
              const isPast = dateKey < todayKey;
              const dayClass = [
                "dashboard-calendar-day",
                dayEvents.length > 0 ? "has-event" : "",
                dayEvents.length > 0 ? (isPast ? "is-past" : "is-upcoming") : "",
                isSelected ? "is-selected" : "",
              ].filter(Boolean).join(" ");

              return (
                <button
                  key={dateKey}
                  type="button"
                  className={dayClass}
                  aria-label={`${formatCalendarDate(dateKey)}${dayEvents.length ? `, ${dayEvents.length} tournament${dayEvents.length === 1 ? "" : "s"}` : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => selectDate(dateKey)}
                >
                  {dateFromKey(dateKey).getDate()}
                  {dayEvents.length > 1 ? <span className="dashboard-calendar-count">{dayEvents.length}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="dashboard-calendar-legend" aria-label="Calendar legend">
            <span><i className="dashboard-calendar-legend-swatch is-upcoming" /> Upcoming</span>
            <span><i className="dashboard-calendar-legend-swatch is-past" /> Past</span>
          </div>
        </section>

        <section className="dashboard-calendar-events" aria-live="polite">
          {selectedDate ? (
            <>
              <div className="dashboard-calendar-events-heading">
                <span className="eyebrow">Selected day</span>
                <h2>{formatCalendarDate(selectedDate)}</h2>
                <p>{selectedEvents.length ? `${selectedEvents.length} tournament${selectedEvents.length === 1 ? "" : "s"} on this day` : "No tournaments on this day"}</p>
              </div>
              {selectedEvents.length ? (
                <div className="dashboard-event-details">
                  {selectedEvents.map((event) => (
                    <div className="dashboard-event-detail" key={event.id}>
                      <div className="dashboard-event-detail-heading">
                        <span className={selectedDate < todayKey ? "dashboard-event-status is-past" : "dashboard-event-status is-upcoming"}>
                          {selectedDate < todayKey ? "Past tournament" : "Upcoming tournament"}
                        </span>
                        <a href={event.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${event.name} on Tabroom`}>
                          <ExternalLink size={17} aria-hidden="true" />
                        </a>
                      </div>
                      <h3>{event.name}</h3>
                      <p className="meta-line">{formatEventRange(event)}</p>
                      {event.location ? <p className="meta-line dashboard-event-location"><MapPin size={14} aria-hidden="true" /> {event.location}</p> : null}
                      {event.result ? <p className="dashboard-event-result"><strong>Result</strong> {event.result}</p> : null}
                      {event.role || event.judgeCategory || event.schoolName ? (
                        <div className="pill-row">
                          {event.role ? <span className="forum-mini-pill">{event.role}</span> : null}
                          {event.judgeCategory ? <span className="forum-mini-pill subtle">{event.judgeCategory}</span> : null}
                          {event.schoolName ? <span className="forum-mini-pill subtle">{event.schoolName}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-calendar-empty">
                  <CalendarDays size={24} aria-hidden="true" />
                  <p>Select a highlighted date to see its tournament details.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="dashboard-calendar-events-heading">
                <span className="eyebrow">Your schedule</span>
                <h2>Upcoming events</h2>
                <p>Future tournaments synced from Tabroom, in chronological order.</p>
              </div>
              {upcomingEvents.length ? (
                <div className="dashboard-upcoming-list">
                  {upcomingEvents.map((event) => (
                    <button type="button" className="dashboard-upcoming-event" key={event.id} onClick={() => selectEvent(event)}>
                      <span className="dashboard-upcoming-date">
                        <strong>{dateFromKey(eventDateKey(event.date)).toLocaleDateString("en-US", { month: "short" })}</strong>
                        <b>{dateFromKey(eventDateKey(event.date)).getDate()}</b>
                      </span>
                      <span className="dashboard-upcoming-copy">
                        <strong>{event.name}</strong>
                        <span>{formatEventRange(event)}</span>
                        {event.location ? <small><MapPin size={13} aria-hidden="true" /> {event.location}</small> : null}
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dashboard-calendar-empty">
                  <CalendarDays size={24} aria-hidden="true" />
                  <p>No upcoming tournaments yet. Sync Tabroom from your profile to import your schedule.</p>
                </div>
              )}
            </>
          )}
          <NavLink to="/app/profile#tabroom" className="btn btn-ghost dashboard-calendar-link">
            Manage synced events
          </NavLink>
        </section>
      </div>
    </article>
  );
};

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
  const tabroomImportState = useSeededFirestoreCollection<TabroomImport>(
    "tabroomImports",
    EMPTY_TABROOM_IMPORTS,
    useMemo<QueryConstraint[]>(
      () => (currentUserId ? [where("userId", "==", currentUserId)] : []),
      [currentUserId],
    ),
    Boolean(currentUserId),
    currentUserId ? `tabroom-imports:${currentUserId}` : undefined,
  );
  const debateState = useSeededFirestoreCollection("debates", seededDebates);
  const resourceState = useSeededFirestoreCollection("resources", seededResources);
  const resourceSaveState = useSeededFirestoreCollection<ResourceSave>(
    "resourceSaves",
    EMPTY_RESOURCE_SAVES,
    useMemo<QueryConstraint[]>(
      () => (currentUserId ? [where("userId", "==", currentUserId)] : []),
      [currentUserId],
    ),
    Boolean(currentUserId),
    currentUserId ? `resource-saves:${currentUserId}` : undefined,
  );
  const channelState = useSeededFirestoreCollection("channels", seededChannels);
  const membershipState = useSeededFirestoreCollection<ChannelMembership>(
    "channelMemberships",
    EMPTY_CHANNEL_MEMBERSHIPS,
    useMemo<QueryConstraint[]>(
      () => (currentUserId ? [where("userId", "==", currentUserId)] : []),
      [currentUserId],
    ),
    Boolean(currentUserId),
    currentUserId ? `channel-memberships:${currentUserId}` : undefined,
  );
  const dashboardDebates = useMemo(
    () => debateState.data.filter((debate) =>
      (debate.participantIds ?? []).includes(currentUser?.id ?? ""),
    ),
    [currentUser?.id, debateState.data],
  );
  const savedResources = useMemo(
    () => {
      const savedIds = new Set(resourceSaveState.data.map((save) => save.resourceId));
      return resourceState.data.filter((resource) => savedIds.has(resource.id));
    },
    [resourceSaveState.data, resourceState.data],
  );
  // Channel membership is recorded in `channelMemberships` when a user creates
  // or joins a group; `activeChannelIds` on the profile is only ever a legacy
  // hint, so relying on it alone left this card permanently empty.
  const followedChannels = useMemo(() => {
    const ids = new Set([
      ...membershipState.data.map((membership) => membership.channelId),
      ...(currentUser?.activeChannelIds ?? []),
    ]);
    return channelState.data.filter((channel) => ids.has(channel.id));
  }, [channelState.data, currentUser?.activeChannelIds, membershipState.data]);
  const upcomingEvents = useMemo(
    () =>
      uniqueEvents(tabroomImportState.data.flatMap((entry) => entry.events ?? [])),
    [tabroomImportState.data],
  );

  const handleDeleteSpeech = async (speechId: string) => {
    await deleteSpeechRecord(speechId);
    setMenuSpeechId(null);
    setSpeechMessage("Speech deleted.");
  };

  return (
    <>
      <PageMeta
        title="Dashboard"
        description="See recent uploads, upcoming events, community activity, and saved resources."
      />

      <header className="route-header">
        <p className="eyebrow">Dashboard</p>
        <h1>Your workspace</h1>
        <p>
          Uploaded speeches, upcoming events, next rounds, saved study material, and followed
          channels are all organized here.
        </p>
      </header>

      <section className="dashboard-grid">
        <DashboardCalendar events={upcomingEvents} />

        <article className="app-card">
          <div className="row-between">
            <div>
              <span className="pill">Next actions</span>
              <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
                Recent speeches
              </h2>
            </div>
            <NavLink to="/app/speeches/new?upload=1" className="btn btn-primary">
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
                        <NavLink
                          className="forum-menu-item"
                          to={`/app/speeches/${speech.id}?report=1`}
                          onClick={() => setMenuSpeechId(null)}
                        >
                          <Flag size={16} /> Report
                        </NavLink>
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
                  {channel.memberCount ?? channel.followers} members
                  {channel.topicTags.length > 0 ? ` • ${channel.topicTags.join(" • ")}` : ""}
                </span>
              </NavLink>
            ))}
          </div>
          {followedChannels.length === 0 ? (
            <p className="card-copy">
              You have not joined a channel yet. Create or join one from Community to see it here.
            </p>
          ) : null}
          <NavLink to="/app/community" className="btn btn-ghost" style={{ marginTop: "1rem" }}>
            Browse channels
          </NavLink>
        </article>
      </section>
    </>
  );
};
