import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";

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

  return (
    <div className="app-layout">
      <aside className="app-sidebar-wrap">
        <div className="app-sidebar">
          <NavLink to="/" className="brand">
            <span className="brand-mark">
              <span className="brand-orb" />
              Debate Studio
            </span>
            <small>Boho practice hub</small>
          </NavLink>

          <NavLink to="/app/profile" className="sidebar-profile-card" style={{ marginTop: "1.5rem" }}>
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={`${currentUser.displayName} avatar`}
                className="sidebar-profile-avatar"
              />
            ) : (
              <div className="sidebar-profile-avatar sidebar-profile-fallback" aria-hidden="true">
                {currentUser?.displayName?.charAt(0) ?? "D"}
              </div>
            )}
            <strong className="sidebar-profile-name">{currentUser?.displayName}</strong>
            <span className="sidebar-profile-role">{currentUser?.role}</span>
          </NavLink>

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
            <div className="cluster">
              <span className="pill">Students + Coaches</span>
              <span className="pill">Firebase-ready</span>
            </div>
            <div className="button-row">
              <NavLink to="/" className="btn btn-ghost">
                Public site
              </NavLink>
              <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
                Log out
              </button>
            </div>
          </div>
        </div>

        <Outlet />
      </div>
    </div>
  );
};
