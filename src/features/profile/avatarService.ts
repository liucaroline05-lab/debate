import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export const allowedAvatarImageTypes = ["image/jpeg", "image/png", "image/webp"];
export const maxAvatarImageSizeBytes = 5 * 1024 * 1024;

interface UploadProfilePhotoResponse {
  avatarUrl: string;
  storagePath: string;
}

const fileToBase64 = async (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the selected image."));
        return;
      }

      resolve(reader.result.split(",")[1] ?? "");
    };

    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });

const formatAvatarFunctionError = (error: unknown) => {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/invalid-argument") {
      return error.message;
    }

    if (error.code === "functions/failed-precondition") {
      return "That photo could not be accepted. Please choose a different image.";
    }

    if (error.code === "functions/unauthenticated") {
      return "Sign in again before changing your profile photo.";
    }

    if (error.code === "functions/unavailable") {
      return "Profile photo moderation is temporarily unavailable. Please try again later.";
    }

    if (error.code === "functions/internal") {
      return "Unable to update your profile photo right now. Please try again later.";
    }

    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Unable to update your profile photo right now.";
};

export const uploadProfilePhoto = async (file: File) => {
  if (!functions) {
    throw new Error("Firebase Functions is not configured.");
  }

  if (!allowedAvatarImageTypes.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  if (file.size > maxAvatarImageSizeBytes) {
    throw new Error("Choose an image smaller than 5 MB.");
  }

  const uploadPhoto = httpsCallable<
    {
      contentType: string;
      dataBase64: string;
      fileName: string;
    },
    UploadProfilePhotoResponse
  >(functions, "uploadProfilePhoto");

  try {
    const result = await uploadPhoto({
      contentType: file.type,
      dataBase64: await fileToBase64(file),
      fileName: file.name,
    });

    return result.data;
  } catch (error) {
    throw new Error(formatAvatarFunctionError(error));
  }
};

export const removeProfilePhoto = async () => {
  if (!functions) {
    throw new Error("Firebase Functions is not configured.");
  }

  const removePhoto = httpsCallable<undefined, { removed: boolean }>(
    functions,
    "removeProfilePhoto",
  );

  try {
    await removePhoto(undefined);
  } catch (error) {
    throw new Error(formatAvatarFunctionError(error));
  }
};
