import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firestore, storage } from "@/lib/firebase";
import type {
  CommunityAttachment,
  ContentFolder,
  ContentFolderComment,
  ContentFolderCommentReaction,
  ContentFolderFile,
  ContentFolderInvite,
  ContentFolderItem,
  ContentFolderReaction,
  FolderItemType,
} from "@/types/models";

const MAX_FOLDER_FILE_SIZE = 100 * 1024 * 1024;

export const isContentFolderMember = (folder: Pick<ContentFolder, "userId" | "collaboratorIds">, userId?: string) =>
  Boolean(userId && (folder.userId === userId || folder.collaboratorIds?.includes(userId)));

// Collaborators add items and files under their own user ID, so folder-wide
// operations look children up by folder rather than by owner.
const getFolderChildren = async (folderId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  return Promise.all([
    getDocs(query(collection(firestore, "folderItems"), where("folderId", "==", folderId))),
    getDocs(query(collection(firestore, "folderFiles"), where("folderId", "==", folderId))),
  ]);
};

export interface NewFolderInput {
  userId: string;
  ownerName: string;
  name: string;
  description?: string;
  visibility: "public" | "private";
  parentFolderId?: string;
  tournamentId?: string;
  tournamentName?: string;
}

export interface NewFolderItemInput {
  userId: string;
  folderId: string;
  itemType: FolderItemType;
  itemId: string;
  sourceVisibility: "public" | "private";
  itemTitle: string;
  itemSubtitle: string;
  itemSummary: string;
  itemSlug?: string;
  visibility: "public" | "private";
}

export const createContentFolder = async (input: NewFolderInput) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const now = new Date().toISOString();
  const folderRef = doc(collection(firestore, "folders"));
  const folder: ContentFolder = {
    id: folderRef.id,
    userId: input.userId,
    ownerName: input.ownerName,
    name: input.name.trim(),
    description: input.description?.trim() || "",
    visibility: input.visibility,
    parentFolderId: input.parentFolderId || undefined,
    tournamentId: input.tournamentId || undefined,
    tournamentName: input.tournamentName || undefined,
    likeCount: 0,
    dislikeCount: 0,
    saveCount: 0,
    shareCount: 0,
    commentCount: 0,
    itemCount: 0,
    fileCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(folderRef, folder);
  return folder;
};

const getDescendantFolders = async (parentFolderId: string, userId: string): Promise<ContentFolder[]> => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const owned = await getDocs(query(collection(firestore, "folders"), where("userId", "==", userId)));
  const byParent = new Map<string, ContentFolder[]>();
  owned.docs.forEach((child) => {
    const folder = { id: child.id, ...child.data() } as ContentFolder;
    if (!folder.parentFolderId) return;
    byParent.set(folder.parentFolderId, [...(byParent.get(folder.parentFolderId) ?? []), folder]);
  });
  const descendants: ContentFolder[] = [];
  const visit = (id: string) => {
    (byParent.get(id) ?? []).forEach((child) => {
      descendants.push(child);
      visit(child.id);
    });
  };
  visit(parentFolderId);
  return descendants;
};

