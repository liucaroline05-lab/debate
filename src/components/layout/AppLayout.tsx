import { NavLink, Outlet } from "react-router-dom";
import { AuthOverlay } from "@/features/auth/AuthOverlay";
import { useAuth } from "@/features/auth/AuthContext";
import { APP_NAME } from "@/lib/constants";

const appLinks = [
  { to: "/app/dashboard", label: "Dashboard" },
  { to: "/app/speeches/new", label: "Record / Upload" },
  { to: "/app/debates", label: "Async Debate" },
  { to: "/app/resources", label: "Resources" },
  { to: "/app/community", label: "Community" },
  { to: "/app/settings", label: "Settings" },
];

export const AppLayout = () => {
  const { currentUser, logout } = useAuth();
  const isLocked = !currentUser;
  const profileName = currentUser?.displayName ?? "Guest preview";
  const profileRole = currentUser?.role ?? "Log in to continue";

  return (
    <div className="app-layout-shell">
      <div className={isLocked ? "app-layout-stage is-locked" : "app-layout-stage"}>
        <div className="app-layout">
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
                {appLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) => (isActive ? "active" : undefined)}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </aside>

          <div className="app-content">
            <div className="app-topbar">
              <div className="app-topbar-bar">
                <div className="cluster" />
                <div className="button-row">
                  {currentUser ? (
                    <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
                      Log out
                    </button>
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
