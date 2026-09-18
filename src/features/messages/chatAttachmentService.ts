import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

const maxFileBytes = 4 * 1024 * 1024;
const allowedTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg",
  "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain",
]);

export const validateChatAttachment = (file: File) => {
  if (!allowedTypes.has(file.type)) throw new Error("Choose an image, audio recording, PDF, Word document, or text file. Video is not yet supported in messages.");
  if (!file.size || file.size > maxFileBytes) throw new Error("Choose a file smaller than 4 MB.");
};

const fileAsBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};

export const sendChatAttachment = async (threadId: string, file: File, note: string) => {
  if (!functions) throw new Error("Firebase Functions is not configured.");
  validateChatAttachment(file);
  const send = httpsCallable<Record<string, string>, { sent: boolean }>(functions, "sendModeratedChatAttachment", { timeout: 130_000 });
  await send({ threadId, name: file.name, contentType: file.type, dataBase64: await fileAsBase64(file), note });
};

export const loadChatAttachment = async (threadId: string, messageId: string) => {
  if (!functions) throw new Error("Firebase Functions is not configured.");
  const load = httpsCallable<{ threadId: string; messageId: string }, { dataBase64: string; contentType: string; name: string }>(functions, "getChatAttachment");
  const { data } = await load({ threadId, messageId });
  const binary = atob(data.dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: data.contentType }));
};
