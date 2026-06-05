import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import OpenAI from "openai";

initializeApp();

const openAiApiKey = defineSecret("OPENAI_API_KEY");
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSizeBytes = 5 * 1024 * 1024;

interface UploadProfilePhotoRequest {
  contentType?: unknown;
  dataBase64?: unknown;
  fileName?: unknown;
}

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

    const moderation = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        {
          type: "image_url",
          image_url: {
            url: uploadInput.dataUrl,
          },
        },
      ],
    });

    const result = moderation.results[0];
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
  },
);

export const removeProfilePhoto = onCall(
  {
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