export const updateContentFolder = async (
  folder: ContentFolder,
  folderId: string,
  updates: Pick<ContentFolder, "name" | "visibility" | "tournamentId" | "tournamentName">,
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const descendants = await getDescendantFolders(folderId, folder.userId);
  const folderIds = [folderId, ...descendants.map((child) => child.id)];
  if (folder.visibility !== "public" && updates.visibility === "public") {
    const items = (await Promise.all(folderIds.map((id) => getDocs(query(
      collection(firestore!, "folderItems"), where("folderId", "==", id),
    ))))).flatMap((group) => group.docs);
    const privateItems = items.filter((item) => {
      const data = item.data() as Partial<ContentFolderItem>;
      return data.itemType !== "resource" && data.sourceVisibility !== "public";
    });
    if (privateItems.length) {
      throw new Error("Remove private speeches or debates before making this folder public.");
    }
  }
  await updateDoc(doc(firestore, "folders", folderId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
  if (folder.visibility === updates.visibility) return;

  const [itemsByFolder, filesByFolder] = await Promise.all([
    Promise.all(folderIds.map((id) => getDocs(query(collection(firestore!, "folderItems"), where("folderId", "==", id))))),
    Promise.all(folderIds.map((id) => getDocs(query(collection(firestore!, "folderFiles"), where("folderId", "==", id))))),
  ]);
  const now = new Date().toISOString();
  for (let offset = 0; offset < descendants.length; offset += 450) {
    const batch = writeBatch(firestore);
    descendants.slice(offset, offset + 450).forEach((child) => batch.update(
      doc(firestore!, "folders", child.id),
      { visibility: updates.visibility, updatedAt: now },
    ));
    await batch.commit();
  }
  const children = [
    ...itemsByFolder.flatMap((group) => group.docs).map((item) => {
      const data = item.data() as Partial<ContentFolderItem>;
      return {
        ref: item.ref,
        updates: {
          visibility: updates.visibility,
          sourceVisibility: data.sourceVisibility ?? (data.itemType === "resource" ? "public" : "private"),
        },
      };
    }),
    ...filesByFolder.flatMap((group) => group.docs).map((file) => ({
      ref: file.ref,
      updates: { visibility: updates.visibility },
    })),
  ];
  for (let offset = 0; offset < children.length; offset += 450) {
    const batch = writeBatch(firestore);
    children.slice(offset, offset + 450).forEach((child) => batch.update(child.ref, child.updates));
    await batch.commit();
  }
};

const makeFolderItemId = (folderId: string, itemType: FolderItemType, itemId: string) =>
  [folderId, itemType, itemId].map((part) => encodeURIComponent(part)).join("__");

export const addContentToFolder = async (input: NewFolderItemInput) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const addedAt = new Date().toISOString();
  const id = makeFolderItemId(input.folderId, input.itemType, input.itemId);
  const folderItem: ContentFolderItem = {
    ...input,
    id,
    itemTitle: input.itemTitle.trim(),
    itemSubtitle: input.itemSubtitle.trim(),
    itemSummary: input.itemSummary.trim(),
    addedAt,
  };
  const folderRef = doc(firestore, "folders", input.folderId);
  const itemRef = doc(firestore, "folderItems", id);
  await runTransaction(firestore, async (transaction) => {
    const [folderSnapshot, itemSnapshot] = await Promise.all([
      transaction.get(folderRef),
      transaction.get(itemRef),
    ]);
    const folderData = folderSnapshot.exists() ? folderSnapshot.data() as ContentFolder : null;
    if (!folderData || !isContentFolderMember(folderData, input.userId)) {
      throw new Error("You can only add items to folders you own or collaborate on.");
    }
    const effectiveVisibility = folderData.visibility === "public" ? "public" : "private";
    if (effectiveVisibility !== input.visibility) {
      throw new Error("This folder's visibility changed. Refresh and try again.");
    }
    if (effectiveVisibility === "public" && input.sourceVisibility !== "public") {
      throw new Error("Private content can only be added to a private folder.");
    }
    transaction.set(itemRef, folderItem);
    // Only the owner may backfill a legacy folder's missing visibility.
    const backfillVisibility = !folderData.visibility && folderData.userId === input.userId;
    if (!itemSnapshot.exists() || backfillVisibility) {
      transaction.update(folderRef, {
        ...(itemSnapshot.exists() ? {} : { itemCount: (folderData.itemCount ?? 0) + 1 }),
        ...(backfillVisibility ? { visibility: effectiveVisibility } : {}),
        updatedAt: addedAt,
      });
    }
  });
  return folderItem;
};

export const removeContentFromFolder = async (folderItemId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const itemRef = doc(firestore, "folderItems", folderItemId);
  await runTransaction(firestore, async (transaction) => {
    const itemSnapshot = await transaction.get(itemRef);
    if (!itemSnapshot.exists()) return;
    const item = itemSnapshot.data() as ContentFolderItem;
    const folderRef = doc(firestore!, "folders", item.folderId);
    const folderSnapshot = await transaction.get(folderRef);
    transaction.delete(itemRef);
    if (folderSnapshot.exists()) {
      const folder = folderSnapshot.data() as Partial<ContentFolder>;
      transaction.update(folderRef, {
        itemCount: Math.max(0, (folder.itemCount ?? 1) - 1),
        updatedAt: new Date().toISOString(),
      });
    }
  });
};

export interface FolderBoardOrderUpdate {
  id: string;
  kind: "item" | "file" | "folder";
  order: number;
}

export const saveContentFolderBoardOrder = async (entries: FolderBoardOrderUpdate[]) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  for (let offset = 0; offset < entries.length; offset += 450) {
    const batch = writeBatch(firestore);
    entries.slice(offset, offset + 450).forEach((entry) => {
      const collectionName = entry.kind === "item" ? "folderItems" : entry.kind === "file" ? "folderFiles" : "folders";
      batch.update(doc(firestore!, collectionName, entry.id), { boardOrder: entry.order });
    });
    await batch.commit();
  }
};

