import { useMemo } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { ChannelMembership, CommunityChannel, CommunityPost, PostComment } from "@/types/models";

const EMPTY_MEMBERSHIPS: ChannelMembership[] = [];
const EMPTY_CHANNELS: CommunityChannel[] = [];
const PUBLIC_CONTENT: QueryConstraint[] = [where("channelVisibility", "==", "public")];

// Firestore rules allow 10 document lookups per query, and each private channel
// in a query needs one to confirm membership.
const CHANNELS_PER_QUERY = 10;

const useChunkConstraints = (channelIds: string[], chunk: number) =>
  useMemo<QueryConstraint[]>(() => {
    const ids = channelIds.slice(chunk * CHANNELS_PER_QUERY, (chunk + 1) * CHANNELS_PER_QUERY);
    // The rules can only verify membership if the query also says these are private.
    return ids.length ? [where("channelVisibility", "==", "private"), where("channelId", "in", ids)] : [];
  }, [channelIds.join("|"), chunk]);

/** The private channels this member has joined, which they may read from. */
const usePrivateChannelIds = (userId?: string) => {
  const membershipConstraints = useMemo<QueryConstraint[]>(
    () => (userId ? [where("userId", "==", userId)] : []),
    [userId],
  );
  const memberships = useSeededFirestoreCollection<ChannelMembership>(
    "channelMemberships",
    EMPTY_MEMBERSHIPS,
    membershipConstraints,
    Boolean(userId),
    userId ? `channel-memberships:own:${userId}` : undefined,
  );
  const channels = useSeededFirestoreCollection<CommunityChannel>("channels", EMPTY_CHANNELS);
  return useMemo(() => {
    const privateChannels = new Set(
      channels.data.filter((channel) => channel.visibility === "private").map((channel) => channel.id),
    );
    return Array.from(new Set(memberships.data.map((membership) => membership.channelId)))
      .filter((channelId) => privateChannels.has(channelId))
      .sort();
  }, [channels.data, memberships.data]);
};

/**
 * Firestore rules allow public posts and comments, plus those in private
 * channels the member has joined. Queries have to ask for exactly that.
 * Hooks can't be called a variable number of times, so this covers up to 30
 * private channels per member.
 */
const useVisibleChannelContent = <T extends { id: string }>(
  collectionName: "posts" | "postComments",
  seed: T[],
  userId?: string,
) => {
  const channelIds = usePrivateChannelIds(userId);
  const firstChunk = useChunkConstraints(channelIds, 0);
  const secondChunk = useChunkConstraints(channelIds, 1);
  const thirdChunk = useChunkConstraints(channelIds, 2);
  const publicState = useSeededFirestoreCollection<T>(
    collectionName, seed, PUBLIC_CONTENT, true, `${collectionName}:public`,
  );
  const first = useSeededFirestoreCollection<T>(
    collectionName, seed, firstChunk, firstChunk.length > 0, `${collectionName}:private:1:${channelIds.join("|")}`,
  );
  const second = useSeededFirestoreCollection<T>(
    collectionName, seed, secondChunk, secondChunk.length > 0, `${collectionName}:private:2:${channelIds.join("|")}`,
  );
  const third = useSeededFirestoreCollection<T>(
    collectionName, seed, thirdChunk, thirdChunk.length > 0, `${collectionName}:private:3:${channelIds.join("|")}`,
  );
  return useMemo(() => ({
    data: Array.from(new Map(
      [...publicState.data, ...first.data, ...second.data, ...third.data].map((entry) => [entry.id, entry]),
    ).values()),
    isLoading: publicState.isLoading,
    error: publicState.error ?? first.error ?? second.error ?? third.error,
  }), [first.data, first.error, publicState.data, publicState.error, publicState.isLoading, second.data, second.error, third.data, third.error]);
};

const EMPTY_POSTS: CommunityPost[] = [];
const EMPTY_POST_COMMENTS: PostComment[] = [];

export const useVisiblePosts = (userId?: string) =>
  useVisibleChannelContent<CommunityPost>("posts", EMPTY_POSTS, userId);

export const useVisiblePostComments = (userId?: string) =>
  useVisibleChannelContent<PostComment>("postComments", EMPTY_POST_COMMENTS, userId);
