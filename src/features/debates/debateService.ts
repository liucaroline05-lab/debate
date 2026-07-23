import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { firestore, storage } from "@/lib/firebase";
import { getDebateTurnProgress } from "@/features/debates/debateProgress";
import type {
  DebateMatchRequest,
  DebateParticipant,
  DebateThread,
  DebateTurn,
} from "@/types/models";

const UPLOAD_TIMEOUT_MS = 20_000;
const MAX_DEBATE_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;
const TRANSCRIBABLE_DEBATE_EXTENSIONS = new Set([
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "wav",
  "webm",
]);

// ---------------------------------------------------------------------------
// Storage upload — mirrors the pattern in speechService/resourceService.
// Debate turn media is stored under the shared `speeches/` prefix.
// ---------------------------------------------------------------------------

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(
        new Error(
          "The upload took too long to respond. This usually means Firebase Storage is blocked by local CORS or network configuration.",
        ),
      );
    }, timeoutMs);

    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });

const uploadTaskToPromise = (task: ReturnType<typeof uploadBytesResumable>) =>
  new Promise<UploadTaskSnapshot>((resolve, reject) => {
    task.on(
      "state_changed",
      undefined,
      (error) => reject(error),
      () => resolve(task.snapshot),
    );
  });

const formatStorageError = (error: unknown) => {
  if (error instanceof FirebaseError) {
    if (
      error.code === "storage/unauthorized" ||
      error.code === "storage/unauthenticated"
    ) {
      return "Storage blocked the upload. Check your Firebase Storage rules and make sure the signed-in user is allowed to write to the bucket.";
    }

    if (
      error.code === "storage/retry-limit-exceeded" ||
      error.code === "storage/unknown"
    ) {
      return "Storage upload failed before it could complete. On localhost this is commonly caused by missing Cloud Storage CORS settings for your dev origin.";
    }

    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Unable to upload the speech to Firebase Storage.";
};

export const uploadDebateSpeech = async (
  debateId: string,
  turnId: string,
  file: File,
  meta: { userId: string; side: string },
) => {
  if (!storage) {
    throw new Error("Firebase Storage is not configured.");
  }

  if (file.size > MAX_DEBATE_TRANSCRIPTION_BYTES) {
    throw new Error("Debate recordings must be no larger than 25 MB.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!TRANSCRIBABLE_DEBATE_EXTENSIONS.has(extension)) {
    throw new Error(
      "Use an MP3, MP4, MPEG, MPGA, M4A, WAV, or WebM recording so it can be transcribed.",
    );
  }

  const metadata: UploadMetadata = {
    contentType: file.type,
    customMetadata: {
      sourceType: "debate-turn",
      debateId,
      turnId,
      userId: meta.userId,
      side: meta.side,
    },
  };

  const assetRef = ref(storage, `speeches/${Date.now()}-${file.name}`);
  const uploadTask = uploadBytesResumable(assetRef, file, metadata);

  try {
    await withTimeout(uploadTaskToPromise(uploadTask), UPLOAD_TIMEOUT_MS);
    return {
      speechUrl: await withTimeout(getDownloadURL(assetRef), 8_000),
      speechStoragePath: assetRef.fullPath,
    };
  } catch (error) {
    uploadTask.cancel();
    throw new Error(formatStorageError(error));
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const requireFirestore = () => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }
  return firestore;
};

const nowIso = () => new Date().toISOString();

const generateInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const computeDeadline = (responseWindowHours = 48) =>
  new Date(Date.now() + responseWindowHours * 60 * 60 * 1000).toISOString();

const sideLabelText = (side: "Aff" | "Neg" | "Either") => {
  if (side === "Aff") return "Affirmative";
  if (side === "Neg") return "Negative";
  return "Either side";
};

/** The creator keeps their preferred side; "Either" defaults them to Aff. */
const creatorSideFor = (preferredSide: "Aff" | "Neg" | "Either") =>
  preferredSide === "Neg" ? "Neg" : "Aff";

const otherParticipantId = (debate: DebateThread, userId: string) =>
  (debate.participantIds ?? []).find((id) => id !== userId) ?? null;

const sideForUser = (debate: DebateThread, userId: string): "Aff" | "Neg" =>
  debate.negative.userId === userId ? "Neg" : "Aff";

// ---------------------------------------------------------------------------
// Creating debates
// ---------------------------------------------------------------------------

interface NewDebateInput {
  topic: string;
  format: DebateMatchRequest["format"];
  creatorId: string;
  creatorName: string;
  preferredSide: "Aff" | "Neg" | "Either";
  rounds: number;
  responseWindowHours: number;
  speechTimeLimit: string;
  commentsEnabled: boolean;
  skillLevel?: DebateMatchRequest["skillLevel"];
  requesterGoal?: string;
}

/** Public challenge — starts life as an open `matchRequests` entry. */
export const createOpenChallenge = async (input: NewDebateInput) => {
  const db = requireFirestore();
  const createdAt = nowIso();

  await addDoc(collection(db, "matchRequests"), {
    topic: input.topic.trim(),
    format: input.format,
    skillLevel: input.skillLevel ?? "Intermediate",
    requestedBy: input.creatorName,
    creatorId: input.creatorId,
    preferredSide: input.preferredSide,
    status: "Open",
    createdAt,
    rounds: input.rounds,
    responseWindowHours: input.responseWindowHours,
    requesterSideLabel: sideLabelText(input.preferredSide),
    requesterGoal:
      input.requesterGoal ??
      (input.preferredSide === "Either"
        ? "Looking for a practice partner"
        : `Looking for a ${creatorSideFor(input.preferredSide) === "Aff" ? "Negative" : "Affirmative"} opponent`),
    visibility: "public",
    commentsEnabled: input.commentsEnabled,
    speechTimeLimit: input.speechTimeLimit,
  } satisfies Omit<DebateMatchRequest, "id">);
};

const buildParticipants = (
  creatorSide: "Aff" | "Neg",
  creator: { id: string; name: string },
  opponent?: { id: string; name: string },
): { affirmative: DebateParticipant; negative: DebateParticipant } => {
  const creatorParticipant: DebateParticipant = {
    name: creator.name,
    side: creatorSide,
    label: creatorSide === "Aff" ? "Affirmative" : "Negative",
    userId: creator.id,
  };

  const opponentSide = creatorSide === "Aff" ? "Neg" : "Aff";
  const opponentParticipant: DebateParticipant = opponent
    ? {
        name: opponent.name,
        side: opponentSide,
        label: opponentSide === "Aff" ? "Affirmative" : "Negative",
        userId: opponent.id,
      }
    : {
        name: "Awaiting opponent",
        side: opponentSide,
        label: opponentSide === "Aff" ? "Affirmative" : "Negative",
      };

  return creatorSide === "Aff"
    ? { affirmative: creatorParticipant, negative: opponentParticipant }
    : { affirmative: opponentParticipant, negative: creatorParticipant };
};

/** Private debate — invite-only, only the creator until someone joins by code. */
export const createPrivateDebate = async (input: NewDebateInput) => {
  const db = requireFirestore();
  const createdAt = nowIso();
  const inviteCode = generateInviteCode();
  const creatorSide = creatorSideFor(input.preferredSide);
  const { affirmative, negative } = buildParticipants(creatorSide, {
    id: input.creatorId,
    name: input.creatorName,
  });

  const debate: Omit<DebateThread, "id"> = {
    topic: input.topic.trim(),
    format: input.format,
    status: "Awaiting Opponent",
    visibility: "private",
    inviteCode,
    creatorId: input.creatorId,
    currentTurnUserId: null,
    commentsEnabled: input.commentsEnabled,
    commentCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    favoriteCount: 0,
    shareCount: 0,
    speechTimeLimit: input.speechTimeLimit,
    nextDeadline: computeDeadline(input.responseWindowHours),
    affirmative,
    negative,
    currentRound: 1,
    totalRounds: input.rounds,
    spectators: 0,
    participantIds: [input.creatorId],
    turns: [],
  };

  const docRef = await addDoc(collection(db, "debates"), { ...debate, createdAt });
  return { id: docRef.id, inviteCode };
};

// ---------------------------------------------------------------------------
// Joining / accepting
// ---------------------------------------------------------------------------

/** Accept an open challenge: create the live debate and close the request. */
export const acceptOpenChallenge = async (
  match: DebateMatchRequest,
  accepter: { id: string; name: string },
) => {
  const db = requireFirestore();
  const createdAt = nowIso();
  const creatorSide = creatorSideFor(match.preferredSide);
  const creatorId = match.creatorId ?? match.requestedBy;
  const { affirmative, negative } = buildParticipants(
    creatorSide,
    { id: creatorId, name: match.requestedBy },
    { id: accepter.id, name: accepter.name },
  );

  const debate: Omit<DebateThread, "id"> = {
    topic: match.topic,
    format: match.format,
    status: "Active",
    visibility: "public",
    creatorId,
    // Affirmative always speaks first.
    currentTurnUserId: affirmative.userId ?? creatorId,
    commentsEnabled: match.commentsEnabled ?? true,
    commentCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    favoriteCount: 0,
    shareCount: 0,
    speechTimeLimit: match.speechTimeLimit,
    nextDeadline: computeDeadline(match.responseWindowHours),
    affirmative,
    negative,
    currentRound: 1,
    totalRounds: match.rounds ?? 4,
    spectators: 0,
    participantIds: [creatorId, accepter.id],
    turns: [],
  };

  const docRef = await addDoc(collection(db, "debates"), { ...debate, createdAt });
  await updateDoc(doc(db, "matchRequests", match.id), {
    status: "Matched",
    updatedAt: createdAt,
  });

  return docRef.id;
};

/** Join a private debate using its invite code. */
export const joinDebateByInviteCode = async (
  code: string,
  joiner: { id: string; name: string },
  debates: DebateThread[],
) => {
  const db = requireFirestore();
  const normalized = code.trim().toUpperCase();

  const debate = debates.find(
    (entry) => entry.inviteCode?.toUpperCase() === normalized,
  );

  if (!debate) {
    throw new Error("No debate found for that invite code.");
  }

  if ((debate.participantIds ?? []).includes(joiner.id)) {
    throw new Error("You are already a participant in this debate.");
  }

  if (debate.status !== "Awaiting Opponent") {
    throw new Error("This debate has already started.");
  }

  const openSide: "Aff" | "Neg" = debate.affirmative.userId ? "Neg" : "Aff";
  const affirmative =
    openSide === "Aff"
      ? { ...debate.affirmative, name: joiner.name, userId: joiner.id }
      : debate.affirmative;
  const negative =
    openSide === "Neg"
      ? { ...debate.negative, name: joiner.name, userId: joiner.id }
      : debate.negative;

  await updateDoc(doc(db, "debates", debate.id), {
    affirmative,
    negative,
    participantIds: [...(debate.participantIds ?? []), joiner.id],
    status: "Active",
    // Affirmative speaks first.
    currentTurnUserId: affirmative.userId ?? null,
    updatedAt: nowIso(),
  });

  return debate.id;
};

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

/** Upload the current user's speech for their turn and hand off to the opponent. */
export const submitDebateTurn = async (
  debate: DebateThread,
  user: { id: string; name: string },
  file: File,
  summary?: string,
) => {
  const db = requireFirestore();
  const side = sideForUser(debate, user.id);
  const turnId = `turn-${Date.now()}`;
  const { speechUrl, speechStoragePath } = await uploadDebateSpeech(debate.id, turnId, file, {
    userId: user.id,
    side,
  });

  const submittedAt = nowIso();
  const newTurn: DebateTurn = {
    id: turnId,
    author: user.name,
    authorId: user.id,
    side,
    submittedAt,
    summary:
      summary?.trim() ||
      `${side === "Aff" ? "Affirmative" : "Negative"} speech submitted.`,
    status: "submitted",
    speechUrl,
    speechStoragePath,
  };

  const turns = [...(debate.turns ?? []), newTurn];
  const { isCompleted, currentRound } = getDebateTurnProgress(
    turns.length,
    debate.totalRounds,
  );

  await updateDoc(doc(db, "debates", debate.id), {
    turns,
    currentRound,
    currentTurnUserId: isCompleted ? null : otherParticipantId(debate, user.id),
    status: isCompleted ? "Completed" : "Active",
    updatedAt: submittedAt,
  });

  return { speechUrl, completed: isCompleted };
};

/** Repairs debates completed under the older turn-count logic. */
export const finalizeDebateIfComplete = async (debate: DebateThread) => {
  if (debate.status === "Completed") {
    return false;
  }

  const { isCompleted, currentRound } = getDebateTurnProgress(
    debate.turns?.length ?? 0,
    debate.totalRounds,
  );
  if (!isCompleted) {
    return false;
  }

  const db = requireFirestore();
  await updateDoc(doc(db, "debates", debate.id), {
    status: "Completed",
    currentRound,
    currentTurnUserId: null,
    updatedAt: nowIso(),
  });
  return true;
};

// ---------------------------------------------------------------------------
// Participant chat
// ---------------------------------------------------------------------------

export const addDebateMessage = async (
  debateId: string,
  authorId: string,
  authorName: string,
  content: string,
) => {
  const db = requireFirestore();

  await addDoc(collection(db, "debateMessages"), {
    debateId,
    authorId,
    authorName,
    content: content.trim(),
    createdAt: nowIso(),
  });
};

export const markDebateChatRead = async (debateId: string, userId: string) => {
  const db = requireFirestore();
  await setDoc(doc(db, "debateChatReads", `${debateId}-${userId}`), {
    debateId,
    userId,
    lastReadAt: nowIso(),
  }, { merge: true });
};

// ---------------------------------------------------------------------------
// Spectator / public comments
// ---------------------------------------------------------------------------

export const addDebateComment = async (
  debateId: string,
  authorId: string,
  authorName: string,
  content: string,
) => {
  const db = requireFirestore();
  const createdAt = nowIso();

  await addDoc(collection(db, "debateComments"), {
    debateId,
    authorId,
    authorName,
    content: content.trim(),
    createdAt,
  });

  const debateRef = doc(db, "debates", debateId);
  const snapshot = await getDoc(debateRef);
  const currentCount = (snapshot.data()?.commentCount as number | undefined) ?? 0;

  await updateDoc(debateRef, {
    commentCount: currentCount + 1,
    updatedAt: createdAt,
  });
};

// ---------------------------------------------------------------------------
// Reactions / share — mirrors togglePostReaction in communityService.
// ---------------------------------------------------------------------------

export const toggleDebateReaction = async (
  debateId: string,
  userId: string,
  reaction: "like" | "dislike" | "favorite",
) => {
  const db = requireFirestore();
  const debateRef = doc(db, "debates", debateId);
  const reactionRef = doc(db, "debateReactions", `${debateId}-${userId}`);

  await runTransaction(db, async (transaction) => {
    const debateSnapshot = await transaction.get(debateRef);
    const reactionSnapshot = await transaction.get(reactionRef);

    const debateData = debateSnapshot.data();
    const existingReaction = (
      reactionSnapshot.exists() ? reactionSnapshot.data() : null
    ) as { like?: boolean; dislike?: boolean; favorite?: boolean } | null;

    const nextReaction = {
      like: existingReaction?.like ?? false,
      dislike: existingReaction?.dislike ?? false,
      favorite: existingReaction?.favorite ?? false,
    };

    if (reaction === "like") {
      nextReaction.like = !nextReaction.like;
      if (nextReaction.like) {
        nextReaction.dislike = false;
      }
    }

    if (reaction === "dislike") {
      nextReaction.dislike = !nextReaction.dislike;
      if (nextReaction.dislike) {
        nextReaction.like = false;
      }
    }

    if (reaction === "favorite") {
      nextReaction.favorite = !nextReaction.favorite;
    }

    transaction.set(
      reactionRef,
      {
        debateId,
        userId,
        ...nextReaction,
        createdAt: nowIso(),
      },
      { merge: true },
    );

    const currentLikeCount = (debateData?.likeCount as number | undefined) ?? 0;
    const currentDislikeCount =
      (debateData?.dislikeCount as number | undefined) ?? 0;
    const currentFavoriteCount =
      (debateData?.favoriteCount as number | undefined) ?? 0;

    const previousLike = existingReaction?.like ?? false;
    const previousDislike = existingReaction?.dislike ?? false;
    const previousFavorite = existingReaction?.favorite ?? false;

    transaction.update(debateRef, {
      likeCount: currentLikeCount + Number(nextReaction.like) - Number(previousLike),
      dislikeCount:
        currentDislikeCount + Number(nextReaction.dislike) - Number(previousDislike),
      favoriteCount:
        currentFavoriteCount +
        Number(nextReaction.favorite) -
        Number(previousFavorite),
      updatedAt: nowIso(),
    });
  });
};

export const incrementDebateShareCount = async (
  debateId: string,
  currentShareCount = 0,
) => {
  const db = requireFirestore();

  await updateDoc(doc(db, "debates", debateId), {
    shareCount: currentShareCount + 1,
    updatedAt: nowIso(),
  });
};

export const voteForDebateWinner = async (
  debateId: string,
  userId: string,
  side: "Aff" | "Neg",
) => {
  const db = requireFirestore();
  const debateRef = doc(db, "debates", debateId);
  const voteRef = doc(db, "debateWinnerVotes", `${debateId}-${userId}`);

  await runTransaction(db, async (transaction) => {
    const debateSnapshot = await transaction.get(debateRef);
    const voteSnapshot = await transaction.get(voteRef);

    if (!debateSnapshot.exists()) {
      throw new Error("This debate is no longer available.");
    }

    const debate = debateSnapshot.data() as Partial<DebateThread>;
    if (
      debate.status !== "Completed"
      || debate.visibility !== "public"
      || (debate.participantIds ?? []).includes(userId)
    ) {
      throw new Error("Only spectators can vote on completed public debates.");
    }

    const previousSide = voteSnapshot.exists()
      ? (voteSnapshot.data().side as "Aff" | "Neg" | undefined)
      : undefined;
    if (previousSide === side) {
      return;
    }

    const currentCounts = debate.communityVoteCounts ?? { aff: 0, neg: 0 };
    const nextCounts = {
      aff: Math.max(
        0,
        currentCounts.aff + Number(side === "Aff") - Number(previousSide === "Aff"),
      ),
      neg: Math.max(
        0,
        currentCounts.neg + Number(side === "Neg") - Number(previousSide === "Neg"),
      ),
    };
    const updatedAt = nowIso();

    transaction.set(
      voteRef,
      {
        debateId,
        userId,
        side,
        createdAt: voteSnapshot.exists()
          ? voteSnapshot.data().createdAt ?? updatedAt
          : updatedAt,
        updatedAt,
      },
      { merge: true },
    );
    transaction.update(debateRef, {
      communityVoteCounts: nextCounts,
      updatedAt,
    });
  });
};
