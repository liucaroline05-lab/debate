import { FirebaseError } from "firebase/app";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  UploadMetadata,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { firestore, storage } from "@/lib/firebase";
import type { SpeechRecord } from "@/types/models";

const UPLOAD_TIMEOUT_MS = 20_000;

interface NewSpeechInput {
  userId: string;
  title: string;
  eventName: string;
  format: SpeechRecord["format"];
  speakerName: string;
  coachNotes: string;
  tags: string[];
  organizationTags: string[];
  file?: File | null;
}

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

export const uploadSpeechAsset = async (speechInput?: NewSpeechInput | null) => {
  var file: File | null | undefined = speechInput?.file;
  
  if (!file) {
    return null;
  }

  if (!storage) {
    throw new Error("Firebase Storage is not configured.");
  }

  // User metadata
  const metadata: UploadMetadata = {
    contentType: file.type,
    customMetadata: {
      'userId': speechInput?.userId || 'unknown',
      'title': speechInput?.title || 'untitled',
      'eventName': speechInput?.eventName || 'unknown',
      'format': speechInput?.format || 'unknown',
      'speakerName': speechInput?.speakerName || 'unknown',
      'tags': JSON.stringify(speechInput?.tags || []),
      'organizationTags': JSON.stringify(speechInput?.organizationTags || []),
    },
  };

  const assetRef = ref(storage, `speeches/${Date.now()}-${file.name}`);
  const uploadTask = uploadBytesResumable(assetRef, file, metadata);

  try {
    await withTimeout(uploadTaskToPromise(uploadTask), UPLOAD_TIMEOUT_MS);
    return await withTimeout(getDownloadURL(assetRef), 8_000);
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

  const mediaPath = await uploadSpeechAsset(input);

  const speech: SpeechRecord = {
    id: `speech-${Date.now()}`,
    title: input.title,
    eventName: input.eventName,
    format: input.format,
    status: "Uploaded",
    speakerName: input.speakerName,
    coachNotes: input.coachNotes,
    uploadedAt: new Date().toISOString(),
    transcriptStatus: "Pending",
    tags: input.tags,
    organizationTags: input.organizationTags,
    mediaPath: mediaPath ?? undefined,
  };

  const docRef = await addDoc(collection(firestore, "speeches"), {
    ...speech,
    createdAt: serverTimestamp(),
  });
  speech.id = docRef.id;

  return speech;
};
