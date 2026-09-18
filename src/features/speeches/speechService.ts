import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { SpeechFormat } from "@/lib/speechFormats";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  UploadMetadata,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { firestore, functions, storage } from "@/lib/firebase";
import type { SpeechComment, SpeechRecord } from "@/types/models";

const UPLOAD_TIMEOUT_MS = 20_000;

export const retrySpeechSummary = async (speechId: string) => {
  if (!functions) throw new Error("Firebase Functions is not configured.");
  const retry = httpsCallable<{ speechId: string }, { status: string }>(
    functions,
    "retrySpeechSummary",
    { timeout: 540_000 },
  );
  return (await retry({ speechId })).data.status;
};

export const toggleSpeechSave = async (speechId: string, userId: string, isSaved: boolean) => {
  if (!firestore) throw new Error("Firebase is not configured.");
  const saveRef = doc(firestore, "speechSaves", `${speechId}-${userId}`);
  if (isSaved) {
    await deleteDoc(saveRef);
    return false;
  }
  await setDoc(saveRef, { speechId, userId, createdAt: new Date().toISOString() });
  return true;
};

interface NewSpeechInput {
  userId: string;
  title: string;
  eventName: string;
  format: SpeechFormat;
  topicCategory?: SpeechRecord["topicCategory"];
  visibility: NonNullable<SpeechRecord["visibility"]>;
  speakerName: string;
  coachNotes: string;
  tags: string[];
  organizationTags: string[];
  commentsEnabled: boolean;
  file?: File | null;
}

export type SpeechUpdateInput = Pick<
  SpeechRecord,
  | "title"
  | "eventName"
  | "format"
  | "topicCategory"
  | "visibility"
  | "speakerName"
  | "coachNotes"
  | "tags"
  | "organizationTags"
  | "commentsEnabled"
>;

export const grantPrivateSpeechAccess = async (
  speechId: string,
  creatorId: string,
  recipientIds: string[],
) => {
  const db = firestore;
  if (!db) throw new Error("Firebase is not configured.");
  await Promise.all(
    [...new Set(recipientIds.filter((id) => id && id !== creatorId))].map((recipientId) =>
      setDoc(doc(db, "speechShares", speechId, "recipients", recipientId), {
        recipientId,
        grantedBy: creatorId,
      }),
    ),
  );
};

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

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to upload the selected file to Firebase Storage.";
};

export const uploadSpeechAsset = async (
  speechInput?: NewSpeechInput | null,
  speechId?: string,
) => {
  const file: File | null | undefined = speechInput?.file;

  if (!file) {
    return null;
  }

  if (!storage) {
    throw new Error("Firebase Storage is not configured.");
  }

  // `sourceType` and `speechId` are what the summarizeUploadedSpeech Cloud
  // Function keys off to transcribe and summarize the recording. Debate turns
  // share this storage prefix but tag themselves `debate-turn` instead.
  const metadata: UploadMetadata = {
    contentType: file.type,
    customMetadata: {
      sourceType: "speech-upload",
      speechId: speechId ?? "",
      userId: speechInput?.userId || "unknown",
      title: speechInput?.title || "untitled",
      eventName: speechInput?.eventName || "unknown",
      format: speechInput?.format || "unknown",
      visibility: speechInput?.visibility || "private",
      speakerName: speechInput?.speakerName || "unknown",
      tags: JSON.stringify(speechInput?.tags || []),
      organizationTags: JSON.stringify(speechInput?.organizationTags || []),
    },
  };

  const storagePath = `speeches/${Date.now()}-${file.name}`;
  const assetRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(assetRef, file, metadata);

  try {
    await withTimeout(uploadTaskToPromise(uploadTask), UPLOAD_TIMEOUT_MS);
    const downloadUrl = await withTimeout(getDownloadURL(assetRef), 8_000);
    return { downloadUrl, storagePath };
  } catch (error) {
    uploadTask.cancel();
    throw new Error(formatStorageError(error));
  }
};

