import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Bell, MessageCircle, Mic } from "lucide-react";
import { useNotifications } from "@/features/notifications/useNotifications";

const relativeTime = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";

  const diffMinutes = Math.round((timestamp - Date.now()) / 60_000);
  const absolute = Math.abs(diffMinutes);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absolute < 60) return formatter.format(diffMinutes, "minute");
  if (absolute < 60 * 24) return formatter.format(Math.round(diffMinutes / 60), "hour");
  return formatter.format(Math.round(diffMinutes / (60 * 24)), "day");
};

export const NotificationsBell = ({
  userId,
  historyDays,
}: {
  userId?: string;
  historyDays?: number;
}) => {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId, historyDays);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const toggle = () => {
    setIsOpen((current) => !current);
  };

  return (
    <div className="notifications-wrap" ref={containerRef}>
      <button
        type="button"
        className="notifications-trigger"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="notifications-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="notifications-panel" role="dialog" aria-label="Notifications">
          <div className="notifications-panel-header">
            <strong>Notifications</strong>
            <span className="meta-line">{notifications.length} total</span>
          </div>

          {unreadCount > 0 ? (
            <button type="button" className="notifications-mark-read" onClick={markAllRead}>
              Mark all as read
            </button>
          ) : null}

          {notifications.length === 0 ? (
            <p className="meta-line notifications-empty">
              Nothing needs your attention right now.
            </p>
          ) : (
            <div className="notifications-list">
              {notifications.map((notification) => (
                <NavLink
                  key={notification.id}
                  to={notification.to}
                  className={notification.isUnread ? "notifications-item is-unread" : "notifications-item"}
                  onClick={() => {
                    markRead(notification);
                    setIsOpen(false);
                  }}
                >
                  <span className="notifications-item-icon">
                    {notification.kind === "message" ? (
                      <MessageCircle size={16} aria-hidden="true" />
                    ) : (
                      <Mic size={16} aria-hidden="true" />
                    )}
                  </span>
                  <span className="notifications-item-copy">
                    <strong>
                      {notification.isUnread ? <span className="notifications-unread-dot" aria-label="Unread" /> : null}
                      {notification.title}
                    </strong>
                    <span>{notification.detail}</span>
                    <small>{relativeTime(notification.timestamp)}</small>
                  </span>
                </NavLink>
              ))}
            </div>
          )}
          <NavLink to="/app/settings" className="notifications-settings-link" onClick={() => setIsOpen(false)}>
            Notification settings
          </NavLink>
        </div>
      ) : null}
    </div>
  );
};
