import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  writeBatch,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const seededCollections = new Set<string>();
const seedPromises = new Map<string, Promise<void>>();

export const ensureSeededCollection = async <T extends { id: string }>(
  collectionName: string,
  records: T[],
) => {
  const activeFirestore = firestore;

  if (!activeFirestore || records.length === 0 || seededCollections.has(collectionName)) {
    return;
  }

  const runningPromise = seedPromises.get(collectionName);
  if (runningPromise) {
    await runningPromise;
    return;
  }

  const promise = (async () => {
    const snapshot = await getDocs(
      query(collection(activeFirestore, collectionName), limit(1)),
    );

    if (snapshot.empty) {
      const batch = writeBatch(activeFirestore);
      records.forEach((record) => {
        batch.set(doc(activeFirestore, collectionName, record.id), record);
      });
      await batch.commit();
    }

    seededCollections.add(collectionName);
  })().finally(() => {
    seedPromises.delete(collectionName);
  });

  seedPromises.set(collectionName, promise);
  await promise;
};
