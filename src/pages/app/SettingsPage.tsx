import { useState } from "react";
import { PageMeta } from "@/components/common/PageMeta";
import { useAuth } from "@/features/auth/AuthContext";
import { defaultUserPreferences } from "@/features/users/defaultProfile";

const safeInitial = (value?: string | null) =>
  value?.trim()?.charAt(0).toUpperCase() || "D";

export const SettingsPage = () => {
  const { currentUser, isDemoMode } = useAuth();
  const profile = currentUser;

  if (!profile) {
    return (
      <section className="empty-state">
        <h2 className="card-title">Settings unavailable</h2>
        <p className="card-copy">Sign in with Firebase to manage your account settings.</p>
      </section>
    );
  }

  const resolvedPreferences = {
    notifications: {
      ...defaultUserPreferences.notifications,
      ...profile.preferences?.notifications,
    },
    debateDefaults: {
      ...defaultUserPreferences.debateDefaults,
      ...profile.preferences?.debateDefaults,
    },
  };
  const [notifications, setNotifications] = useState(resolvedPreferences.notifications);
  const [debateDefaults, setDebateDefaults] = useState(resolvedPreferences.debateDefaults);

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <>
      <PageMeta
        title="Settings"
        description="Manage account details, profile photo, notifications, and debate preferences."
      />
      <header className="route-header">
        <p className="eyebrow">Settings</p>
        <h1>Account details and practice preferences.</h1>
      </header>

      <section className="settings-grid">
        <article className="app-card">
          <h2 className="card-title">Account</h2>
          <div className="list" style={{ marginTop: "1rem" }}>
            <div className="list-item">
              <strong>Display name</strong>
              <span className="meta-line">{profile.displayName}</span>
            </div>
            <div className="list-item">
              <strong>Email</strong>
              <span className="meta-line">{profile.email}</span>
            </div>
            <div className="list-item">
              <strong>Account type</strong>
              <span className="meta-line">{profile.role}</span>
            </div>
            <div className="list-item">
              <strong>Session status</strong>
              <span className="meta-line">
                {isDemoMode ? "Firebase configuration required" : "Firebase account session"}
              </span>
            </div>
          </div>
        </article>

        <article className="app-card">
          <h2 className="card-title">Profile photo</h2>
          <div className="settings-avatar-panel">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={`${profile.displayName} avatar`}
                className="settings-avatar-image"
              />
            ) : (
              <div className="settings-avatar-image settings-avatar-fallback" aria-hidden="true">
                {safeInitial(profile.displayName)}
              </div>
            )}
            <div className="stack">
              <p className="card-copy">
                Your account is now modeled with a stored avatar URL. Upload and
                replace controls can connect to Firebase Storage in a later pass.
              </p>
              <div className="button-row">
                <button type="button" className="btn btn-secondary">
                  Replace photo
                </button>
                <button type="button" className="btn btn-ghost">
                  Remove photo
                </button>
              </div>
            </div>
          </div>
        </article>

        <article className="app-card">
          <h2 className="card-title">Notifications</h2>
          <div className="stack" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="settings-toggle-row"
              onClick={() => toggleNotification("speechFeedback")}
            >
              <div>
                <strong>Speech feedback alerts</strong>
                <span className="meta-line">Know when coach notes or transcript feedback arrives.</span>
              </div>
              <span className={notifications.speechFeedback ? "settings-toggle is-on" : "settings-toggle"}>
                {notifications.speechFeedback ? "On" : "Off"}
              </span>
            </button>
            <button
              type="button"
              className="settings-toggle-row"
              onClick={() => toggleNotification("debateTurnReminders")}
            >
              <div>
                <strong>Async debate reminders</strong>
                <span className="meta-line">Get reminded when it is your turn to post a round response.</span>
              </div>
              <span className={notifications.debateTurnReminders ? "settings-toggle is-on" : "settings-toggle"}>
                {notifications.debateTurnReminders ? "On" : "Off"}
              </span>
            </button>
            <button
              type="button"
              className="settings-toggle-row"
              onClick={() => toggleNotification("communityReplies")}
            >
              <div>
                <strong>Community replies</strong>
                <span className="meta-line">Stay updated when someone answers your post or review thread.</span>
              </div>
              <span className={notifications.communityReplies ? "settings-toggle is-on" : "settings-toggle"}>
                {notifications.communityReplies ? "On" : "Off"}
              </span>
            </button>
            <button
              type="button"
              className="settings-toggle-row"
              onClick={() => toggleNotification("tournamentReminders")}
            >
              <div>
                <strong>Tournament and practice reminders</strong>
                <span className="meta-line">Receive reminders for team events, scrimmages, and prep deadlines.</span>
              </div>
              <span className={notifications.tournamentReminders ? "settings-toggle is-on" : "settings-toggle"}>
                {notifications.tournamentReminders ? "On" : "Off"}
              </span>
            </button>
          </div>
        </article>

        <article className="app-card">
          <h2 className="card-title">Debate preferences</h2>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <div className="form-field">
              <label htmlFor="preferredFormat">Preferred format</label>
              <select
                id="preferredFormat"
                value={debateDefaults.preferredFormat}
                onChange={(event) =>
                  setDebateDefaults((current) => ({
                    ...current,
                    preferredFormat: event.target.value as typeof current.preferredFormat,
                  }))
                }
              >
                <option>Policy</option>
                <option>Lincoln-Douglas</option>
                <option>Public Forum</option>
                <option>Congress</option>
                <option>Extemp</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="preferredSide">Preferred side</label>
              <select
                id="preferredSide"
                value={debateDefaults.preferredSide}
                onChange={(event) =>
                  setDebateDefaults((current) => ({
                    ...current,
                    preferredSide: event.target.value as typeof current.preferredSide,
                  }))
                }
              >
                <option>Aff</option>
                <option>Neg</option>
                <option>Either</option>
              </select>
            </div>

            <div className="form-field full">
              <label htmlFor="cadence">Async response cadence</label>
              <select
                id="cadence"
                value={debateDefaults.asyncResponseCadence}
                onChange={(event) =>
                  setDebateDefaults((current) => ({
                    ...current,
                    asyncResponseCadence: event.target.value as typeof current.asyncResponseCadence,
                  }))
                }
              >
                <option>12 hours</option>
                <option>24 hours</option>
                <option>48 hours</option>
              </select>
            </div>
          </div>
        </article>
      </section>
    </>
  );
};
