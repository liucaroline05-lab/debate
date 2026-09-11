import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BookOpen,
  LayoutDashboard,
  MessageSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Swords,
  Users,
} from "lucide-react";
import { AuthOverlay } from "@/features/auth/AuthOverlay";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { useAuth } from "@/features/auth/AuthContext";
import { APP_NAME } from "@/lib/constants";

const appLinks = [
  { to: "/app/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/app/speeches/new", label: "Record / Upload", Icon: Mic },
  { to: "/app/debates", label: "Async Debate", Icon: Swords },
  { to: "/app/resources", label: "Resources", Icon: BookOpen },
  { to: "/app/community", label: "Community", Icon: Users },
  { to: "/app/messages", label: "Messages", Icon: MessageSquare },
  { to: "/app/settings", label: "Settings", Icon: Settings },
];

const SIDEBAR_STORAGE_KEY = "debate-studio:sidebar-collapsed";

const readCollapsedPreference = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const AppLayout = () => {
  const { currentUser, logout } = useAuth();
  const isLocked = !currentUser;
  const profileName = currentUser?.displayName ?? "Guest preview";
  const profileRole = currentUser?.role ?? "Log in to continue";
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readCollapsedPreference);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
    } catch {
      // A blocked storage API just means the choice is not remembered.
    }
  }, [isSidebarCollapsed]);

  return (
    <div className="app-layout-shell">
      <div className={isLocked ? "app-layout-stage is-locked" : "app-layout-stage"}>
        <div className={isSidebarCollapsed ? "app-layout is-sidebar-collapsed" : "app-layout"}>
          <aside className="app-sidebar-wrap">
            <div className="app-sidebar">
              <NavLink to="/app/dashboard" className="brand">
                <span className="brand-mark">
                  <span className="brand-orb" />
                  {APP_NAME}
                </span>
                <small>Speech workspace</small>
              </NavLink>

              {currentUser ? (
                <NavLink
                  to="/app/profile"
                  className="sidebar-profile-card"
                  style={{ marginTop: "1.5rem" }}
                >
                  {currentUser.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={`${currentUser.displayName} avatar`}
                      className="sidebar-profile-avatar"
                    />
                  ) : (
                    <div className="sidebar-profile-avatar sidebar-profile-fallback" aria-hidden="true">
                      {currentUser.displayName.charAt(0)}
                    </div>
                  )}
                  <strong className="sidebar-profile-name">{profileName}</strong>
                  <span className="sidebar-profile-role">{profileRole}</span>
                </NavLink>
              ) : (
                <div className="sidebar-profile-card sidebar-profile-card-static" style={{ marginTop: "1.5rem" }}>
                  <div className="sidebar-profile-avatar sidebar-profile-fallback" aria-hidden="true">
                    {APP_NAME.charAt(0)}
                  </div>
                  <strong className="sidebar-profile-name">{profileName}</strong>
                  <span className="sidebar-profile-role">{profileRole}</span>
                </div>
              )}

              <nav className="app-nav" aria-label="App sections">
                {appLinks.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => (isActive ? "active" : undefined)}
                    title={isSidebarCollapsed ? label : undefined}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span className="app-nav-label">{label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </aside>

          <div className="app-content">
            <div className="app-topbar">
              <div className="app-topbar-bar">
                <div className="cluster">
                  <button
                    type="button"
                    className="sidebar-toggle"
                    aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-pressed={isSidebarCollapsed}
                    onClick={() => setIsSidebarCollapsed((current) => !current)}
                  >
                    {isSidebarCollapsed ? (
                      <PanelLeftOpen size={20} aria-hidden="true" />
                    ) : (
                      <PanelLeftClose size={20} aria-hidden="true" />
                    )}
                  </button>
                </div>
                <div className="button-row">
                  {currentUser ? (
                    <>
                      <NotificationsBell userId={currentUser.id} />
                      <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
                        Log out
                      </button>
                    </>
                  ) : (
                    <span className="pill">Previewing the workspace</span>
                  )}
                </div>
              </div>
            </div>

            <Outlet />
          </div>
        </div>
      </div>

      {isLocked ? <AuthOverlay /> : null}
    </div>
  );
};
