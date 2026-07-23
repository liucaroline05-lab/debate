interface FirestoreDocumentLike {
  id: string;
  data: () => Record<string, unknown>;
}

export const mapFirestoreDocuments = <T extends { id: string }>(
  documents: FirestoreDocumentLike[],
) =>
  documents.map((entry) => ({
    ...entry.data(),
    id: entry.id,
  })) as T[];
