import { useEffect, useRef, useState } from "react";
import { ChangeEvent } from "react";
import { PageMeta } from "@/components/common/PageMeta";
import { useAuth } from "@/features/auth/AuthContext";
import {
  allowedAvatarImageTypes,
  maxAvatarImageSizeBytes,
  removeProfilePhoto,
  uploadProfilePhoto,
} from "@/features/profile/avatarService";
import { maxDisplayNameLength } from "@/features/profile/profileService";
import { defaultUserPreferences } from "@/features/users/defaultProfile";
import type { UserRole } from "@/types/models";

const accountTypes: Array<{ value: UserRole; label: string }> = [
  { value: "student", label: "Student" },
  { value: "coach", label: "Coach" },
];

const safeInitial = (value?: string | null) =>
  value?.trim()?.charAt(0).toUpperCase() || "D";

export const SettingsPage = () => {
  const { currentUser, isDemoMode, updateProfile } = useAuth();
  const profile = currentUser;
  const resolvedPreferences = {
    notifications: {
      ...defaultUserPreferences.notifications,
      ...profile?.preferences?.notifications,
    },
    debateDefaults: {
      ...defaultUserPreferences.debateDefaults,
      ...profile?.preferences?.debateDefaults,
    },
  };
  const [notifications, setNotifications] = useState(resolvedPreferences.notifications);
  const [debateDefaults, setDebateDefaults] = useState(resolvedPreferences.debateDefaults);
  const [roleMessage, setRoleMessage] = useState("");
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(profile?.displayName ?? "");
  const [accountMessage, setAccountMessage] = useState("");
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [bioDraft, setBioDraft] = useState(profile?.bio ?? "");
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreviewUrl, setPendingAvatarPreviewUrl] = useState("");
  const [shouldRemoveAvatar, setShouldRemoveAvatar] = useState(false);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setNotifications({
      ...defaultUserPreferences.notifications,
      ...profile.preferences?.notifications,
    });
    setDebateDefaults({
      ...defaultUserPreferences.debateDefaults,
      ...profile.preferences?.debateDefaults,
    });
    setDisplayNameDraft(profile.displayName ?? "");
    setBioDraft(profile.bio ?? "");
  }, [profile]);

  useEffect(() => {
    if (!pendingAvatarFile) {
      setPendingAvatarPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(pendingAvatarFile);
    setPendingAvatarPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [pendingAvatarFile]);

  if (!profile) {
    return (
      <section className="empty-state">
        <h2 className="card-title">Settings unavailable</h2>
        <p className="card-copy">Sign in with Firebase to manage your account settings.</p>
      </section>
    );
  }

  const handleAvatarSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    input.value = "";

    if (!file || isSavingAvatar) {
      return;
    }

    setAvatarMessage("");

    if (!allowedAvatarImageTypes.includes(file.type)) {
      setAvatarMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > maxAvatarImageSizeBytes) {
      setAvatarMessage("Choose an image smaller than 5 MB.");
      return;
    }

    setPendingAvatarFile(file);
    setShouldRemoveAvatar(false);
    setAvatarMessage("Photo ready to save.");
  };

  const handleAvatarRemove = () => {
    if (isSavingAvatar || (!profile.avatarUrl && !pendingAvatarFile)) {
      return;
    }

    setPendingAvatarFile(null);
    setShouldRemoveAvatar(true);
    setAvatarMessage("Photo will be removed when you save.");
  };

  const saveProfileCard = async () => {
    if (isSavingAvatar) {
      return;
    }

    setAvatarMessage("");
    setIsSavingAvatar(true);

    try {
      const updates: Parameters<typeof updateProfile>[0] = {
        bio: bioDraft,
      };

      if (pendingAvatarFile) {
        const result = await uploadProfilePhoto(pendingAvatarFile);
        updates.avatarUrl = result.avatarUrl;
        updates.avatarStoragePath = result.storagePath;
      } else if (shouldRemoveAvatar) {
        await removeProfilePhoto();
        updates.avatarUrl = undefined;
        updates.avatarStoragePath = undefined;
      }

      await updateProfile(updates);
      setPendingAvatarFile(null);
      setShouldRemoveAvatar(false);
      setAvatarMessage(
        isDemoMode
          ? "Saved for this session. Connect Firebase to save it to your account."
          : "Profile changes saved.",
      );
    } catch (error) {
      setAvatarMessage(
        error instanceof Error
          ? error.message
          : "Unable to save profile changes right now. Please try again later.",
      );
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const saveDisplayName = async () => {
    if (isSavingDisplayName) {
      return;
    }

    const nextDisplayName = displayNameDraft.trim();
    if (!nextDisplayName) {
      setAccountMessage("Add a display name before saving.");
      return;
    }

    if (nextDisplayName.length > maxDisplayNameLength) {
      setAccountMessage(`Display name must be ${maxDisplayNameLength} characters or fewer.`);
      return;
    }

    if (nextDisplayName === profile.displayName) {
      setAccountMessage("Display name is already up to date.");
      return;
    }

    setAccountMessage("");
    setIsSavingDisplayName(true);

    try {
      await updateProfile({ displayName: nextDisplayName });
      setAccountMessage(
        isDemoMode
          ? "Saved for this session. Connect Firebase to save it to your account."
          : "Display name saved.",
      );
    } catch (error) {
      setAccountMessage(
        error instanceof Error ? error.message : "Unable to update your display name right now.",
      );
    } finally {
      setIsSavingDisplayName(false);
    }
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
            <div className="list-item settings-display-name-item">
              <div className="form-field">
                <label htmlFor="settingsDisplayName">Display name</label>
                <input
                  id="settingsDisplayName"
                  value={displayNameDraft}
                  maxLength={maxDisplayNameLength}
                  onChange={(event) => setDisplayNameDraft(event.target.value)}
                />
                <span className="meta-line">
                  {displayNameDraft.trim().length}/{maxDisplayNameLength} characters
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary settings-display-name-save"
                disabled={isSavingDisplayName}
                onClick={() => void saveDisplayName()}
              >
                {isSavingDisplayName ? "Saving..." : "Save"}
              </button>
            </div>
            {accountMessage ? (
              <p className="meta-line" aria-live="polite" style={{ marginTop: "0.25rem" }}>
                {accountMessage}
              </p>
            ) : null}
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
            {pendingAvatarPreviewUrl ? (
              <img
                src={pendingAvatarPreviewUrl}
                alt="Selected profile preview"
                className="settings-avatar-image"
              />
            ) : profile.avatarUrl && !shouldRemoveAvatar ? (
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
              <div>
                <input
                  id="avatarFile"
                  ref={avatarFileInputRef}
                  type="file"
                  accept={allowedAvatarImageTypes.join(",")}
                  className="file-input-native"
                  disabled={isSavingAvatar}
                  onChange={handleAvatarSelect}
                />
                <label
                  htmlFor="avatarFile"
                  className={
                    isSavingAvatar
                      ? "btn settings-avatar-replace-button is-disabled"
                      : "btn settings-avatar-replace-button"
                  }
                  aria-disabled={isSavingAvatar}
                >
                  Replace photo
                </label>
              </div>

              <button
                type="button"
                className="btn btn-primary forum-primary-cta"
                disabled={isSavingAvatar || (!profile.avatarUrl && !pendingAvatarFile)}
                onClick={handleAvatarRemove}
              >
                Remove photo
              </button>
            </div>
            <div className="form-field settings-bio-field">
              <label htmlFor="profileBio">Bio</label>
              <textarea
                id="profileBio"
                className="profile-bio-input"
                value={bioDraft}
                onChange={(event) => setBioDraft(event.target.value)}
                placeholder="Tell other debaters about your events, goals, coaching style, or team."
              />
            </div>
            <button
              type="button"
              className="btn btn-primary forum-primary-cta settings-profile-save-button"
              disabled={isSavingAvatar}
              onClick={() => void saveProfileCard()}
            >
              {isSavingAvatar ? "Saving..." : "Save changes"}
            </button>
            {avatarMessage ? (
              <p className="meta-line" aria-live="polite">
                {avatarMessage}
              </p>
            ) : null}
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
