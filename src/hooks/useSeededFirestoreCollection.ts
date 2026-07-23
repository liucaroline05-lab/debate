import { useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
} from "firebase/firestore";
import { mapFirestoreDocuments } from "@/features/firestore/mapDocuments";
import { ensureSeededCollection } from "@/features/firestore/seed";
import { firestore } from "@/lib/firebase";

interface SeededCollectionState<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
}

const EMPTY_QUERY_CONSTRAINTS: QueryConstraint[] = [];
const collectionQueryCache = new Map<string, Array<{ id: string }>>();

export const useSeededFirestoreCollection = <T extends { id: string }>(
  collectionName: string,
  seedRecords: T[],
  constraints: QueryConstraint[] = EMPTY_QUERY_CONSTRAINTS,
  enabled = true,
  cacheKey?: string,
) => {
  const seedRecordsRef = useRef(seedRecords);
  seedRecordsRef.current = seedRecords;
  const activeCacheKeyRef = useRef(cacheKey);
  const [state, setState] = useState<SeededCollectionState<T>>(() => {
    const cachedData = cacheKey
      ? (collectionQueryCache.get(cacheKey) as T[] | undefined) ?? []
      : [];
    return {
      data: cachedData,
      isLoading: Boolean(firestore) && cachedData.length === 0,
      error: firestore ? null : "Firebase is not configured.",
    };
  });

  useEffect(() => {
    let isMounted = true;

    if (activeCacheKeyRef.current !== cacheKey) {
      activeCacheKeyRef.current = cacheKey;
      const cachedData = cacheKey
        ? (collectionQueryCache.get(cacheKey) as T[] | undefined) ?? []
        : [];
      setState({
        data: cachedData,
        isLoading: Boolean(firestore) && cachedData.length === 0,
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

    void ensureSeededCollection(collectionName, seedRecordsRef.current).catch((error) => {
      if (isMounted) {
        setState((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unable to seed collection.",
        }));
      }
    });

    const unsubscribe = onSnapshot(
      query(collection(firestore, collectionName), ...constraints),
      (snapshot) => {
        if (!isMounted) {
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
      },
      (error) => {
        if (!isMounted) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: false,
          error: error.message,
        }));
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [cacheKey, collectionName, constraints, enabled]);

  return state;
};
