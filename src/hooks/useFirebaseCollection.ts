import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

interface CollectionState<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
}

export const useFirebaseCollection = <T extends { id: string }>(
  collectionName: string,
  fallbackData: T[],
) => {
  const [state, setState] = useState<CollectionState<T>>({
    data: fallbackData,
    isLoading: Boolean(firestore),
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    if (!firestore) {
      setState({ data: fallbackData, isLoading: false, error: null });
      return () => {
        isMounted = false;
      };
    }

    const load = async () => {
      try {
        const snapshot = await getDocs(collection(firestore, collectionName));
        const nextData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[];

        if (isMounted) {
          setState({
            data: nextData.length > 0 ? nextData : fallbackData,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        if (isMounted) {
          setState({
            data: fallbackData,
            isLoading: false,
            error: error instanceof Error ? error.message : "Unable to load data.",
          });
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [collectionName, fallbackData]);

  return state;
};
