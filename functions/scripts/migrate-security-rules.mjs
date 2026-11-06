#!/usr/bin/env node
/**
 * One-time data migration for the November 2026 security rules. Safe to re-run.
 *
 * Dry run (default), which only reports what would change:
 *   cd functions && node scripts/migrate-security-rules.mjs
 * Apply:
 *   cd functions && node scripts/migrate-security-rules.mjs --apply
 *
 * Needs Google credentials for the project (`gcloud auth application-default
 * login`) and GOOGLE_CLOUD_PROJECT set. To try it locally first, also set
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.
 *
 * What it does:
 * - users: removes stored email addresses, which every member could read.
 * - channels: moves legacy invite codes into channelInvites.
 * - channelMemberships: removes stored invite codes and gives each membership
 *   its channelId-userId ID, which rules look up.
 * - debates: fills in a missing visibility (private if it has an invite code).
 * - posts, postComments: copies the channel's visibility on to each one.
 * - debateMessages, debateComments: copies the debate's audience on to each one.
 * - follows: deletes documents whose ID doesn't match their contents, which
 *   could be used to get past "people I follow" messaging limits.
 *
 * Documents are readable only under the new rules once they have these fields,
 * so run this BEFORE deploying firestore.rules. See SETUP.md for the full order.
 */
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
initializeApp();
const db = getFirestore();
const writer = db.bulkWriter();
const counts = {};

const record = (label) => {
  counts[label] = (counts[label] ?? 0) + 1;
};
const update = (label, ref, data) => {
  record(label);
  if (apply) void writer.update(ref, data);
};
const create = (label, ref, data) => {
  record(label);
  if (apply) void writer.set(ref, data, { merge: true });
};
const remove = (label, ref) => {
  record(label);
  if (apply) void writer.delete(ref);
};
const all = async (name) => (await db.collection(name).get()).docs;
const sameList = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

for (const user of await all("users")) {
  if ("email" in user.data()) update("users: email removed", user.ref, { email: FieldValue.delete() });
}

const channels = await all("channels");
const visibilityByChannel = new Map();
for (const channel of channels) {
  const data = channel.data();
  visibilityByChannel.set(channel.id, data.visibility === "private" ? "private" : "public");
  if (typeof data.inviteCode === "string" && data.inviteCode) {
    create("channelInvites: legacy code moved", db.doc(`channelInvites/${data.inviteCode.toUpperCase()}`), {
      channelId: channel.id,
      createdBy: data.creatorId ?? "",
      createdAt: data.createdAt ?? new Date().toISOString(),
    });
    update("channels: invite code removed", channel.ref, { inviteCode: FieldValue.delete() });
  }
}

const memberships = await all("channelMemberships");
const membershipIds = new Set(memberships.map((membership) => membership.id));
for (const membership of memberships) {
  const { inviteCode, ...data } = membership.data();
  const canonicalId = `${data.channelId}-${data.userId}`;
  if (membership.id !== canonicalId) {
    if (!membershipIds.has(canonicalId)) {
      membershipIds.add(canonicalId);
      create("channelMemberships: copied to canonical ID", db.doc(`channelMemberships/${canonicalId}`), data);
    }
    remove("channelMemberships: old ID removed", membership.ref);
  } else if (inviteCode !== undefined) {
    update("channelMemberships: invite code removed", membership.ref, { inviteCode: FieldValue.delete() });
  }
}

const debates = await all("debates");
const debateById = new Map();
for (const debate of debates) {
  const data = debate.data();
  const visibility = data.visibility === "public" || data.visibility === "private"
    ? data.visibility
    : data.inviteCode ? "private" : "public";
  debateById.set(debate.id, { visibility, participantIds: data.participantIds ?? [] });
  if (data.visibility !== visibility) update("debates: visibility filled in", debate.ref, { visibility });
}

const posts = await all("posts");
const postById = new Map();
for (const post of posts) {
  const data = post.data();
  const channelVisibility = visibilityByChannel.get(data.channelId) ?? "public";
  postById.set(post.id, { channelVisibility, channelId: data.channelId });
  if (data.channelVisibility !== channelVisibility) {
    update("posts: channel visibility copied", post.ref, { channelVisibility });
  }
}

for (const comment of await all("postComments")) {
  const data = comment.data();
  const post = postById.get(data.postId);
  // A comment left behind by a deleted post can't be placed, so it stays hidden.
  if (!post) {
    if (data.channelVisibility !== "private") {
      update("postComments: orphan hidden", comment.ref, { channelVisibility: "private" });
    }
    continue;
  }
  if (data.channelVisibility !== post.channelVisibility || (post.channelId && data.channelId !== post.channelId)) {
    update("postComments: channel visibility copied", comment.ref, {
      channelVisibility: post.channelVisibility,
      ...(post.channelId ? { channelId: post.channelId } : {}),
    });
  }
}

for (const message of await all("debateMessages")) {
  const debate = debateById.get(message.data().debateId);
  const participantIds = debate?.participantIds ?? [];
  if (!sameList(message.data().participantIds, participantIds)) {
    update("debateMessages: participants copied", message.ref, { participantIds });
  }
}

for (const comment of await all("debateComments")) {
  const data = comment.data();
  const debate = debateById.get(data.debateId);
  const debateVisibility = debate?.visibility ?? "private";
  const participantIds = debate?.participantIds ?? [];
  if (data.debateVisibility !== debateVisibility || !sameList(data.participantIds, participantIds)) {
    update("debateComments: audience copied", comment.ref, { debateVisibility, participantIds });
  }
}

for (const follow of await all("follows")) {
  const { followerId, followingId } = follow.data();
  if (follow.id !== `${followerId}-${followingId}`) remove("follows: mismatched ID deleted", follow.ref);
}

await writer.close();
console.log(apply ? "Applied:" : "Dry run. Re-run with --apply to make these changes:");
console.table(counts);
