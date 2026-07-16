import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firestore, storage } from "@/lib/firebase";
import type {
  CommunityAttachment,
  CommunityChannel,
  CommunityPost,
  PostComment,
} from "@/types/models";

interface NewPostInput {
  channelId: string;
  title: string;
  content: string;
  category: CommunityPost["category"];
  debateType?: string;
  authorId: string;
  author: string;
  authorRole?: string;
  files?: File[];
}

const maxPostFileSize = 100 * 1024 * 1024;

const getAttachmentKind = (contentType: string): CommunityAttachment["kind"] => {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (
    contentType === "application/pdf" ||
    contentType.includes("word") ||
    contentType.includes("document") ||
    contentType.includes("presentation") ||
    contentType.includes("sheet") ||
    contentType.startsWith("text/")
  ) {
    return "document";
  }
  return "file";
};

const safeFileName = (fileName: string) =>
  fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "attachment";

const uploadPostAttachments = async (
  authorId: string,
  files: File[],
): Promise<CommunityAttachment[]> => {
  if (files.length === 0) return [];
  if (!storage) throw new Error("Firebase Storage is not configured.");
  const configuredStorage = storage;

  return Promise.all(
    files.map(async (file, index) => {
      if (file.size > maxPostFileSize) {
        throw new Error(`${file.name} is larger than the 100 MB upload limit.`);
      }

      const storagePath = `posts/${authorId}/${Date.now()}-${index}-${safeFileName(file.name)}`;
      const assetRef = ref(configuredStorage, storagePath);
      await uploadBytes(assetRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { authorId, originalName: file.name },
      });

      return {
        name: file.name,
        url: await getDownloadURL(assetRef),
        storagePath,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        kind: getAttachmentKind(file.type),
      };
    }),
  );
};

export const createPost = async (input: NewPostInput) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const createdAt = new Date().toISOString();
  const attachments = await uploadPostAttachments(input.authorId, input.files ?? []);

  await addDoc(collection(firestore, "posts"), {
    channelId: input.channelId,
    authorId: input.authorId,
    author: input.author,
    authorRole: input.authorRole,
    category: input.category,
    debateType: input.debateType,
    title: input.title,
    content: input.content,
    createdAt,
    updatedAt: createdAt,
    replyCount: 0,
    reported: false,
    likeCount: 0,
    dislikeCount: 0,
    favoriteCount: 0,
    shareCount: 0,
    attachments,
  } satisfies Omit<CommunityPost, "id">);
};

interface NewPracticeGroupInput {
  name: string;
  description: string;
  visibility: "public" | "private";
  creatorId: string;
}

const generateInviteCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(8);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
};

export const createPracticeGroup = async (input: NewPracticeGroupInput) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  if (!input.name.trim()) throw new Error("Add a group name before creating it.");

  const inviteCode = input.visibility === "private" ? generateInviteCode() : undefined;
  const createdAt = new Date().toISOString();
  const channel: Omit<CommunityChannel, "id"> = {
    name: input.name.trim(),
    summary: input.description.trim(),
    followers: 1,
    memberCount: 1,
    topicTags: ["Practice"],
    shortCode: input.name.trim().slice(0, 2).toUpperCase(),
    category: "Practice Group",
    activityLabel: "Created just now",
    accent: "sage",
    visibility: input.visibility,
    creatorId: input.creatorId,
    inviteCode,
    createdAt,
  };

  const channelRef = await addDoc(collection(firestore, "channels"), channel);
  await setDoc(doc(firestore, "channelMemberships", `${channelRef.id}-${input.creatorId}`), {
    channelId: channelRef.id,
    userId: input.creatorId,
    role: "Moderator",
    lastActiveAt: createdAt,
  });

  return { id: channelRef.id, inviteCode };
};

