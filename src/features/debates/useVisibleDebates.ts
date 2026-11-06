import { useMemo } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type { DebateComment, DebateThread } from "@/types/models";

const EMPTY_DEBATES: DebateThread[] = [];
const EMPTY_COMMENTS: DebateComment[] = [];

const PUBLIC_DEBATES: QueryConstraint[] = [where("visibility", "==", "public")];
const PUBLIC_COMMENTS: QueryConstraint[] = [where("debateVisibility", "==", "public")];

interface CollectionState<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
}

const useCombinedState = <T extends { id: string }>(first: CollectionState<T>, second: CollectionState<T>) =>
  useMemo<CollectionState<T>>(() => ({
    data: Array.from(new Map([...first.data, ...second.data].map((entry) => [entry.id, entry])).values()),
    isLoading: first.isLoading || second.isLoading,
    error: first.error ?? second.error,
  }), [first.data, first.error, first.isLoading, second.data, second.error, second.isLoading]);

const useParticipantConstraints = (userId?: string) =>
  useMemo<QueryConstraint[]>(
    () => (userId ? [where("participantIds", "array-contains", userId)] : []),
    [userId],
  );

/**
 * Firestore rules let a member read public debates and the ones they are part
 * of. A query has to ask for exactly that, or the whole query is denied.
 */
export const useVisibleDebates = (userId?: string) => {
  const participantConstraints = useParticipantConstraints(userId);
  const publicState = useSeededFirestoreCollection<DebateThread>(
    "debates", EMPTY_DEBATES, PUBLIC_DEBATES, Boolean(userId), userId ? `debates:public:${userId}` : undefined,
  );
  const participantState = useSeededFirestoreCollection<DebateThread>(
    "debates", EMPTY_DEBATES, participantConstraints, Boolean(userId), userId ? `debates:participant:${userId}` : undefined,
  );
  return useCombinedState(publicState, participantState);
};

export const useVisibleDebateComments = (userId?: string) => {
  const participantConstraints = useParticipantConstraints(userId);
  const publicState = useSeededFirestoreCollection<DebateComment>(
    "debateComments", EMPTY_COMMENTS, PUBLIC_COMMENTS, Boolean(userId), userId ? `debate-comments:public:${userId}` : undefined,
  );
  const participantState = useSeededFirestoreCollection<DebateComment>(
    "debateComments", EMPTY_COMMENTS, participantConstraints, Boolean(userId), userId ? `debate-comments:participant:${userId}` : undefined,
  );
  return useCombinedState(publicState, participantState);
};
