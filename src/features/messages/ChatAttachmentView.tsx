import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { SpeechMediaPlayer } from "@/components/speeches/SpeechMediaPlayer";
import { loadChatAttachment, loadChatAttachmentTranscript } from "./chatAttachmentService";
import type { ChatMessage } from "@/types/models";

const transcriptExcerpt = (value: string) => {
  if (value.length <= 210) return value;
  return `${value.slice(0, 210).replace(/\s+\S*$/, "").trimEnd()}…`;
};

export const ChatAttachmentView = ({ message, viewerId }: { message: ChatMessage; viewerId: string }) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [textPreview, setTextPreview] = useState("");
  const [transcript, setTranscript] = useState(message.attachment?.transcript ?? "");
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptError, setTranscriptError] = useState(false);
  const downloadKey = `chat-attachment-downloaded:${viewerId}:${message.id}`;
  const [downloaded, setDownloaded] = useState(() => {
    try { return window.localStorage.getItem(downloadKey) === "1"; }
    catch { return false; }
  });
  const attachment = message.attachment;
  const canDownload = message.authorId !== viewerId;
  const isPdf = attachment?.contentType === "application/pdf";
  const isText = attachment?.contentType === "text/plain";
  const isWord = attachment?.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
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

  useEffect(() => {
    if (!isText || !url || attachment?.previewText) return;
    let current = true;
    void fetch(url).then((response) => response.text()).then((value) => {
      if (current) setTextPreview(value.slice(0, 1_500));
    }).catch(() => undefined);
    return () => { current = false; };
  }, [attachment?.previewText, isText, url]);

  useEffect(() => {
    if (attachment?.kind !== "audio" || attachment.transcript) return;
    let current = true;
    void loadChatAttachmentTranscript(message.threadId, message.id).then((value) => {
      if (current) setTranscript(value);
    }).catch(() => { if (current) setTranscriptError(true); });
    return () => { current = false; };
  }, [attachment?.kind, attachment?.transcript, message.id, message.threadId]);

  if (!attachment) return null;
  const documentPreview = attachment.previewText || textPreview;
  return <div className="message-attachment-shell">
    <div className={`message-attachment is-${attachment.kind}`}>
      {attachment.kind === "image" && url ? <img src={url} alt={attachment.name} loading="lazy" /> : null}
      {attachment.kind === "audio" && url ? <SpeechMediaPlayer src={url} fileName={attachment.name} contentType={attachment.contentType} /> : null}
      {attachment.kind === "audio" ? <div className="message-audio-transcript">
        <span className="message-audio-transcript-label">Transcript</span>
        <p>{transcript
          ? transcriptExpanded ? transcript : transcriptExcerpt(transcript)
          : transcriptError ? "Transcript unavailable for this recording." : "Preparing transcript…"}</p>
        {transcript.length > 210 ? <button type="button" aria-expanded={transcriptExpanded} onClick={() => setTranscriptExpanded((value) => !value)}>
          {transcriptExpanded ? "Show less" : "Show full transcript"}
        </button> : null}
      </div> : null}
      {attachment.kind === "document" && isPdf && url ? <iframe
        className="message-document-preview is-pdf"
        src={`${url}#toolbar=0&navpanes=0&page=1&view=Fit`}
        title={`Preview of ${attachment.name}`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        tabIndex={-1}
      /> : null}
      {attachment.kind === "document" && (isText || isWord) && documentPreview ? <pre className="message-document-preview is-text">{documentPreview}</pre> : null}
      {attachment.kind === "document" ? <div className="message-document-info">
        <FileText size={20} aria-hidden="true" />
        <span className="message-attachment-name" title={attachment.name}>{attachment.name}</span>
        <span className="message-document-format">{isPdf ? "PDF" : isWord ? "Word" : isText ? "Text" : "File"}</span>
      </div> : null}
      {!url ? <span className="message-attachment-status">{error || "Loading..."}</span> : null}
    </div>
    {canDownload && url ? <a
      className={downloaded ? "message-attachment-download is-downloaded" : "message-attachment-download"}
      href={url}
      download={attachment.name}
      aria-label={`Download ${attachment.name}`}
      title={downloaded ? "Downloaded" : "Download"}
      onClick={() => {
        setDownloaded(true);
        try { window.localStorage.setItem(downloadKey, "1"); } catch { /* Downloads still work without local storage. */ }
      }}
    ><Download size={18} aria-hidden="true" /></a> : null}
  </div>;
};
