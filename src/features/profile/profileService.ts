import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "@/lib/firebase";

export const maxDisplayNameLength = 30;

export const normalizeDisplayNameInput = (displayName: string) =>
  displayName.trim().replace(/\s+/g, " ");

const validateDisplayName = (displayName: string) => {
  if (!displayName) {
    throw new Error("Add a display name before saving.");
  }

  if (displayName.length > maxDisplayNameLength) {
    throw new Error(`Display name must be ${maxDisplayNameLength} characters or fewer.`);
  }
};

const formatDisplayNameFunctionError = (error: unknown) => {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/invalid-argument") {
      return error.message;
    }

    if (error.code === "functions/failed-precondition") {
      return "That display name could not be accepted. Please choose a different name.";
    }

    if (error.code === "functions/unauthenticated") {
      return "Sign in again before changing your display name.";
    }

    if (error.code === "functions/unavailable") {
      return "Display name moderation is temporarily unavailable. Please try again later.";
    }

    if (error.code === "functions/internal") {
      return "Unable to update your display name right now. Please try again later.";
    }

    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Unable to update your display name right now.";
};

export const updateUserDisplayName = async (displayName: string) => {
  const normalizedDisplayName = normalizeDisplayNameInput(displayName);
  validateDisplayName(normalizedDisplayName);

  if (!functions) {
    throw new Error("Firebase Functions is not configured.");
  }

  const updateName = httpsCallable<
    { displayName: string },
    { displayName: string }
  >(functions, "updateDisplayName");

  try {
    const result = await updateName({ displayName: normalizedDisplayName });
    return result.data.displayName;
  } catch (error) {
    throw new Error(formatDisplayNameFunctionError(error));
  }
};

export const updateUserBio = async (userId: string, bio: string) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await updateDoc(doc(firestore, "users", userId), {
    bio,
  });
};

export const toggleFollowUser = async (
  followerId: string,
  followingId: string,
) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const followRef = doc(firestore, "follows", `${followerId}-${followingId}`);
  const followSnapshot = await getDoc(followRef);

  // Follower counters are derived from the follows collection in the UI. The
  // previous transaction also updated the target user's profile, which is
  // correctly rejected by the users/{userId} ownership rule.
  if (followSnapshot.exists()) {
    await deleteDoc(followRef);
    return false;
  }

  await setDoc(followRef, {
    followerId,
    followingId,
    createdAt: new Date().toISOString(),
  });
  return true;
};

interface TabroomProfileSummary {
  officialUserId: number | null;
  handle: string;
  nsdaId: number | null;
}

const formatTabroomFunctionError = (error: unknown) => {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error : new Error("Unable to connect to Tabroom.");
  }

  const message = error.message.replace(/^Firebase:\s*/i, "");
  if (error.code === "functions/unavailable") {
    return new Error("Tabroom is temporarily unavailable. Try again shortly.");
  }
  if (error.code === "functions/unauthenticated") {
    return new Error(message || "Your Tabroom credentials or saved session are no longer valid.");
  }
  return new Error(message || "Unable to connect to Tabroom.");
};

export const linkTabroomSession = async (email: string, password: string) => {
  if (!functions) throw new Error("Firebase Functions is not configured.");
  if (!email.trim() || !password) {
    throw new Error("Enter your Tabroom email and password.");
  }

  const link = httpsCallable<
    { email: string; password: string },
    { profile: TabroomProfileSummary }
  >(functions, "linkTabroomSession");
  try {
    return (await link({ email: email.trim(), password })).data;
  } catch (error) {
    throw formatTabroomFunctionError(error);
  }
};

export const syncTabroomSession = async () => {
  if (!functions) throw new Error("Firebase Functions is not configured.");
  const sync = httpsCallable<Record<string, never>, { profile: TabroomProfileSummary }>(
    functions,
    "syncTabroomSession",
  );
  try {
    return (await sync({})).data;
  } catch (error) {
    throw formatTabroomFunctionError(error);
  }
};

export const unlinkTabroomSession = async () => {
  if (!functions) throw new Error("Firebase Functions is not configured.");
  const unlink = httpsCallable<Record<string, never>, { unlinked: boolean }>(
    functions,
    "unlinkTabroomSession",
  );
  try {
    return (await unlink({})).data;
  } catch (error) {
    throw formatTabroomFunctionError(error);
  }
};