export interface FolderBoardDimensions {
  boardWidth?: number;
  boardHeight?: number;
}

export const saveContentFolderBoardDimensions = async (
  kind: FolderBoardOrderUpdate["kind"],
  id: string,
  dimensions: FolderBoardDimensions,
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const collectionName = kind === "item" ? "folderItems" : kind === "file" ? "folderFiles" : "folders";
  const updates: Record<string, number> = {};
  if (dimensions.boardWidth !== undefined) updates.boardWidth = dimensions.boardWidth;
  if (dimensions.boardHeight !== undefined) updates.boardHeight = dimensions.boardHeight;
  await updateDoc(doc(firestore, collectionName, id), updates);
};

const requirePublicFolder = (folder: ContentFolder | undefined) => {
  if (!folder || folder.visibility !== "public") {
    throw new Error("This folder is not public.");
  }
};

export const toggleContentFolderReaction = async (
  folderId: string,
  userId: string,
  reaction: "like" | "dislike",
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const folderRef = doc(firestore, "folders", folderId);
  const reactionId = `${folderId}-${userId}`;
  const reactionRef = doc(firestore, "folderReactions", reactionId);

  return runTransaction(firestore, async (transaction) => {
    const folderSnapshot = await transaction.get(folderRef);
    if (!folderSnapshot.exists()) throw new Error("This folder is no longer available.");
    const folder = { id: folderSnapshot.id, ...folderSnapshot.data() } as ContentFolder;
    requirePublicFolder(folder);
    const reactionSnapshot = await transaction.get(reactionRef);
    const previous = reactionSnapshot.exists()
      ? reactionSnapshot.data() as Partial<ContentFolderReaction>
      : {};
    const next = {
      like: Boolean(previous.like),
      dislike: Boolean(previous.dislike),
    };
    if (reaction === "like") {
      next.like = !next.like;
      if (next.like) next.dislike = false;
    } else {
      next.dislike = !next.dislike;
      if (next.dislike) next.like = false;
    }
    const now = new Date().toISOString();
    transaction.set(reactionRef, {
      id: reactionId,
      folderId,
      userId,
      ...next,
      createdAt: now,
    });
    // Only write counters that actually move. Rules require each changed
    // counter to step by exactly one, and folders created before reactions
    // existed have no counter fields, so writing an unchanged 0 was denied.
    const likeDelta = Number(next.like) - Number(previous.like ?? false);
    const dislikeDelta = Number(next.dislike) - Number(previous.dislike ?? false);
    transaction.update(folderRef, {
      ...(likeDelta ? { likeCount: Math.max(0, (folder.likeCount ?? 0) + likeDelta) } : {}),
      ...(dislikeDelta ? { dislikeCount: Math.max(0, (folder.dislikeCount ?? 0) + dislikeDelta) } : {}),
      updatedAt: now,
    });
    return next;
  });
};

