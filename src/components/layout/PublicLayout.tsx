import { NavLink, Outlet } from "react-router-dom";
import { APP_NAME } from "@/lib/constants";

const publicLinks = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/contact", label: "Contact" },
];

export const PublicLayout = () => (
  <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <div className="header-bar section-tight">
          <NavLink to="/" className="brand">
            <span className="brand-mark">
              <span className="brand-orb" />
              {APP_NAME}
            </span>
            <small>Speech, coaching, and community</small>
          </NavLink>

          <nav className="nav-links" aria-label="Primary">
            {publicLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? "active" : undefined)}
                end={link.to === "/"}
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/login" className="btn btn-secondary">
              Log in
            </NavLink>
            <NavLink to="/signup" className="btn btn-primary">
              Start free
            </NavLink>
          </nav>
        </div>
      </div>
    </header>

    <main>
      <Outlet />
    </main>

    <footer className="site-footer">
      <div className="footer-inner">
        <div className="page-shell footer-grid">
          <div>
            <div className="brand-mark">
              <span className="brand-orb" />
              {APP_NAME}
            </div>
            <p className="footer-copy">
              A grounded, beautiful practice space for speeches, async rounds,
              coach feedback, and stronger debate habits.
            </p>
          </div>
          <div className="inline-list">
            {publicLinks.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === "/"}>
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/app/dashboard">Dashboard</NavLink>
          </div>
        </div>
      </div>
    </footer>
  </div>
);
