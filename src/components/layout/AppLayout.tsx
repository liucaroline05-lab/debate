import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";

const appLinks = [
  { to: "/app/dashboard", label: "Dashboard" },
  { to: "/app/speeches/new", label: "Record / Upload" },
  { to: "/app/debates", label: "Async Debate" },
  { to: "/app/resources", label: "Resources" },
  { to: "/app/community", label: "Community" },
  { to: "/app/profile", label: "Profile" },
];

export const AppLayout = () => {
  const { currentUser, isDemoMode, logout } = useAuth();

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

          <div className="organic-panel" style={{ marginTop: "1.5rem" }}>
            <p className="eyebrow">Workspace</p>
            <h2 className="display">{currentUser?.displayName}</h2>
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              {currentUser?.role === "coach"
                ? "Coaching rounds, guiding community, and curating growth."
                : "Uploading speeches, finding partners, and building confidence."}
            </p>
            <div className="pill-row">
              <span className="pill">{currentUser?.role}</span>
              {isDemoMode ? <span className="pill">Demo mode</span> : null}
            </div>
          </div>

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
