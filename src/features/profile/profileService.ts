import {
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

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
  const followerRef = doc(firestore, "users", followerId);
  const followingRef = doc(firestore, "users", followingId);

  await runTransaction(firestore, async (transaction) => {
    const followSnapshot = await transaction.get(followRef);
    const followerSnapshot = await transaction.get(followerRef);
    const followingSnapshot = await transaction.get(followingRef);

    const followerCount =
      (followerSnapshot.data()?.followingCount as number | undefined) ?? 0;
    const followingCount =
      (followingSnapshot.data()?.followersCount as number | undefined) ?? 0;

    if (followSnapshot.exists()) {
      transaction.delete(followRef);
      transaction.update(followerRef, {
        followingCount: Math.max(0, followerCount - 1),
      });
      transaction.update(followingRef, {
        followersCount: Math.max(0, followingCount - 1),
      });
      return;
    }

    transaction.set(followRef, {
      followerId,
      followingId,
      createdAt: new Date().toISOString(),
    });
    transaction.update(followerRef, {
      followingCount: followerCount + 1,
    });
    transaction.update(followingRef, {
      followersCount: followingCount + 1,
    });
  });
};

export const requestTabroomSync = async (
  userId: string,
  profileUrl: string,
  handle: string,
) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const timestamp = new Date().toISOString();

  await setDoc(
    doc(firestore, "tabroomLinks", `tabroom-link-${userId}`),
    {
      userId,
      profileUrl,
      handle,
      status: "syncing",
      lastSyncedAt: timestamp,
    },
    { merge: true },
  );

  await setDoc(
    doc(firestore, "tabroomImports", `tabroom-import-${userId}`),
    {
      userId,
      status: "queued",
      startedAt: timestamp,
      events: [],
    },
    { merge: true },
  );
};

export const clearTabroomLink = async (userId: string) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await deleteDoc(doc(firestore, "tabroomLinks", `tabroom-link-${userId}`));
};
