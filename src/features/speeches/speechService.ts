import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firestore, storage } from "@/lib/firebase";
import type { SpeechRecord } from "@/types/models";

interface NewSpeechInput {
  title: string;
  eventName: string;
  format: SpeechRecord["format"];
  speakerName: string;
  coachNotes: string;
  tags: string[];
  organizationTags: string[];
  file?: File | null;
}

export const uploadSpeechAsset = async (file?: File | null) => {
  if (!file || !storage) {
    return null;
  }

  const assetRef = ref(storage, `speeches/${Date.now()}-${file.name}`);
  await uploadBytes(assetRef, file);
  return getDownloadURL(assetRef);
};

export const createSpeechRecord = async (
  input: NewSpeechInput,
): Promise<SpeechRecord> => {
  const mediaPath = await uploadSpeechAsset(input.file);

  const speech: SpeechRecord = {
    id: `speech-${Date.now()}`,
    title: input.title,
    eventName: input.eventName,
    format: input.format,
    status: "Uploaded",
    speakerName: input.speakerName,
    coachNotes: input.coachNotes,
    uploadedAt: new Date().toISOString(),
    transcriptStatus: "Pending",
    tags: input.tags,
    organizationTags: input.organizationTags,
    mediaPath: mediaPath ?? undefined,
  };

  if (firestore) {
    const docRef = await addDoc(collection(firestore, "speeches"), {
      ...speech,
      createdAt: serverTimestamp(),
    });
    speech.id = docRef.id;
  }

  return speech;
};
