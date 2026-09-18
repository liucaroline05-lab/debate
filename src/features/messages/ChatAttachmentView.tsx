import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { loadChatAttachment } from "./chatAttachmentService";
import type { ChatMessage } from "@/types/models";

export const ChatAttachmentView = ({ message }: { message: ChatMessage }) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const attachment = message.attachment;
  useEffect(() => {
    if (!attachment) return;
    let current = true;
    let loadedUrl = "";
    void loadChatAttachment(message.threadId, message.id).then((value) => {
      loadedUrl = value;
      if (current) setUrl(value);
      else URL.revokeObjectURL(value);
    }).catch(() => { if (current) setError("Unable to open this attachment."); });
    return () => {
      current = false;
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    };
  }, [attachment?.storagePath, message.id, message.threadId]);

  if (!attachment) return null;
  return <div className="message-attachment">
    {attachment.kind === "image" && url ? <img src={url} alt={attachment.name} loading="lazy" /> : null}
    {attachment.kind === "audio" && url ? <audio controls src={url} aria-label={attachment.name} /> : null}
    {attachment.kind === "document" ? <FileText size={22} aria-hidden="true" /> : null}
    <span>{attachment.name}</span>
    {url ? <a href={url} download={attachment.name} aria-label={`Download ${attachment.name}`}><Download size={17} aria-hidden="true" /></a> : <span>{error || "Loading..."}</span>}
  </div>;
};