export const joinPracticeGroupByCode = async (inviteCode: string, userId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const normalizedCode = inviteCode.trim().toUpperCase();
  if (!normalizedCode) throw new Error("Enter an invite code first.");

  const snapshot = await getDocs(
    query(collection(firestore, "channels"), where("inviteCode", "==", normalizedCode)),
  );
  const channel = snapshot.docs[0];
  if (!channel) throw new Error("No practice group uses that invite code.");

  const membershipRef = doc(firestore, "channelMemberships", `${channel.id}-${userId}`);
  if ((await getDoc(membershipRef)).exists()) return channel.data().name as string;

  await setDoc(membershipRef, {
    channelId: channel.id,
    userId,
    role: "Member",
    lastActiveAt: new Date().toISOString(),
  });
  await updateDoc(channel.ref, {
    memberCount: ((channel.data().memberCount as number | undefined) ?? 0) + 1,
    followers: ((channel.data().followers as number | undefined) ?? 0) + 1,
    activityLabel: "New member joined",
  });
  return channel.data().name as string;
};

export const updatePostContent = async (
  postId: string,
  updates: Pick<CommunityPost, "title" | "content" | "category" | "debateType">,
) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await updateDoc(doc(firestore, "posts", postId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
};

export const deletePostById = async (postId: string) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await deleteDoc(doc(firestore, "posts", postId));
};

export const reportPostById = async (postId: string) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await updateDoc(doc(firestore, "posts", postId), {
    reported: true,
    updatedAt: new Date().toISOString(),
  });
};

export const incrementPostShareCount = async (postId: string, currentShareCount = 0) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  await updateDoc(doc(firestore, "posts", postId), {
    shareCount: currentShareCount + 1,
    updatedAt: new Date().toISOString(),
  });
};

export const addCommentToPost = async (
  postId: string,
  authorId: string,
  authorName: string,
  content: string,
) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const createdAt = new Date().toISOString();

  await addDoc(collection(firestore, "postComments"), {
    postId,
    authorId,
    authorName,
    content,
    createdAt,
  } satisfies Omit<PostComment, "id">);

  const postRef = doc(firestore, "posts", postId);
  const postSnapshot = await getDoc(postRef);
  const currentReplyCount = (postSnapshot.data()?.replyCount as number | undefined) ?? 0;

  await updateDoc(postRef, {
    replyCount: currentReplyCount + 1,
    updatedAt: createdAt,
  });
};

export const togglePostReaction = async (
  postId: string,
  userId: string,
  reaction: "like" | "dislike" | "favorite",
) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const postRef = doc(firestore, "posts", postId);
  const reactionRef = doc(firestore, "postReactions", `${postId}-${userId}`);

  await runTransaction(firestore, async (transaction) => {
    const postSnapshot = await transaction.get(postRef);
    const reactionSnapshot = await transaction.get(reactionRef);

    const postData = postSnapshot.data();
    const existingReaction =
      (reactionSnapshot.exists() ? reactionSnapshot.data() : null) as
        | { like?: boolean; dislike?: boolean; favorite?: boolean }
        | null;

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
        postId,
        userId,
        ...nextReaction,
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

    const currentLikeCount = (postData?.likeCount as number | undefined) ?? 0;
    const currentDislikeCount = (postData?.dislikeCount as number | undefined) ?? 0;
    const currentFavoriteCount = (postData?.favoriteCount as number | undefined) ?? 0;

    const previousLike = existingReaction?.like ?? false;
    const previousDislike = existingReaction?.dislike ?? false;
    const previousFavorite = existingReaction?.favorite ?? false;

    transaction.update(postRef, {
      likeCount:
        currentLikeCount + Number(nextReaction.like) - Number(previousLike),
      dislikeCount:
        currentDislikeCount +
        Number(nextReaction.dislike) -
        Number(previousDislike),
      favoriteCount:
        currentFavoriteCount +
        Number(nextReaction.favorite) -
        Number(previousFavorite),
      updatedAt: new Date().toISOString(),
    });
  });
};
