import { useRef, useState } from "react";
import { ChangeEvent } from "react";
import { getAuth } from "firebase/auth";
import { PageMeta } from "@/components/common/PageMeta";
import { useAuth } from "@/features/auth/AuthContext";
import { defaultUserPreferences } from "@/features/users/defaultProfile";
import type { UserRole } from "@/types/models";

const accountTypes: Array<{ value: UserRole; label: string }> = [
  { value: "student", label: "Student" },
  { value: "coach", label: "Coach" },
];

const safeInitial = (value?: string | null) =>
  value?.trim()?.charAt(0).toUpperCase() || "D";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSizeBytes = 5 * 1024 * 1024; // 5MB

export const SettingsPage = () => {
  const { currentUser, isDemoMode, updateProfile } = useAuth();
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
  const [roleMessage, setRoleMessage] = useState("");
  const [isSavingRole, setIsSavingRole] = useState(false);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    input.value = "";

    if (!file || isSavingAvatar) {
      return;
    }

    setAvatarMessage("");

    // TODO: add UX to inform user on what files to upload

    setIsSavingAvatar(true);

    try {
      const authToken = await getAuth().currentUser?.getIdToken();

      if (!authToken) {
        throw new Error("User not authenticated");
      }

      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch("/api")
    } catch {
      setAvatarMessage("Unable to upload avatar right now. Please try again later.");
    }
  }

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const changeRole = async (nextRole: UserRole) => {
    if (nextRole === profile.role || isSavingRole) {
      return;
    }

    setRoleMessage("");
    setIsSavingRole(true);

    try {
      await updateProfile({ role: nextRole });
      setRoleMessage(
        isDemoMode
          ? "Switched for this session. Connect Firebase to save it to your account."
          : `Account type updated to ${nextRole === "coach" ? "Coach" : "Student"}.`,
      );
    } catch {
      setRoleMessage("Unable to update your account type right now.");
    } finally {
      setIsSavingRole(false);
    }
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
              <strong>Session status</strong>
              <span className="meta-line">
                {isDemoMode ? "Firebase configuration required" : "Firebase account session"}
              </span>
            </div>
            <div className="list-item settings-account-type">
              <div>
                <strong>Account type</strong>
                <span className="meta-line">
                  Coaches unlock roster and review tools.
                </span>
              </div>
              <div
                className="settings-segment"
                role="group"
                aria-label="Account type"
              >
                {accountTypes.map((accountType) => {
                  const isActive = profile.role === accountType.value;

                  return (
                    <button
                      key={accountType.value}
                      type="button"
                      className={isActive ? "settings-segment-option is-on" : "settings-segment-option"}
                      aria-pressed={isActive}
                      disabled={isSavingRole}
                      onClick={() => void changeRole(accountType.value)}
                    >
                      {accountType.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {roleMessage ? (
              <p className="meta-line" style={{ marginTop: "0.25rem" }}>
                {roleMessage}
              </p>
            ) : null}
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
            <div className="button-row settings-avatar-actions">
              {/* <s */}
              <div>
                <input
                  id="resourceFile"
                  type="file"
                  accept="audio/*,video/*"
                  className="file-input-native-tall"
                  // onChange={
                  //   (event) =>
                  //   setComposer((current) => ({
                  //     ...current,
                  //     file: event.target.files?.[0] ?? null,
                  //   }))
                  // }
                />
                <label htmlFor="resourceFile" className="file-input-trigger">
                  Replace Photo
                </label>
                {/* <span className={composer.file ? "file-input-name has-file" : "file-input-name"}>
                  {composer.file ? composer.file.name : "No file chosen"}
                </span> */}
              </div>

              <button type="button" className="btn btn-primary forum-primary-cta">
                Remove photo
              </button>
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
