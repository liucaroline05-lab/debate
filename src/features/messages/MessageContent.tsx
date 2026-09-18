import { ArrowUpRight, Play } from "lucide-react";
import { Link } from "react-router-dom";
import type { ChatSharedPreview } from "@/types/models";

const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;
const SHARED_LINE = /^(.+?) — (https?:\/\/\S+)$/;

const safeHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
};

const internalDestination = (url: URL) => {
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === "/app/community" && url.hash && !url.searchParams.has("post")) {
    try {
      return `/app/community?post=${encodeURIComponent(decodeURIComponent(url.hash.slice(1)))}`;
    } catch {
      return null;
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

const linkify = (content: string) => {
  const parts: React.ReactNode[] = [];
  let previousEnd = 0;

  for (const match of content.matchAll(URL_PATTERN)) {
    const start = match.index;
    if (start > previousEnd) parts.push(content.slice(previousEnd, start));

    const raw = match[0];
    const href = raw.replace(/[.,!?;:)]+$/, "");
    const trailing = raw.slice(href.length);
    const parsed = safeHttpUrl(href);
    const internal = parsed && internalDestination(parsed);
    parts.push(
      parsed ? (
        internal ? (
          <Link key={start} to={internal}>{href}</Link>
        ) : (
          <a key={start} href={href} target="_blank" rel="noopener noreferrer">{href}</a>
        )
      ) : raw,
    );
    if (trailing) parts.push(trailing);
    previousEnd = start + raw.length;
  }

  if (previousEnd < content.length) parts.push(content.slice(previousEnd));
  return parts;
};

const recoverLegacyShare = (content: string): { note: string; preview: ChatSharedPreview } | null => {
  const lastLine = content.split("\n").at(-1) ?? "";
  const match = lastLine.match(SHARED_LINE);
  if (!match) return null;
  const parsed = safeHttpUrl(match[2]);
  if (!parsed || parsed.origin !== window.location.origin) return null;

  const kind = parsed.pathname === "/app/community"
    ? "post"
    : /^\/app\/debates\/[^/]+$/.test(parsed.pathname)
      ? "debate"
      : /^\/app\/speeches\/[^/]+$/.test(parsed.pathname)
        ? "speech"
        : null;
  if (!kind) return null;

  return {
    note: content.slice(0, -lastLine.length).trim(),
    preview: { kind, title: match[1], url: match[2] },
  };
};

export const MessageContent = ({
  content,
  sharedPreview,
}: {
  content: string;
  sharedPreview?: ChatSharedPreview;
}) => {
  const legacy = sharedPreview ? null : recoverLegacyShare(content);
  const preview = sharedPreview ?? legacy?.preview;
  const parsed = preview && safeHttpUrl(preview.url);
  const destination = parsed && internalDestination(parsed);
  const shareLine = sharedPreview && `${sharedPreview.title} — ${sharedPreview.url}`;
  const note = legacy?.note ?? (shareLine && content.endsWith(shareLine)
    ? content.slice(0, -shareLine.length).trim()
    : sharedPreview ? content : "");

  if (!preview || !parsed) {
    return <div className="message-bubble">{linkify(content)}</div>;
  }

  const media = preview.media?.slice(0, 3).filter((item) =>
    (item.kind === "image" || item.kind === "video") && safeHttpUrl(item.url),
  ) ?? [];
  const extraMediaCount = Math.max(0, (preview.mediaCount ?? media.length) - 3);

  const card = (
    <>
      {media.length ? (
        <span className={`message-share-media count-${media.length}`}>
          {media.map((item) => (
            <span key={`${item.kind}-${item.url}`} className="message-share-media-item">
              {item.kind === "image" ? (
                <img src={item.url} alt={item.name} loading="lazy" />
              ) : (
                <>
                  <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline aria-label={item.name} />
                  <span className="message-share-play"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
                </>
              )}
            </span>
          ))}
          {extraMediaCount > 0 ? (
            <span className="message-share-more">+{extraMediaCount}</span>
          ) : null}
        </span>
      ) : null}
      <span className="message-share-copy">
        <span className="message-share-kind">Shared {preview.kind}</span>
        <strong>{preview.title}</strong>
        <span className="message-share-open">View {preview.kind} <ArrowUpRight size={14} aria-hidden="true" /></span>
      </span>
    </>
  );

  return (
    <div className="message-bubble is-shared">
      {note ? <div className="message-share-note">{linkify(note)}</div> : null}
      {destination ? (
        <Link className="message-share-card" to={destination}>{card}</Link>
      ) : (
        <a className="message-share-card" href={parsed.href} target="_blank" rel="noopener noreferrer">{card}</a>
      )}
    </div>
  );
};
