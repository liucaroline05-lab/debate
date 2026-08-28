import { FirebaseError } from "firebase/app";
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
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
  resourceType: NonNullable<ResourceItem["resourceType"]>;
  category: ResourceItem["category"];
  description: string;
  longDescription: string;
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
  thumbnailFile?: File | null;
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

const isAudioOrVideo = (file: File) =>
  file.type.startsWith("audio/") || file.type.startsWith("video/");

const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

const isHeicFile = (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type.toLowerCase().startsWith("image/heic")
    || file.type.toLowerCase().startsWith("image/heif")
    || HEIC_EXTENSIONS.has(extension);
};

const decodeHeicToJpeg = async (file: File) => {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const jpegBlob = Array.isArray(converted) ? converted[0] : converted;

  if (!(jpegBlob instanceof Blob)) {
    throw new Error("This HEIC image could not be converted to JPEG.");
  }

  return jpegBlob;
};

const convertImageToJpeg = async (file: File) => {
  let sourceBlob: Blob = file;
  if (isHeicFile(file)) {
    try {
      sourceBlob = await decodeHeicToJpeg(file);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `HEIC conversion failed: ${error.message}`
          : "HEIC conversion failed. Choose another image file.",
      );
    }
  }

  return new Promise<File>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(sourceBlob);
    const image = new Image();

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        cleanup();
        reject(new Error("This image could not be prepared for upload."));
        return;
      }

      // JPEG has no transparency, so use the site's light background instead
      // of allowing transparent PNG/WebP pixels to become black.
      context.fillStyle = "#fffdf8";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      cleanup();

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("This image could not be converted to JPEG."));
            return;
          }

          const baseName = file.name.replace(/\.[^.]+$/, "") || "thumbnail";
          resolve(new File([blob], `${baseName}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          }));
        },
        "image/jpeg",
        0.9,
      );
    };

    image.onerror = () => {
      cleanup();
      reject(new Error("This image could not be loaded for upload."));
    };
    image.src = objectUrl;
  });
};

const uploadResourceFile = async (
  file: File,
  path: string,
  customMetadata: Record<string, string>,
) => {
  if (!storage) {
    throw new Error("Firebase Storage is not configured.");
  }

  const metadata: UploadMetadata = {
    contentType: file.type,
    customMetadata,
  };
  const assetRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(assetRef, file, metadata);

  try {
    await withTimeout(uploadTaskToPromise(uploadTask), UPLOAD_TIMEOUT_MS);
    return await withTimeout(getDownloadURL(assetRef), 8_000);
  } catch (error) {
    uploadTask.cancel();
    throw new Error(formatStorageError(error));
  }
};

export const uploadResourceAsset = async (input: NewResourceInput) => {
  if (!input.file) {
    return null;
  }

  if (!isAudioOrVideo(input.file)) {
    throw new Error("Choose an audio or video file for the resource.");
  }

  return uploadResourceFile(
    input.file,
    `resources/${input.creatorId}/${Date.now()}-media-${input.file.name}`,
    {
      userId: input.creatorId,
      title: input.title,
      category: input.category,
      format: input.format,
      mediaType: input.mediaType,
      tags: JSON.stringify(input.tags),
      assetType: "media",
    },
  );
};

export const uploadResourceThumbnail = async (input: NewResourceInput) => {
  if (!input.thumbnailFile) {
    return null;
  }

  const thumbnailFile = input.thumbnailFile;
  if (!thumbnailFile.type.startsWith("image/") && !isHeicFile(thumbnailFile)) {
    throw new Error("Choose an image file for the thumbnail.");
  }
  const jpegFile = await convertImageToJpeg(thumbnailFile);

  return uploadResourceFile(
    jpegFile,
    `resources/${input.creatorId}/${Date.now()}-thumbnail-${jpegFile.name}`,
    {
      userId: input.creatorId,
      title: input.title,
      category: input.category,
      format: input.format,
      mediaType: input.mediaType,
      tags: JSON.stringify(input.tags),
      assetType: "thumbnail",
    },
  );
};

export const createResource = async (input: NewResourceInput): Promise<ResourceItem> => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const trimmedBody = input.body.trim();
  const hasLink = Boolean(input.externalUrl?.trim());
  const hasFile = Boolean(input.file);
  const isQuickRead = input.resourceType === "Quick Read";

  if (!input.title.trim() || !input.description.trim()) {
    throw new Error("Add a title and short description before uploading.");
  }

  if (!isQuickRead && !trimmedBody && !hasLink && !hasFile) {
    throw new Error("Add notes, a link, or an audio/video file before uploading.");
  }

  if (isQuickRead && !input.longDescription.trim()) {
    throw new Error("Add an overview for this quick read before uploading.");
  }
  if (isQuickRead && (hasLink || hasFile || input.thumbnailFile || input.thumbnailUrl?.trim())) {
    throw new Error("Quick Reads only support a short description and overview.");
  }

  const [mediaPath, thumbnailPath] = await Promise.all([
    uploadResourceAsset(input),
    uploadResourceThumbnail(input),
  ]);
  const createdAt = new Date().toISOString();
  const resource: ResourceItem = {
    id: `resource-${Date.now()}`,
    slug: slugify(input.title),
    title: input.title.trim(),
    resourceType: input.resourceType,
    category: input.category,
    description: input.description.trim(),
    longDescription: input.longDescription.trim() || input.description.trim(),
    curatedBy: input.curatedBy,
    creatorId: input.creatorId,
    creatorRole: input.creatorRole,
    saved: false,
    level: input.level,
    format: input.format,
    mediaType: isQuickRead ? "Article" : input.mediaType,
    mediaPath: isQuickRead ? undefined : mediaPath ?? undefined,
    externalUrl: isQuickRead ? undefined : input.externalUrl?.trim() || undefined,
    thumbnailUrl: isQuickRead ? undefined : thumbnailPath ?? (input.thumbnailUrl?.trim() || undefined),
    tags: input.tags,
    contentSections: isQuickRead
      ? [{ title: "Overview", body: input.longDescription.trim() }]
      : trimmedBody
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

export const updateResource = async (
  resourceId: string,
  ownerId: string,
  input: Pick<NewResourceInput, "title" | "description" | "longDescription" | "resourceType" | "category" | "level" | "format" | "mediaType" | "tags" | "body" | "externalUrl" | "thumbnailUrl">,
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  if (!input.title.trim() || !input.description.trim()) {
    throw new Error("Add a title and short description before saving.");
  }

  const trimmedBody = input.body.trim();
  const isQuickRead = input.resourceType === "Quick Read";
  if (isQuickRead && !input.longDescription.trim()) {
    throw new Error("Add an overview for this quick read before saving.");
  }

  await updateDoc(doc(firestore, "resources", resourceId), {
    title: input.title.trim(),
    slug: slugify(input.title),
    resourceType: input.resourceType,
    description: input.description.trim(),
    longDescription: input.longDescription.trim() || input.description.trim(),
    category: input.category,
    level: input.level,
    format: input.format,
    mediaType: isQuickRead ? "Article" : input.mediaType,
    tags: input.tags,
    externalUrl: isQuickRead ? null : input.externalUrl?.trim() || null,
    thumbnailUrl: isQuickRead ? null : input.thumbnailUrl?.trim() || null,
    contentSections: isQuickRead
      ? [{ title: "Overview", body: input.longDescription.trim() }]
      : trimmedBody
        ? [{ title: "Resource notes", body: trimmedBody }]
        : [],
    creatorId: ownerId,
    updatedAt: serverTimestamp(),
  });
};

export const saveResourceNote = async (resourceId: string, userId: string, content: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  await setDoc(doc(firestore, "resourceNotes", `${resourceId}-${userId}`), {
    resourceId,
    userId,
    content: content.trim(),
    updatedAt: new Date().toISOString(),
  });
};

export const toggleResourceSave = async (resourceId: string, userId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const saveRef = doc(firestore, "resourceSaves", `${resourceId}-${userId}`);
  if ((await getDoc(saveRef)).exists()) {
    await deleteDoc(saveRef);
    return false;
  }
  await setDoc(saveRef, { resourceId, userId, createdAt: new Date().toISOString() });
  return true;
};
