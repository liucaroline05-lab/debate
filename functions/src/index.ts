import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import OpenAI from "openai";
import { openAiApiKey } from "./secrets";

initializeApp();
setGlobalOptions({ invoker: "public", region: "us-central1" });

const tabroomSessionEncryptionKey = defineSecret("TABROOM_SESSION_ENCRYPTION_KEY");
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSizeBytes = 5 * 1024 * 1024;

export {
  summarizeCompletedDebate,
  transcribeDebateSpeech,
} from "./debateAi";
export { retrySpeechSummary, summarizeUploadedSpeech } from "./speechAi";
export { sendModeratedChatAttachment, getChatAttachment } from "./chatAttachments";

interface UploadProfilePhotoRequest {
  contentType?: unknown;
  dataBase64?: unknown;
  fileName?: unknown;
}

interface UpdateDisplayNameRequest {
  displayName?: unknown;
}

interface LinkTabroomSessionRequest {
  email?: unknown;
  password?: unknown;
}

interface EncryptedTabroomSession {
  ciphertext: string;
  iv: string;
  authTag: string;
  version: 1;
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

const getNetworkErrorCode = (error: unknown) => {
  if (!(error instanceof Error) || typeof error.cause !== "object" || error.cause === null) {
    return undefined;
  }
  const code = (error.cause as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

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

/* Legacy Debate.land importer retained below for reference while migrating existing data.
const numberPair = (value: unknown): [number, number] => {
  if (!Array.isArray(value)) return [0, 0];
  return [Number(value[0]) || 0, Number(value[1]) || 0];
};

const debateLandSupportedYears = new Set(["SY_20_21", "SY_21_22"]);

class DebateLandHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`Debate.land returned HTTP ${status}.`);
  }
}

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
    throw new HttpsError("invalid-argument", "Enter a school year such as SY_21_22.");
  }
  if (profileUrl && !/^https:\/\/(www\.)?tabroom\.com\//i.test(profileUrl)) {
    throw new HttpsError("invalid-argument", "Enter a valid tabroom.com profile URL.");
  }
  if (format !== "PF" || circuit.toLowerCase() !== "national" || !debateLandSupportedYears.has(year)) {
    throw new HttpsError(
      "failed-precondition",
      "The Debate.land service only publishes Public Forum / National data for SY_20_21 and SY_21_22. It cannot import current Tabroom seasons.",
    );
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
        const responseBody = (await response.text()).slice(0, 500);
        throw new DebateLandHttpError(response.status, responseBody);
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
      console.error("Tabroom sync failed", {
        uid,
        format: input.format,
        circuit: input.circuit,
        year: input.year,
        upstreamStatus: error instanceof DebateLandHttpError ? error.status : undefined,
        upstreamResponse: error instanceof DebateLandHttpError ? error.responseBody : undefined,
        networkCode: getNetworkErrorCode(error),
        error: message,
      });
      await Promise.all([
        linkRef.set({ status: "error" }, { merge: true }),
        importRef.set({ status: "error", errorMessage: message }, { merge: true }),
      ]);
      if (error instanceof HttpsError) throw error;
      if (error instanceof DebateLandHttpError) {
        if (error.status === 400) {
          throw new HttpsError(
            "failed-precondition",
            `Debate.land rejected this format, circuit, or season.${error.responseBody ? ` ${error.responseBody}` : ""}`,
          );
        }
        if (error.status === 404) {
          throw new HttpsError("not-found", "The Debate.land query endpoint is unavailable.");
        }
        if (error.status === 429) {
          throw new HttpsError("resource-exhausted", "Debate.land is rate limiting requests. Try again later.");
        }
      }
      if (getNetworkErrorCode(error) === "ENOTFOUND") {
        throw new HttpsError(
          "failed-precondition",
          "The legacy Debate.land host is offline. Current Tabroom account sync requires an authenticated Tabroom connection.",
        );
      }
      throw new HttpsError("unavailable", `Unable to sync Tabroom: ${message}`);
    }
  },
);
*/


// ---------------------------------------------------------------------------
// Tabroom account linking and sync.
//
// Tabroom's public REST API lives at https://api.tabroom.com/v1 (its OpenAPI
// document is served from GET /v1). Authentication is `POST /auth/login`,
// which returns { token, Person }; the token is then sent as
// `Authorization: Bearer <token>`. The endpoint this code previously called,
// `/user/profile`, does not exist in that API, which is why linking and
// syncing always failed. `/user/session` is the documented way to read the
// signed-in person, and `/user/tourns` returns their tournament history.
// ---------------------------------------------------------------------------

const tabroomApiBaseUrl = "https://api.tabroom.com/v1";
const tabroomTournUrl = (tournId: number) =>
  `https://www.tabroom.com/index/tourn/index.mhtml?tourn_id=${tournId}`;
// Each per-tournament role summary costs one extra request, so only the most
// recent tournaments are enriched with it.
const maxEnrichedTournaments = 15;
const maxImportedTournaments = 60;

interface TabroomProfileSummary {
  officialUserId: number | null;
  handle: string;
  email: string;
}

interface TabroomEventRecord {
  id: string;
  name: string;
  date: string;
  endDate: string;
  result: string;
  sourceUrl: string;
  location: string;
  role: string;
  judgeCategory: string;
  schoolName: string;
  timezone: string;
}

interface TabroomTournamentSummary {
  roles: string[];
  judgeCategory: string;
  schoolName: string;
}

const getTabroomSecretKey = () => {
  const secret = tabroomSessionEncryptionKey.value();
  if (secret.length < 32) {
    throw new HttpsError(
      "failed-precondition",
      "Tabroom session encryption is not configured. Ask an administrator to set TABROOM_SESSION_ENCRYPTION_KEY.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
};

const encryptTabroomToken = (token: string): EncryptedTabroomSession => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTabroomSecretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    version: 1,
  };
};

const decryptTabroomToken = (session: EncryptedTabroomSession) => {
  if (session.version !== 1) {
    throw new Error("Unsupported Tabroom session encryption version.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getTabroomSecretKey(),
    Buffer.from(session.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(session.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(session.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

const tabroomCredentials = (data: LinkTabroomSessionRequest) => {
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const password = typeof data.password === "string" ? data.password : "";

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    throw new HttpsError("invalid-argument", "Enter the email address used for Tabroom.");
  }
  if (!password || password.length > 500) {
    throw new HttpsError("invalid-argument", "Enter your Tabroom password.");
  }
  return { email, password };
};

const tabroomRequest = async (path: string, init: RequestInit) => {
  try {
    return await fetch(`${tabroomApiBaseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("Tabroom request failed", {
      path,
      networkCode: getNetworkErrorCode(error),
      error: getErrorMessage(error),
    });
    throw new HttpsError("unavailable", "Tabroom could not be reached. Try again shortly.");
  }
};

const authorizedTabroomRequest = (path: string, token: string) =>
  tabroomRequest(path, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });

const loginToTabroom = async (email: string, password: string) => {
  const response = await tabroomRequest("/auth/login", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ username: email, password }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new HttpsError(
      "unauthenticated",
      "Tabroom rejected those credentials. Check your email and password and try again.",
    );
  }
  if (!response.ok) {
    console.error("Tabroom login returned an unexpected status", { status: response.status });
    throw new HttpsError("unavailable", "Tabroom is temporarily unavailable. Try again shortly.");
  }

  const payload = await response.json() as { token?: unknown };
  const token = typeof payload.token === "string" ? payload.token : "";
  if (!token) {
    throw new HttpsError("unavailable", "Tabroom did not return a session token.");
  }
  return token;
};

const normalizeTabroomProfile = (value: unknown): TabroomProfileSummary => {
  const session = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const person = session.Person && typeof session.Person === "object"
    ? session.Person as Record<string, unknown>
    : {};
  const id = Number(person.id);
  const first = typeof person.first === "string" ? person.first.trim() : "";
  const last = typeof person.last === "string" ? person.last.trim() : "";

  return {
    officialUserId: Number.isFinite(id) && id > 0 ? id : null,
    handle: [first, last].filter(Boolean).join(" ") || "Tabroom account",
    email: typeof person.email === "string" ? person.email : "",
  };
};

const fetchTabroomProfile = async (token: string) => {
  const response = await authorizedTabroomRequest("/user/session", token);

  if (response.status === 401 || response.status === 403) {
    throw new HttpsError(
      "unauthenticated",
      "Your Tabroom session has expired. Link your account again.",
    );
  }
  if (!response.ok) {
    console.error("Tabroom session lookup failed", { status: response.status });
    throw new HttpsError("unavailable", "Tabroom could not validate this account.");
  }

  return normalizeTabroomProfile(await response.json() as unknown);
};

const asOptionalString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const formatTabroomLocation = (tourn: Record<string, unknown>) => {
  const city = asOptionalString(tourn.city);
  const state = asOptionalString(tourn.state);
  const country = asOptionalString(tourn.country);
  const parts = [city, state || country].filter(Boolean);
  return parts.join(", ");
};

const asTabroomTournaments = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .filter((tourn): tourn is Record<string, unknown> =>
      Boolean(tourn) && typeof tourn === "object")
    .map((tourn) => ({
      id: Number(tourn.id),
      name: asOptionalString(tourn.name) || "Tabroom tournament",
      start: asOptionalString(tourn.start),
      end: asOptionalString(tourn.end),
      location: formatTabroomLocation(tourn),
      timezone: asOptionalString(tourn.tz),
    }))
    .filter((tourn) => Number.isFinite(tourn.id) && tourn.id > 0)
    // Newest first. The client re-sorts upcoming tournaments ascending so the
    // next one to happen leads, but importing newest-first keeps the slice
    // below biased toward current-season data.
    .sort((left, right) => (right.start || "").localeCompare(left.start || ""))
    .slice(0, maxImportedTournaments);

const emptyTournamentSummary: TabroomTournamentSummary = {
  roles: [],
  judgeCategory: "",
  schoolName: "",
};

const fetchTabroomTournamentSummary = async (
  token: string,
  tournId: number,
): Promise<TabroomTournamentSummary> => {
  try {
    const response = await authorizedTabroomRequest(`/user/tourns/${tournId}/summary`, token);
    if (!response.ok) {
      return emptyTournamentSummary;
    }
    const summary = await response.json() as { roles?: unknown; Judge?: unknown };
    const roles = Array.isArray(summary.roles)
      ? summary.roles
          .filter((role): role is string => typeof role === "string")
          .map((role) => role.charAt(0).toUpperCase() + role.slice(1))
      : [];
    const judge = summary.Judge && typeof summary.Judge === "object"
      ? summary.Judge as Record<string, unknown>
      : {};

    return {
      roles,
      judgeCategory: asOptionalString(judge.categoryName),
      schoolName: asOptionalString(judge.schoolName),
    };
  } catch {
    // One failed enrichment must not fail the whole import.
    return emptyTournamentSummary;
  }
};

const importTabroomTournaments = async (token: string): Promise<TabroomEventRecord[]> => {
  const response = await authorizedTabroomRequest("/user/tourns", token);

  if (response.status === 401 || response.status === 403) {
    throw new HttpsError(
      "unauthenticated",
      "Your Tabroom session has expired. Link your account again.",
    );
  }
  if (!response.ok) {
    console.error("Tabroom tournament import failed", { status: response.status });
    throw new HttpsError("unavailable", "Tabroom could not return your tournament history.");
  }

  const tournaments = asTabroomTournaments(await response.json() as unknown);
  // Enrich the tournaments a student is most likely to care about: everything
  // still upcoming, then the most recent past ones.
  const now = Date.now();
  const enrichmentOrder = [...tournaments.keys()].sort((left, right) => {
    const leftUpcoming = Date.parse(tournaments[left].end || tournaments[left].start) >= now;
    const rightUpcoming = Date.parse(tournaments[right].end || tournaments[right].start) >= now;
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    return 0;
  });
  const enrichedIndexes = new Set(enrichmentOrder.slice(0, maxEnrichedTournaments));

  const summaries = await Promise.all(
    tournaments.map((tourn, index) =>
      enrichedIndexes.has(index)
        ? fetchTabroomTournamentSummary(token, tourn.id)
        : Promise.resolve(emptyTournamentSummary),
    ),
  );

  return tournaments.map((tourn, index) => {
    const summary = summaries[index];
    return {
      id: `tabroom-tourn-${tourn.id}`,
      name: tourn.name,
      date: tourn.start || tourn.end || new Date().toISOString(),
      endDate: tourn.end || tourn.start || "",
      result: summary.roles.join(" • ") || "Entered",
      sourceUrl: tabroomTournUrl(tourn.id),
      location: tourn.location,
      role: summary.roles.join(" • "),
      judgeCategory: summary.judgeCategory,
      schoolName: summary.schoolName,
      timezone: tourn.timezone,
    };
  });
};

const tabroomProfileFields = (profile: TabroomProfileSummary) => ({
  handle: profile.handle,
  ...(profile.officialUserId ? { officialUserId: profile.officialUserId } : {}),
});

const writeTabroomImport = async (
  uid: string,
  profile: TabroomProfileSummary,
  events: TabroomEventRecord[],
  syncedAt: string,
) => {
  const db = getFirestore();
  await Promise.all([
    db.doc(`tabroomLinks/tabroom-link-${uid}`).set({
      userId: uid,
      provider: "tabroom",
      status: "linked",
      lastSyncedAt: syncedAt,
      ...tabroomProfileFields(profile),
    }, { merge: true }),
    db.doc(`tabroomImports/tabroom-import-${uid}`).set({
      userId: uid,
      status: "success",
      startedAt: syncedAt,
      lastSuccessfulAt: syncedAt,
      source: "tabroom-api",
      tournamentCount: events.length,
      events,
      errorMessage: FieldValue.delete(),
    }, { merge: true }),
  ]);
};

const markTabroomSyncFailed = async (uid: string, message: string) => {
  const db = getFirestore();
  await Promise.all([
    db.doc(`tabroomLinks/tabroom-link-${uid}`).set({ status: "error" }, { merge: true }),
    db.doc(`tabroomImports/tabroom-import-${uid}`).set(
      { userId: uid, status: "error", errorMessage: message.slice(0, 500) },
      { merge: true },
    ),
  ]);
};

export const linkTabroomSession = onCall(
  {
    cors: true,
    invoker: "public",
    timeoutSeconds: 120,
    secrets: [tabroomSessionEncryptionKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before linking Tabroom.");
    }

    const { email, password } = tabroomCredentials(request.data as LinkTabroomSessionRequest);
    const token = await loginToTabroom(email, password);
    const profile = await fetchTabroomProfile(token);
    const uid = request.auth.uid;
    const linkedAt = new Date().toISOString();
    const db = getFirestore();

    await db.doc(`tabroomSessions/${uid}`).set({
      userId: uid,
      ...encryptTabroomToken(token),
      createdAt: linkedAt,
      validatedAt: linkedAt,
    });

    try {
      const events = await importTabroomTournaments(token);
      await writeTabroomImport(uid, profile, events, linkedAt);
      await db.doc(`tabroomLinks/tabroom-link-${uid}`).set({ linkedAt }, { merge: true });
      return { profile, eventCount: events.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import Tabroom data.";
      await markTabroomSyncFailed(uid, message);
      throw error;
    }
  },
);

export const syncTabroomSession = onCall(
  {
    cors: true,
    invoker: "public",
    timeoutSeconds: 120,
    secrets: [tabroomSessionEncryptionKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before syncing Tabroom.");
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    const sessionRef = db.doc(`tabroomSessions/${uid}`);
    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      throw new HttpsError("failed-precondition", "Link your Tabroom account before syncing.");
    }

    const syncedAt = new Date().toISOString();
    await Promise.all([
      db.doc(`tabroomLinks/tabroom-link-${uid}`).set({ status: "syncing" }, { merge: true }),
      db.doc(`tabroomImports/tabroom-import-${uid}`).set(
        { userId: uid, status: "syncing", startedAt: syncedAt },
        { merge: true },
      ),
    ]);

    let token: string;
    try {
      token = decryptTabroomToken(sessionSnapshot.data() as EncryptedTabroomSession);
    } catch {
      console.error("Stored Tabroom session could not be decrypted", { uid });
      await markTabroomSyncFailed(uid, "The saved Tabroom session is invalid.");
      throw new HttpsError(
        "failed-precondition",
        "The saved Tabroom session is invalid. Link your account again.",
      );
    }

    try {
      const profile = await fetchTabroomProfile(token);
      const events = await importTabroomTournaments(token);
      await sessionRef.set({ validatedAt: syncedAt }, { merge: true });
      await writeTabroomImport(uid, profile, events, syncedAt);
      return { profile, eventCount: events.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sync Tabroom.";
      await markTabroomSyncFailed(uid, message);
      if (error instanceof HttpsError && error.code === "unauthenticated") {
        await sessionRef.delete();
      }
      throw error;
    }
  },
);

export const unlinkTabroomSession = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before unlinking Tabroom.");
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    await Promise.all([
      db.doc(`tabroomSessions/${uid}`).delete(),
      db.doc(`tabroomLinks/tabroom-link-${uid}`).set({
        userId: uid,
        status: "unlinked",
        unlinkedAt: new Date().toISOString(),
        provider: FieldValue.delete(),
        handle: FieldValue.delete(),
        officialUserId: FieldValue.delete(),
        nsdaId: FieldValue.delete(),
      }, { merge: true }),
      db.doc(`tabroomImports/tabroom-import-${uid}`).set({
        userId: uid,
        status: "queued",
        events: [],
        errorMessage: FieldValue.delete(),
      }, { merge: true }),
    ]);
    return { unlinked: true };
  },
);
