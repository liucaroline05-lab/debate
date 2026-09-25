import { useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  type DocumentData,
  type QueryConstraint,
  type QuerySnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { mapFirestoreDocuments } from "@/features/firestore/mapDocuments";
import { auth, firestore } from "@/lib/firebase";

interface SeededCollectionState<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
}

interface AuthSnapshot {
  userId: string | null;
  ready: boolean;
}

const EMPTY_QUERY_CONSTRAINTS: QueryConstraint[] = [];
const collectionQueryCache = new Map<string, Array<{ id: string }>>();

// Firestore terminates an onSnapshot listener permanently when it is rejected;
// it never retries. The app renders its pages behind the sign-in overlay, so a
// listener attached while signed out is denied by `isSignedIn()` rules and then
// stays dead for the life of the page — which is why signing in left parts of
// the UI blank until a manual refresh. Tracking auth here lets every collection
// re-subscribe when the signed-in user changes.
let authSnapshot: AuthSnapshot = auth
  ? { userId: null, ready: false }
  : { userId: null, ready: true };
const authSubscribers = new Set<(snapshot: AuthSnapshot) => void>();

if (auth) {
  onAuthStateChanged(auth, (user) => {
    authSnapshot = { userId: user?.uid ?? null, ready: true };
    authSubscribers.forEach((notify) => notify(authSnapshot));
  });
}

const useAuthSnapshot = () => {
  const [snapshot, setSnapshot] = useState(authSnapshot);

  useEffect(() => {
    // Auth may have resolved between module load and this subscription.
    setSnapshot(authSnapshot);
    authSubscribers.add(setSnapshot);
    return () => {
      authSubscribers.delete(setSnapshot);
    };
  }, []);

  return snapshot;
};

export const useSeededFirestoreCollection = <T extends { id: string }>(
  collectionName: string,
  seedRecords: T[],
  constraints: QueryConstraint[] = EMPTY_QUERY_CONSTRAINTS,
  enabled = true,
  cacheKey?: string,
  requireServerSnapshot = false,
) => {
  const seedRecordsRef = useRef(seedRecords);
  seedRecordsRef.current = seedRecords;
  const activeCacheKeyRef = useRef(cacheKey);
  const { userId: authUserId, ready: isAuthReady } = useAuthSnapshot();
  const [state, setState] = useState<SeededCollectionState<T>>(() => {
    const cachedData = !requireServerSnapshot && cacheKey
      ? (collectionQueryCache.get(cacheKey) as T[] | undefined) ?? []
      : [];
    return {
      data: cachedData,
      isLoading: Boolean(firestore) && (requireServerSnapshot || cachedData.length === 0),
      error: firestore ? null : "Firebase is not configured.",
    };
  });

  useEffect(() => {
    let isMounted = true;

    if (activeCacheKeyRef.current !== cacheKey) {
      activeCacheKeyRef.current = cacheKey;
      const cachedData = !requireServerSnapshot && cacheKey
        ? (collectionQueryCache.get(cacheKey) as T[] | undefined) ?? []
        : [];
      setState({
        data: cachedData,
        isLoading: Boolean(firestore) && (requireServerSnapshot || cachedData.length === 0),
        error: firestore ? null : "Firebase is not configured.",
      });
    }

    if (!enabled) {
      setState({
        data: [],
        isLoading: false,
        error: null,
      });
      return () => {
        isMounted = false;
      };
    }

    if (!firestore) {
      setState({
        data: [],
        isLoading: false,
        error: "Firebase is not configured.",
      });
      return () => {
        isMounted = false;
      };
    }

    // Attaching before auth resolves would send the first request without a
    // token and burn the listener on a permission error.
    if (!isAuthReady) {
      setState((current) =>
        current.isLoading ? current : { ...current, isLoading: true },
      );
      return () => {
        isMounted = false;
      };
    }

    const handleSnapshot = (snapshot: QuerySnapshot<DocumentData>) => {
      if (!isMounted) {
        return;
      }

      // Blocking is a visibility boundary. A previously cached snapshot can
      // predate a new block, so callers may wait for server confirmation.
      if (requireServerSnapshot && snapshot.metadata.fromCache) {
        setState({ data: [], isLoading: true, error: null });
        return;
      }

      const nextData = mapFirestoreDocuments<T>(snapshot.docs);
      if (cacheKey) {
        collectionQueryCache.set(cacheKey, nextData);
      }

      setState({
        data: nextData,
        isLoading: false,
        error: null,
      });
    };
    const handleError = (error: Error) => {
      if (!isMounted) {
        return;
      }

      console.error(`"${collectionName}" listener failed:`, error.message);
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error.message,
      }));
    };
    const collectionQuery = query(collection(firestore, collectionName), ...constraints);
    const unsubscribe = requireServerSnapshot
      ? onSnapshot(collectionQuery, { includeMetadataChanges: true }, handleSnapshot, handleError)
      : onSnapshot(collectionQuery, handleSnapshot, handleError);

    return () => {
      isMounted = false;
      unsubscribe();
    };
    // `authUserId` is a dependency so that signing in or out re-attaches every
    // listener rather than leaving a rejected one in place.
  }, [authUserId, cacheKey, collectionName, constraints, enabled, isAuthReady, requireServerSnapshot]);

  return state;
};