export const toggleContentFolderSave = async (folderId: string, userId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const folderRef = doc(firestore, "folders", folderId);
  const saveId = `${folderId}-${userId}`;
  const saveRef = doc(firestore, "folderSaves", saveId);
  return runTransaction(firestore, async (transaction) => {
    const folderSnapshot = await transaction.get(folderRef);
    if (!folderSnapshot.exists()) throw new Error("This folder is no longer available.");
    const folder = { id: folderSnapshot.id, ...folderSnapshot.data() } as ContentFolder;
    requirePublicFolder(folder);
    const saveSnapshot = await transaction.get(saveRef);
    const saved = !saveSnapshot.exists();
    const now = new Date().toISOString();
    if (saved) {
      transaction.set(saveRef, { id: saveId, folderId, userId, createdAt: now });
    } else {
      transaction.delete(saveRef);
    }
    transaction.update(folderRef, {
      saveCount: Math.max(0, (folder.saveCount ?? 0) + (saved ? 1 : -1)),
      updatedAt: now,
    });
    return saved;
  });
};

export const incrementContentFolderShareCount = async (folderId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const folderRef = doc(firestore, "folders", folderId);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(folderRef);
    if (!snapshot.exists()) throw new Error("This folder is no longer available.");
    const folder = { id: snapshot.id, ...snapshot.data() } as ContentFolder;
    requirePublicFolder(folder);
    transaction.update(folderRef, {
      shareCount: (folder.shareCount ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });
  });
};

export const addContentFolderComment = async (
  folderId: string,
  userId: string,
  authorName: string,
  content: string,
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const trimmedContent = content.trim();
  if (!trimmedContent) throw new Error("Write a comment before posting.");
  if (trimmedContent.length > 2_000) throw new Error("Comments must be 2,000 characters or fewer.");
  const folderRef = doc(firestore, "folders", folderId);
  const commentRef = doc(collection(firestore, "folderComments"));
  const createdAt = new Date().toISOString();
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(folderRef);
    if (!snapshot.exists()) throw new Error("This folder is no longer available.");
    const folder = { id: snapshot.id, ...snapshot.data() } as ContentFolder;
    requirePublicFolder(folder);
    transaction.set(commentRef, {
      id: commentRef.id,
      folderId,
      userId,
      authorName,
      content: trimmedContent,
      visibility: "public",
      createdAt,
    } satisfies ContentFolderComment);
    transaction.update(folderRef, {
      commentCount: (folder.commentCount ?? 0) + 1,
      updatedAt: createdAt,
    });
  });
};

export const updateContentFolderComment = async (comment: ContentFolderComment, content: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const trimmedContent = content.trim();
  if (!trimmedContent) throw new Error("A comment cannot be empty.");
  if (trimmedContent.length > 2_000) throw new Error("Comments must be 2,000 characters or fewer.");
  await updateDoc(doc(firestore, "folderComments", comment.id), {
    content: trimmedContent,
    editedAt: new Date().toISOString(),
  });
};

export const deleteContentFolderComment = async (comment: ContentFolderComment) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const folderRef = doc(firestore, "folders", comment.folderId);
  const commentRef = doc(firestore, "folderComments", comment.id);
  await runTransaction(firestore, async (transaction) => {
    const [folderSnapshot, commentSnapshot] = await Promise.all([
      transaction.get(folderRef),
      transaction.get(commentRef),
    ]);
    if (!commentSnapshot.exists()) return;
    const folder = folderSnapshot.exists()
      ? { id: folderSnapshot.id, ...folderSnapshot.data() } as ContentFolder
      : null;
    transaction.delete(commentRef);
    if (folder) {
      transaction.update(folderRef, {
        commentCount: Math.max(0, (folder.commentCount ?? 0) - 1),
        updatedAt: new Date().toISOString(),
      });
    }
  });
};

