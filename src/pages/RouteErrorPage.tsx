import { NavLink, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { NotFoundPage } from "@/pages/NotFoundPage";

const getErrorDetail = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
};

/**
 * Router error boundary. A 404 still renders the friendly not-found page, but a
 * component that throws while rendering now says so instead of masquerading as
 * a missing route — a crash in one page used to be indistinguishable from a bad
 * URL, which sent debugging in the wrong direction.
 */
export const RouteErrorPage = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  const detail = getErrorDetail(error);
  console.error("Route render failed:", error);

  return (
    <>
      <PageMeta
        title="Something went wrong"
        description="This page could not be displayed."
      />
      <section className="auth-layout">
        <div className="auth-card">
          <p className="eyebrow">Something went wrong</p>
          <h1>This page could not be displayed.</h1>
          <p className="muted">
            The page failed while loading. Reloading often clears it; if it keeps
            happening, the detail below will point at the cause.
          </p>
          {detail ? <p className="form-error" role="alert">{detail}</p> : null}
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <NavLink to="/app/dashboard" className="btn btn-secondary">
              Open dashboard
            </NavLink>
          </div>
        </div>
      </section>
    </>
  );
};
