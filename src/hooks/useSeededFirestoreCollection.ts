import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
} from "firebase/firestore";
import { ensureSeededCollection } from "@/features/firestore/seed";
import { firestore } from "@/lib/firebase";

interface SeededCollectionState<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
}

const EMPTY_QUERY_CONSTRAINTS: QueryConstraint[] = [];

export const useSeededFirestoreCollection = <T extends { id: string }>(
  collectionName: string,
  seedRecords: T[],
  constraints: QueryConstraint[] = EMPTY_QUERY_CONSTRAINTS,
  enabled = true,
) => {
  const [state, setState] = useState<SeededCollectionState<T>>({
    data: [],
    isLoading: Boolean(firestore),
    error: firestore ? null : "Firebase is not configured.",
  });

  useEffect(() => {
    let isMounted = true;

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

    void ensureSeededCollection(collectionName, seedRecords).catch((error) => {
      if (isMounted) {
        setState({
          data: [],
          isLoading: false,
          error: error instanceof Error ? error.message : "Unable to seed collection.",
        });
      }
    });

    const unsubscribe = onSnapshot(
      query(collection(firestore, collectionName), ...constraints),
      (snapshot) => {
        if (!isMounted) {
          return;
        }

        const nextData = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as T[];

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

        setState({
          data: [],
          isLoading: false,
          error: error.message,
        });
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [collectionName, constraints, enabled, seedRecords]);

  return state;
};
