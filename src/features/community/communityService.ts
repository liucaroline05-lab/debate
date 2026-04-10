import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { CommunityPost, PostComment } from "@/types/models";

interface NewPostInput {
  channelId: string;
  title: string;
  content: string;
  category: CommunityPost["category"];
  debateType?: string;
  authorId: string;
  author: string;
  authorRole?: string;
}

export const createPost = async (input: NewPostInput) => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const createdAt = new Date().toISOString();

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
  } satisfies Omit<CommunityPost, "id">);
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