export const toggleContentFolderCommentReaction = async (
  comment: ContentFolderComment,
  userId: string,
  reaction: "like" | "dislike",
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const commentRef = doc(firestore, "folderComments", comment.id);
  const reactionId = `${comment.id}-${userId}`;
  const reactionRef = doc(firestore, "folderCommentReactions", reactionId);

  return runTransaction(firestore, async (transaction) => {
    const commentSnapshot = await transaction.get(commentRef);
    if (!commentSnapshot.exists()) throw new Error("This comment was removed.");
    const current = commentSnapshot.data() as ContentFolderComment;
    const reactionSnapshot = await transaction.get(reactionRef);
    const previous = reactionSnapshot.exists()
      ? reactionSnapshot.data() as Partial<ContentFolderCommentReaction>
      : {};
    const next = {
      like: Boolean(previous.like),
      dislike: Boolean(previous.dislike),
    };
    if (reaction === "like") {
      next.like = !next.like;
      if (next.like) next.dislike = false;
    } else {
      next.dislike = !next.dislike;
      if (next.dislike) next.like = false;
    }
    transaction.set(reactionRef, {
      id: reactionId,
      commentId: comment.id,
      folderId: comment.folderId,
      userId,
      ...next,
      createdAt: new Date().toISOString(),
    } satisfies ContentFolderCommentReaction);
    // Same as folder reactions: only counters that move are written.
    const likeDelta = Number(next.like) - Number(previous.like ?? false);
    const dislikeDelta = Number(next.dislike) - Number(previous.dislike ?? false);
    if (likeDelta || dislikeDelta) {
      transaction.update(commentRef, {
        ...(likeDelta ? { likeCount: Math.max(0, (current.likeCount ?? 0) + likeDelta) } : {}),
        ...(dislikeDelta ? { dislikeCount: Math.max(0, (current.dislikeCount ?? 0) + dislikeDelta) } : {}),
      });
    }
    return next;
  });
};

const folderInviteId = (folderId: string, inviteeId: string) => `${folderId}__${inviteeId}`;

export const inviteContentFolderCollaborator = async (
  folder: ContentFolder,
  inviter: { id: string; displayName: string },
  invitee: { id: string; displayName: string },
) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  if (folder.userId !== inviter.id) throw new Error("Only the folder owner can invite collaborators.");
  if (invitee.id === folder.userId) throw new Error("You already own this folder.");
  if (folder.collaboratorIds?.includes(invitee.id)) throw new Error(`${invitee.displayName} is already a collaborator.`);
  const id = folderInviteId(folder.id, invitee.id);
  const invite: ContentFolderInvite = {
    id,
    folderId: folder.id,
    folderName: folder.name,
    inviterId: inviter.id,
    inviterName: inviter.displayName,
    inviteeId: invitee.id,
    inviteeName: invitee.displayName,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(firestore, "folderInvites", id), invite);
  return invite;
};

/** Declines an invite, or cancels it when called by the folder owner. */
export const removeContentFolderInvite = async (inviteId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  await deleteDoc(doc(firestore, "folderInvites", inviteId));
};

export const acceptContentFolderInvite = async (invite: ContentFolderInvite, userId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  if (invite.inviteeId !== userId) throw new Error("This invite is for someone else.");
  // A batch, not a transaction: invitees cannot read a private folder until
  // they have joined it. Rules confirm the invite exists before the join.
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "folders", invite.folderId), {
    collaboratorIds: arrayUnion(userId),
    updatedAt: new Date().toISOString(),
  });
  batch.delete(doc(firestore, "folderInvites", invite.id));
  await batch.commit();
};

/** Removes a collaborator; the owner can remove anyone, collaborators can leave. */
export const removeContentFolderCollaborator = async (folderId: string, collaboratorId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  await updateDoc(doc(firestore, "folders", folderId), {
    collaboratorIds: arrayRemove(collaboratorId),
    updatedAt: new Date().toISOString(),
  });
};

const getAttachmentKind = (contentType: string): CommunityAttachment["kind"] => {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf" || /word|document|presentation|sheet/.test(contentType) || contentType.startsWith("text/")) return "document";
  return "file";
};

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "attachment";

