import { Link } from "react-router-dom";

const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;

export const MessageContent = ({ content }: { content: string }) => {
  const parts: React.ReactNode[] = [];
  let previousEnd = 0;

  for (const match of content.matchAll(URL_PATTERN)) {
    const start = match.index;
    if (start > previousEnd) parts.push(content.slice(previousEnd, start));

    const raw = match[0];
    const href = raw.replace(/[.,!?;:)]+$/, "");
    const trailing = raw.slice(href.length);
    try {
      const parsed = new URL(href);
      parts.push(
        parsed.origin === window.location.origin ? (
          <Link key={start} to={`${parsed.pathname}${parsed.search}${parsed.hash}`}>{href}</Link>
        ) : (
          <a key={start} href={href} target="_blank" rel="noopener noreferrer">{href}</a>
        ),
      );
    } catch {
      parts.push(raw);
    }
    if (trailing) parts.push(trailing);
    previousEnd = start + raw.length;
  }

  if (previousEnd < content.length) parts.push(content.slice(previousEnd));
  return <>{parts}</>;
};
