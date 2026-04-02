import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { useAuth } from "@/features/auth/AuthContext";

export const LoginPage = () => {
  const { login, loginWithGoogle, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/app/dashboard";
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      await login(form);
      navigate(redirectTo, { replace: true });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to log in right now.",
      );
    }
  };

  const handleGoogleLogin = async () => {
    setError("");

    try {
      await loginWithGoogle();
      navigate(redirectTo, { replace: true });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to continue with Google right now.",
      );
    }
  };

  return (
    <>
      <PageMeta
        title="Log In"
        description="Access the Debate Studio dashboard, uploads, resources, and community."
      />
      <section className="auth-layout">
        <form className="auth-card" onSubmit={handleSubmit}>
          <p className="eyebrow">Welcome back</p>
          <h1>Step back into your practice space.</h1>
          <p className="muted">
            {isDemoMode
              ? "Firebase is not configured yet, so login uses a local demo session."
              : "Use your email or Google account to continue."}
          </p>

          <div className="form-grid" style={{ marginTop: "1.5rem" }}>
            <div className="form-field full">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="maya@example.com"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </div>
            <div className="form-field full">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </div>
          </div>

          {error ? <p className="meta-line">{error}</p> : null}

          <div className="button-row" style={{ marginTop: "1.25rem" }}>
            <button type="submit" className="btn btn-primary">
              Log in
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleGoogleLogin()}
            >
              Continue with Google
            </button>
          </div>

          <p className="meta-line" style={{ marginTop: "1rem" }}>
            Need an account? <Link to="/signup">Create one here.</Link>
          </p>
        </form>
      </section>
    </>
  );
};
