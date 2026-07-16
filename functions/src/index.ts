import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import OpenAI from "openai";

initializeApp();
setGlobalOptions({ invoker: "public", region: "us-central1" });

const openAiApiKey = defineSecret("OPENAI_API_KEY");
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSizeBytes = 5 * 1024 * 1024;

interface UploadProfilePhotoRequest {
  contentType?: unknown;
  dataBase64?: unknown;
  fileName?: unknown;
}

interface UpdateDisplayNameRequest {
  displayName?: unknown;
}

interface SyncTabroomRequest {
  profileUrl?: unknown;
  handle?: unknown;
  format?: unknown;
  circuit?: unknown;
  year?: unknown;
}

interface DebateLandTournament {
  name?: unknown;
  prelimRecord?: unknown;
  breakRecord?: unknown;
  speaks?: unknown;
  goldBid?: unknown;
  silverBid?: unknown;
}

interface DebateLandTeam {
  id?: unknown;
  otrScore?: unknown;
  goldBids?: unknown;
  silverBids?: unknown;
  prelimRecord?: unknown;
  breakRecord?: unknown;
  tournaments?: unknown;
}

const maxDisplayNameLength = 30;
const displayNameAllowedCharacters = /^[\p{L}\p{N} ._'-]+$/u;
const displayNameUrlOrContactPattern = /https?:\/\/|www\.|\.com\b|\.net\b|\.org\b|@/i;
const displayNameReservedPattern = /\b(admin|moderator|official|staff|support)\b/i;
const displayNameProfanityPattern = /\b(fuck|shit|bitch|asshole|dick|pussy|cunt|slut|whore)\b/i;
const sanitizeFileName = (fileName: string) =>
  fileName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "avatar";

const getUploadInput = (data: UploadProfilePhotoRequest) => {
  const contentType = typeof data.contentType === "string" ? data.contentType : "";
  const dataBase64 = typeof data.dataBase64 === "string" ? data.dataBase64 : "";
  const fileName = typeof data.fileName === "string" ? data.fileName : "avatar";

  if (!allowedImageTypes.has(contentType)) {
    throw new HttpsError("invalid-argument", "Choose a JPG, PNG, or WebP image.");
  }

  if (!dataBase64) {
    throw new HttpsError("invalid-argument", "Image data is required.");
  }

  const imageBuffer = Buffer.from(dataBase64, "base64");
  if (!imageBuffer.length || imageBuffer.byteLength > maxImageSizeBytes) {
    throw new HttpsError("invalid-argument", "Choose an image smaller than 5 MB.");
  }

  return {
    contentType,
    dataUrl: `data:${contentType};base64,${dataBase64}`,
    fileName: sanitizeFileName(fileName),
    imageBuffer,
  };
};

const getAvatarDownloadUrl = (bucketName: string, storagePath: string, token: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    storagePath,
  )}?alt=media&token=${token}`;

const normalizeDisplayName = (displayName: unknown) =>
  typeof displayName === "string" ? displayName.trim().replace(/\s+/g, " ") : "";

const getDisplayNameInput = (data: UpdateDisplayNameRequest) => {
  const displayName = normalizeDisplayName(data.displayName);

  if (!displayName) {
    throw new HttpsError("invalid-argument", "Display name is required.");
  }

  if (displayName.length > maxDisplayNameLength) {
    throw new HttpsError(
      "invalid-argument",
      `Display name must be ${maxDisplayNameLength} characters or fewer.`,
    );
  }

  if (!displayNameAllowedCharacters.test(displayName)) {
    throw new HttpsError(
      "invalid-argument",
      "Display name can use letters, numbers, spaces, periods, apostrophes, underscores, and hyphens.",
    );
  }

  if (
    displayNameUrlOrContactPattern.test(displayName)
    || displayNameReservedPattern.test(displayName)
    || displayNameProfanityPattern.test(displayName)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "That display name could not be accepted. Please choose a different name.",
    );
  }

  return displayName;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Condense a moderation result into something readable in Cloud Functions logs:
// which categories tripped, plus the highest-confidence scores (even for
// categories that didn't trip) so we can see how close a photo was to the line.
const summarizeModeration = (result: OpenAI.Moderation) => {
  const scores = result.category_scores as unknown as Record<string, number>;
  const categories = result.categories as unknown as Record<string, boolean>;

  return {
    flagged: result.flagged,
    flaggedCategories: Object.entries(categories)
      .filter(([, tripped]) => tripped)
      .map(([category]) => category),
    topScores: Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, score]) => `${category}=${score.toFixed(4)}`),
  };
};

const moderateProfilePhoto = async (openai: OpenAI, dataUrl: string) => {
  try {
    return await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        {
          type: "image_url",
          image_url: {
            url: dataUrl,
          },
        },
      ],
    });
  } catch (error) {
    console.error("Profile photo moderation failed:", getErrorMessage(error));
    throw new HttpsError(
      "unavailable",
      "Profile photo moderation is temporarily unavailable. Please try again later.",
    );
  }
};

const deletePreviousAvatar = async (storagePath?: unknown) => {
  if (typeof storagePath !== "string" || !storagePath.startsWith("avatars/")) {
    return;
  }

  try {
    await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
  } catch {
    // A stale avatar object should not block replacing or removing the profile photo.
  }
};

export const uploadProfilePhoto = onCall(
  {
    cors: true,
    invoker: "public",
    memory: "512MiB",
    secrets: [openAiApiKey],
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before changing your profile photo.");
    }

    const uid = request.auth.uid;
    const uploadInput = getUploadInput(request.data as UploadProfilePhotoRequest);
    const openai = new OpenAI({ apiKey: openAiApiKey.value() });
    const moderation = await moderateProfilePhoto(openai, uploadInput.dataUrl);

    const result = moderation.results[0];
    if (result) {
      console.info(
        "Profile photo moderation result:",
        JSON.stringify({ uid, ...summarizeModeration(result) }),
      );
    }

    if (result?.flagged) {
      throw new HttpsError(
        "failed-precondition",
        "That photo could not be accepted. Please choose a different image.",
      );
    }

    const userRef = getFirestore().doc(`users/${uid}`);
    const userSnapshot = await userRef.get();
    const previousStoragePath = userSnapshot.data()?.avatarStoragePath;
    const token = randomUUID();
    const storagePath = `avatars/${uid}/${Date.now()}-${uploadInput.fileName}`;
    const bucket = getStorage().bucket();

    try {
      await bucket.file(storagePath).save(uploadInput.imageBuffer, {
        contentType: uploadInput.contentType,
        metadata: {
          cacheControl: "public, max-age=3600",
          metadata: {
            firebaseStorageDownloadTokens: token,
            moderationModel: moderation.model,
            moderationRequestId: moderation.id,
            uploadedBy: uid,
          },
        },
      });

      const avatarUrl = getAvatarDownloadUrl(bucket.name, storagePath, token);
      await userRef.set(
        {
          avatarStoragePath: storagePath,
          avatarUrl,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await deletePreviousAvatar(previousStoragePath);

      return {
        avatarUrl,
        storagePath,
      };
    } catch (error) {
      console.error("Profile photo save failed:", getErrorMessage(error));
      throw new HttpsError(
        "internal",
        "Unable to save your profile photo right now. Please try again later.",
      );
    }
  },
);

export const updateDisplayName = onCall(
  {
    cors: true,
    invoker: "public",
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before changing your display name.");
    }

    const displayName = getDisplayNameInput(request.data as UpdateDisplayNameRequest);
    await getFirestore().doc(`users/${request.auth.uid}`).set(
      {
        displayName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { displayName };
  },
);

export const removeProfilePhoto = onCall(
  {
    cors: true,
    invoker: "public",
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before changing your profile photo.");
    }

    const userRef = getFirestore().doc(`users/${request.auth.uid}`);
    const userSnapshot = await userRef.get();
    await deletePreviousAvatar(userSnapshot.data()?.avatarStoragePath);
    await userRef.set(
      {
        avatarStoragePath: FieldValue.delete(),
        avatarUrl: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { removed: true };
  },
);

const numberPair = (value: unknown): [number, number] => {
  if (!Array.isArray(value)) return [0, 0];
  return [Number(value[0]) || 0, Number(value[1]) || 0];
};

const tabroomInput = (data: SyncTabroomRequest) => {
  const profileUrl = typeof data.profileUrl === "string" ? data.profileUrl.trim() : "";
  const handle = typeof data.handle === "string" ? data.handle.trim() : "";
  const format = typeof data.format === "string" ? data.format.toUpperCase() : "PF";
  const circuit = typeof data.circuit === "string" ? data.circuit.trim() : "National";
  const year = typeof data.year === "string" ? data.year.trim().toUpperCase() : "";

  if (!handle || handle.length > 100) {
    throw new HttpsError("invalid-argument", "Enter the debater or team name used on Tabroom.");
  }
  if (!new Set(["PF", "LD", "CX"]).has(format)) {
    throw new HttpsError("invalid-argument", "Choose Public Forum, Lincoln-Douglas, or Policy.");
  }
  if (!/^SY_\d{2}_\d{2}$/.test(year)) {
    throw new HttpsError("invalid-argument", "Enter a school year such as SY_25_26.");
  }
  if (profileUrl && !/^https:\/\/(www\.)?tabroom\.com\//i.test(profileUrl)) {
    throw new HttpsError("invalid-argument", "Enter a valid tabroom.com profile URL.");
  }

  return { profileUrl, handle, format, circuit, year };
};

export const syncTabroom = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before syncing Tabroom.");
    }

    const input = tabroomInput(request.data as SyncTabroomRequest);
    const uid = request.auth.uid;
    const startedAt = new Date().toISOString();
    const db = getFirestore();
    const linkRef = db.doc(`tabroomLinks/tabroom-link-${uid}`);
    const importRef = db.doc(`tabroomImports/tabroom-import-${uid}`);

    await Promise.all([
      linkRef.set({ userId: uid, ...input, status: "syncing" }, { merge: true }),
      importRef.set({ userId: uid, status: "syncing", startedAt }, { merge: true }),
    ]);

    try {
      const query = new URLSearchParams({
        format: input.format,
        circuit: input.circuit,
        year: input.year,
        term: input.handle,
      });
      const response = await fetch(`https://tournaments.tech/query?${query}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`Debate.land returned HTTP ${response.status}.`);
      }

      const payload = await response.json() as unknown;
      const teams = Array.isArray(payload) ? payload as DebateLandTeam[] : [];
      const team = teams[0];
      if (!team) {
        throw new HttpsError("not-found", "No matching Tabroom entry was found for that season and circuit.");
      }

      const [prelimWins, prelimLosses] = numberPair(team.prelimRecord);
      const [breakWins, breakLosses] = numberPair(team.breakRecord);
      const wins = prelimWins + breakWins;
      const losses = prelimLosses + breakLosses;
      const tournaments = Array.isArray(team.tournaments)
        ? team.tournaments as DebateLandTournament[]
        : [];
      const speakerPoints = tournaments.flatMap((tournament) =>
        Array.isArray(tournament.speaks)
          ? tournament.speaks
              .map((speech) => Number((speech as { adjAVG?: unknown }).adjAVG))
              .filter(Number.isFinite)
          : [],
      );
      const averageSpeakerPoints = speakerPoints.length
        ? Number((speakerPoints.reduce((sum, score) => sum + score, 0) / speakerPoints.length).toFixed(2))
        : 0;
      const events = tournaments.map((tournament, index) => {
        const [eventPrelimWins, eventPrelimLosses] = numberPair(tournament.prelimRecord);
        const [eventBreakWins, eventBreakLosses] = numberPair(tournament.breakRecord);
        return {
          id: `tabroom-${index}-${String(tournament.name ?? "event").replace(/\W+/g, "-").toLowerCase()}`,
          name: String(tournament.name ?? "Tabroom tournament"),
          date: startedAt,
          result: `${eventPrelimWins + eventBreakWins}-${eventPrelimLosses + eventBreakLosses}`,
          sourceUrl: input.profileUrl || "https://www.tabroom.com/",
        };
      });
      const stats = {
        wins,
        losses,
        averageSpeakerPoints,
        otrScore: Number(team.otrScore) || 0,
        goldBids: Number(team.goldBids) || 0,
        silverBids: Number(team.silverBids) || 0,
      };

      await Promise.all([
        linkRef.set({
          userId: uid,
          ...input,
          teamId: typeof team.id === "string" ? team.id : "",
          status: "linked",
          lastSyncedAt: startedAt,
        }, { merge: true }),
        importRef.set({
          userId: uid,
          status: "success",
          startedAt,
          lastSuccessfulAt: startedAt,
          errorMessage: FieldValue.delete(),
          events,
          stats,
        }, { merge: true }),
        db.doc(`userStats/stats-${uid}`).set({
          userId: uid,
          wins,
          losses,
          averageScore: averageSpeakerPoints,
          winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
          totalRounds: wins + losses,
          tabroomSyncedAt: startedAt,
        }, { merge: true }),
      ]);

      return { events, stats };
    } catch (error) {
      const message = error instanceof HttpsError ? error.message : getErrorMessage(error);
      await Promise.all([
        linkRef.set({ status: "error" }, { merge: true }),
        importRef.set({ status: "error", errorMessage: message }, { merge: true }),
      ]);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("unavailable", `Unable to sync Tabroom: ${message}`);
    }
  },
);
