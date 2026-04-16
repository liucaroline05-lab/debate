import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageMeta } from "@/components/common/PageMeta";
import { useAuth } from "@/features/auth/AuthContext";
import type { UserRole } from "@/types/models";

export const SignupPage = () => {
  const { signup, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    role: "student" as UserRole,
  });
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      await signup(form);
      navigate("/app/dashboard", { replace: true });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create your account right now.",
      );
    }
  };

  return (
    <>
      <PageMeta
        title="Sign Up"
        description="Create a Debate Studio account for students and coaches."
      />
      <section className="auth-layout">
        <form className="auth-card" onSubmit={handleSubmit}>
          <p className="eyebrow">Create your space</p>
          <h1>Open a calm, structured home for your debate work.</h1>
          <p className="muted">
            {isDemoMode
              ? "Firebase needs to be configured before new accounts can be created."
              : "Student and coach onboarding uses Firebase Authentication and stores a role-aware profile."}
          </p>

          <div className="form-grid" style={{ marginTop: "1.5rem" }}>
            <div className="form-field">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                placeholder="Maya Rivera"
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.target.value }))
                }
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as UserRole,
                  }))
                }
              >
                <option value="student">Student</option>
                <option value="coach">Coach</option>
              </select>
            </div>
            <div className="form-field full">
              <label htmlFor="signupEmail">Email</label>
              <input
                id="signupEmail"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </div>
            <div className="form-field full">
              <label htmlFor="signupPassword">Password</label>
              <input
                id="signupPassword"
                type="password"
                placeholder="At least 8 characters"
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
              Create account
            </button>
          </div>

          <p className="meta-line" style={{ marginTop: "1rem" }}>
            Already have an account? <Link to="/login">Log in instead.</Link>
          </p>
        </form>
      </section>
    </>
  );
};
