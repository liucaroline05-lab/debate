import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ensureSeededCollection } from "@/features/firestore/seed";
import { firestore } from "@/lib/firebase";

interface SeededCollectionState<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
}

export const useSeededFirestoreCollection = <T extends { id: string }>(
  collectionName: string,
  seedRecords: T[],
) => {
  const [state, setState] = useState<SeededCollectionState<T>>({
    data: firestore ? [] : seedRecords,
    isLoading: Boolean(firestore),
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    if (!firestore) {
      setState({
        data: seedRecords,
        isLoading: false,
        error: null,
      });
      return () => {
        isMounted = false;
      };
    }

    void ensureSeededCollection(collectionName, seedRecords).catch((error) => {
      if (isMounted) {
        setState({
          data: seedRecords,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unable to seed collection.",
        });
      }
    });

    const unsubscribe = onSnapshot(
      collection(firestore, collectionName),
      (snapshot) => {
        if (!isMounted) {
          return;
        }

        const nextData = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as T[];

        setState({
          data: nextData.length > 0 ? nextData : seedRecords,
          isLoading: false,
          error: null,
        });
      },
      (error) => {
        if (!isMounted) {
          return;
        }

        setState({
          data: seedRecords,
          isLoading: false,
          error: error.message,
        });
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [collectionName, seedRecords]);

  return state;
};
