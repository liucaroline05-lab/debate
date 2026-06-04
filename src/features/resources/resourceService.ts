import { FirebaseError } from "firebase/app";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { firestore, storage } from "@/lib/firebase";
import type { ResourceItem, UserRole } from "@/types/models";

const UPLOAD_TIMEOUT_MS = 20_000;

export interface NewResourceInput {
  title: string;
  category: ResourceItem["category"];
  description: string;
  curatedBy: string;
  creatorId: string;
  creatorRole: UserRole;
  level: ResourceItem["level"];
  format: NonNullable<ResourceItem["format"]>;
  mediaType: NonNullable<ResourceItem["mediaType"]>;
  tags: string[];
  body: string;
  externalUrl?: string;
  thumbnailUrl?: string;
  file?: File | null;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
      return "Storage blocked the upload. Check your Firebase Storage rules and make sure the signed-in user is allowed to write resource files.";
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
    : "Unable to upload the selected resource file to Firebase Storage.";
};

export const uploadResourceAsset = async (input: NewResourceInput) => {
  if (!input.file) {
    return null;
  }

  if (!storage) {
    throw new Error("Firebase Storage is not configured.");
  }

  const metadata: UploadMetadata = {
    contentType: input.file.type,
    customMetadata: {
      userId: input.creatorId,
      title: input.title,
      category: input.category,
      format: input.format,
      mediaType: input.mediaType,
      tags: JSON.stringify(input.tags),
    },
  };

  const assetRef = ref(storage, `resources/${input.creatorId}/${Date.now()}-${input.file.name}`);
  const uploadTask = uploadBytesResumable(assetRef, input.file, metadata);

  try {
    await withTimeout(uploadTaskToPromise(uploadTask), UPLOAD_TIMEOUT_MS);
    return await withTimeout(getDownloadURL(assetRef), 8_000);
  } catch (error) {
    uploadTask.cancel();
    throw new Error(formatStorageError(error));
  }
};

export const createResource = async (input: NewResourceInput): Promise<ResourceItem> => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const trimmedBody = input.body.trim();
  const hasLink = Boolean(input.externalUrl?.trim());
  const hasFile = Boolean(input.file);

  if (!input.title.trim() || !input.description.trim()) {
    throw new Error("Add a title and short description before uploading.");
  }

  if (!trimmedBody && !hasLink && !hasFile) {
    throw new Error("Add notes, a link, or an audio/video file before uploading.");
  }

  const mediaPath = await uploadResourceAsset(input);
  const createdAt = new Date().toISOString();
  const resource: ResourceItem = {
    id: `resource-${Date.now()}`,
    slug: slugify(input.title),
    title: input.title.trim(),
    category: input.category,
    description: input.description.trim(),
    curatedBy: input.curatedBy,
    creatorId: input.creatorId,
    creatorRole: input.creatorRole,
    saved: false,
    level: input.level,
    format: input.format,
    mediaType: input.mediaType,
    mediaPath: mediaPath ?? undefined,
    externalUrl: input.externalUrl?.trim() || undefined,
    thumbnailUrl: input.thumbnailUrl?.trim() || undefined,
    tags: input.tags,
    contentSections: trimmedBody
      ? [
          {
            title: "Resource notes",
            body: trimmedBody,
          },
        ]
      : undefined,
    createdAt,
    updatedAt: createdAt,
  };

  const docRef = await addDoc(collection(firestore, "resources"), {
    ...resource,
    createdAt,
    updatedAt: serverTimestamp(),
  });

  return {
    ...resource,
    id: docRef.id,
  };
};
