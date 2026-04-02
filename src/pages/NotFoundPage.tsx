import { NavLink } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";

export const NotFoundPage = () => (
  <>
    <PageMeta
      title="Page Not Found"
      description="The page you were looking for does not exist."
    />
    <section className="auth-layout">
      <div className="auth-card">
        <p className="eyebrow">Page not found</p>
        <h1>The round has moved somewhere else.</h1>
        <p className="muted">
          Try heading back to the homepage or opening the dashboard.
        </p>
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <NavLink to="/" className="btn btn-primary">
            Go home
          </NavLink>
          <NavLink to="/app/dashboard" className="btn btn-secondary">
            Open dashboard
          </NavLink>
        </div>
      </div>
    </section>
  </>
);
