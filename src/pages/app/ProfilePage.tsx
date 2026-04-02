import { PageMeta } from "@/components/common/PageMeta";
import { mockUser } from "@/data/mockData";
import { useAuth } from "@/features/auth/AuthContext";

export const ProfilePage = () => {
  const { currentUser, isDemoMode } = useAuth();
  const profile = currentUser ?? mockUser;

  return (
    <>
      <PageMeta
        title="Profile"
        description="Manage your student or coach profile, focus areas, and recommendation metadata."
      />
      <header className="route-header">
        <p className="eyebrow">Profile</p>
        <h1>Your debate identity and coaching focus.</h1>
        <p>
          This page is structured for role-aware onboarding, future AI-assisted
          suggestions, and a cleaner handoff between public signup and app usage.
        </p>
      </header>

      <section className="profile-grid">
        <article className="app-card">
          <span className="pill">{profile.role}</span>
          <h2 className="card-title" style={{ marginTop: "0.75rem" }}>
            {profile.displayName}
          </h2>
          <p className="card-copy">{profile.bio}</p>
          <div className="list" style={{ marginTop: "1rem" }}>
            <div className="list-item">
              <strong>Email</strong>
              <span className="meta-line">{profile.email}</span>
            </div>
            <div className="list-item">
              <strong>Mode</strong>
              <span className="meta-line">{isDemoMode ? "Local demo session" : "Firebase auth session"}</span>
            </div>
          </div>
        </article>

        <article className="app-card">
          <h2 className="card-title">Focus and recommendation metadata</h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            <div className="list-item">
              <strong>Focus areas</strong>
              <span className="meta-line">{profile.focusAreas.join(" • ")}</span>
            </div>
            <div className="list-item">
              <strong>Organization tags</strong>
              <span className="meta-line">{profile.organizationTags.join(" • ")}</span>
            </div>
            <div className="list-item">
              <strong>Recommendation slots</strong>
              <span className="meta-line">{profile.recommendationSlots.join(" • ")}</span>
            </div>
          </div>
        </article>
      </section>
    </>
  );
};