export const uploadContentFolderFiles = async (
  folder: ContentFolder,
  uploaderId: string,
  files: File[],
  currentFileCount: number,
) => {
  const database = firestore;
  const configuredStorage = storage;
  if (!database || !configuredStorage) throw new Error("Firebase Storage is not configured.");
  if (files.length === 0) return [] as ContentFolderFile[];
  const visibility = folder.visibility === "public" ? "public" : "private";
  if (!folder.visibility && folder.userId === uploaderId) {
    await updateDoc(doc(database, "folders", folder.id), { visibility, updatedAt: new Date().toISOString() });
  }
  const uploaded: ContentFolderFile[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_FOLDER_FILE_SIZE) {
      throw new Error(`${file.name} is larger than the 100 MB upload limit.`);
    }
    const id = doc(collection(database, "folderFiles")).id;
    const storagePath = `folders/${uploaderId}/${folder.id}/${id}-${Date.now()}-${index}-${safeFileName(file.name)}`;
    const assetRef = ref(configuredStorage, storagePath);
    await uploadBytes(assetRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: { userId: uploaderId, folderId: folder.id, originalName: file.name },
    });
    uploaded.push({
      id,
      folderId: folder.id,
      userId: uploaderId,
      name: file.name,
      url: await getDownloadURL(assetRef),
      storagePath,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      kind: getAttachmentKind(file.type),
      visibility,
      uploadedAt: new Date().toISOString(),
    });
  }
  const batch = writeBatch(database);
  uploaded.forEach((file) => batch.set(doc(database, "folderFiles", file.id), file));
  batch.update(doc(database, "folders", folder.id), {
    fileCount: folder.fileCount === undefined ? currentFileCount + uploaded.length : increment(uploaded.length),
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
  return uploaded;
};

export const deleteContentFolderFile = async (
  folder: ContentFolder,
  file: ContentFolderFile,
  remainingFileCount: number,
) => {
  if (!firestore || !storage) throw new Error("Firebase Storage is not configured.");
  await deleteObject(ref(storage, file.storagePath));
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, "folderFiles", file.id));
  batch.update(doc(firestore, "folders", folder.id), {
    fileCount: folder.fileCount === undefined ? remainingFileCount : increment(-1),
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
};

export const deleteContentFolder = async (folderId: string) => {
  if (!firestore) throw new Error("Firestore is not configured.");
  const rootRef = doc(firestore, "folders", folderId);
  const rootSnapshot = await getDoc(rootRef);
  if (!rootSnapshot.exists()) return;
  const rootFolder = { id: rootSnapshot.id, ...rootSnapshot.data() } as ContentFolder;
  const descendants = await getDescendantFolders(folderId, rootFolder.userId);
  const folderIds = [folderId, ...descendants.map((folder) => folder.id)];
  const [itemGroups, fileGroups, inviteGroups] = await Promise.all([
    Promise.all(folderIds.map((id) => getDocs(query(collection(firestore!, "folderItems"), where("folderId", "==", id))))),
    Promise.all(folderIds.map((id) => getDocs(query(collection(firestore!, "folderFiles"), where("folderId", "==", id))))),
    Promise.all(folderIds.map((id) => getDocs(query(collection(firestore!, "folderInvites"), where("folderId", "==", id))))),
  ]);
  const files = fileGroups.flatMap((group) => group.docs);
  if (storage) {
    await Promise.all(files.map(async (file) => {
      const data = file.data() as ContentFolderFile;
      try { await deleteObject(ref(storage!, data.storagePath)); } catch { /* Remove stale metadata even when an object is already gone. */ }
    }));
  }
  const childRefs = [
    ...itemGroups.flatMap((group) => group.docs.map((child) => child.ref)),
    ...files.map((child) => child.ref),
    ...inviteGroups.flatMap((group) => group.docs.map((child) => child.ref)),
    ...descendants.map((folder) => doc(firestore!, "folders", folder.id)),
    rootRef,
  ];
  for (let offset = 0; offset < childRefs.length; offset += 450) {
    const batch = writeBatch(firestore);
    childRefs.slice(offset, offset + 450).forEach((childRef) => batch.delete(childRef));
    await batch.commit();
  }
};