export const createSpeechRecord = async (
  input: NewSpeechInput,
): Promise<SpeechRecord> => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const speechRef = doc(collection(firestore, "speeches"));
  const speech: Omit<SpeechRecord, "id"> = {
    creatorId: input.userId,
    title: input.title,
    eventName: input.eventName,
    format: input.format,
    topicCategory: input.topicCategory ?? "Other",
    visibility: input.visibility,
    status: "Uploaded",
    speakerName: input.speakerName,
    coachNotes: input.coachNotes,
    uploadedAt: new Date().toISOString(),
    transcriptStatus: "Pending",
    tags: input.tags,
    organizationTags: input.organizationTags,
    commentsEnabled: input.commentsEnabled,
    ...(input.file ? { summaryStatus: "processing" as const } : {}),
    ...(input.file ? { mediaContentType: input.file.type } : {}),
  };

  // The document must exist *before* the file lands in Storage: finalizing the
  // upload fires summarizeUploadedSpeech immediately, and that function gives
  // up if there is no speech document to write the summary back to.
  await setDoc(speechRef, {
    ...speech,
    createdAt: serverTimestamp(),
  });

  let upload: Awaited<ReturnType<typeof uploadSpeechAsset>> = null;
  try {
    upload = await uploadSpeechAsset(input, speechRef.id);
  } catch (error) {
    // Do not strand a speech record with no recording behind it.
    await deleteDoc(speechRef).catch(() => undefined);
    throw error;
  }

  if (upload) {
    await updateDoc(speechRef, {
      mediaPath: upload.downloadUrl,
      mediaStoragePath: upload.storagePath,
      updatedAt: serverTimestamp(),
    });
  }

  return {
    id: speechRef.id,
    ...speech,
    mediaPath: upload?.downloadUrl,
    mediaStoragePath: upload?.storagePath,
  };
};

export const addSpeechComment = async (
  speechId: string,
  authorId: string,
  authorName: string,
  content: string,
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const trimmedContent = content.trim();
  if (!trimmedContent) return;

  await addDoc(collection(firestore, "speechComments"), {
    speechId,
    authorId,
    authorName,
    content: trimmedContent,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    dislikeCount: 0,
  } satisfies Omit<SpeechComment, "id">);
};

/**
 * Like/dislike a speech comment. Mirrors community post comments: the per-user
 * vote is its own document, the totals live on the comment.
 */
export const toggleSpeechCommentReaction = async (
  commentId: string,
  speechId: string,
  userId: string,
  reaction: "like" | "dislike",
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const database = firestore;
  const commentRef = doc(database, "speechComments", commentId);
  const reactionRef = doc(database, "speechCommentReactions", `${commentId}-${userId}`);

  await runTransaction(database, async (transaction) => {
    const commentSnapshot = await transaction.get(commentRef);
    if (!commentSnapshot.exists()) {
      throw new Error("That comment is no longer available.");
    }

    const reactionSnapshot = await transaction.get(reactionRef);
    const existing = (reactionSnapshot.exists() ? reactionSnapshot.data() : null) as
      | { like?: boolean; dislike?: boolean }
      | null;

    const previousLike = existing?.like ?? false;
    const previousDislike = existing?.dislike ?? false;
    const next = { like: previousLike, dislike: previousDislike };

    if (reaction === "like") {
      next.like = !previousLike;
      if (next.like) next.dislike = false;
    } else {
      next.dislike = !previousDislike;
      if (next.dislike) next.like = false;
    }

    transaction.set(
      reactionRef,
      {
        commentId,
        speechId,
        userId,
        ...next,
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

    const data = commentSnapshot.data();
    transaction.update(commentRef, {
      likeCount:
        ((data?.likeCount as number | undefined) ?? 0)
        + Number(next.like)
        - Number(previousLike),
      dislikeCount:
        ((data?.dislikeCount as number | undefined) ?? 0)
        + Number(next.dislike)
        - Number(previousDislike),
      updatedAt: new Date().toISOString(),
    });
  });
};

export const updateSpeechRecord = async (
  speechId: string,
  updates: SpeechUpdateInput,
) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await updateDoc(doc(firestore, "speeches", speechId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const deleteSpeechRecord = async (speechId: string) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await deleteDoc(doc(firestore, "speeches", speechId));
};

export const reportSpeechRecord = async (
  speechId: string,
  reporterId: string,
  reason: "Harassment" | "Inappropriate content" | "Spam" | "Copyright" | "Other",
  details = "",
) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }
  if (!reporterId) throw new Error("Sign in before reporting a speech.");
  if (details.length > 1000) throw new Error("Keep report details under 1,000 characters.");

  const reportRef = doc(firestore, "speechReports", reporterId, "reports", speechId);
  if ((await getDoc(reportRef)).exists()) return false;
  await setDoc(reportRef, {
    speechId,
    reporterId,
    reason,
    details: details.trim(),
    status: "open",
    createdAt: serverTimestamp(),
  });
  return true;
};
