import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
};

export const SpeechMediaPlayer = ({
  src,
  fileName,
  contentType,
}: {
  src: string;
  fileName: string;
  contentType?: string;
}) => {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const hasPlayedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const isVideo = contentType?.startsWith("video/")
    || /\.(mp4|m4v|mov|ogv)$/i.test(fileName);

  useEffect(() => {
    hasPlayedRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError("");
  }, [src]);

  const setMediaRef = (element: HTMLMediaElement | null) => {
    mediaRef.current = element;
  };
  const mediaEvents = {
    onLoadedMetadata: () => {
      const length = mediaRef.current?.duration ?? 0;
      setDuration(Number.isFinite(length) ? length : 0);
    },
    onDurationChange: () => {
      const length = mediaRef.current?.duration ?? 0;
      setDuration(Number.isFinite(length) ? length : 0);
    },
    onTimeUpdate: () => {
      const time = mediaRef.current?.currentTime ?? 0;
      if (time > 0) hasPlayedRef.current = true;
      setCurrentTime(time);
    },
    onPlay: () => { hasPlayedRef.current = true; setError(""); setIsPlaying(true); },
    onPause: () => setIsPlaying(false),
    onEnded: () => { setError(""); setIsPlaying(false); },
    onError: () => {
      // Safari can emit a late media error for a blob URL after the clip has
      // already played. Only report a failure when playback never started.
      if (!hasPlayedRef.current && mediaRef.current?.error) {
        setError("This recording could not be played. Try downloading the file.");
      }
    },
  };

  const togglePlayback = async () => {
    const media = mediaRef.current;
    if (!media) return;
    if (!media.paused) {
      media.pause();
      return;
    }
    try {
      setError("");
      await media.play();
    } catch (cause) {
      if (!hasPlayedRef.current && (cause as { name?: string } | null)?.name !== "AbortError") {
        setError("This recording could not be played. Try downloading the file.");
      }
    }
  };

  return (
    <div className="speech-media-player">
      {isVideo ? (
        <video ref={setMediaRef} src={src} preload="metadata" playsInline className="speech-video" {...mediaEvents} />
      ) : (
        <audio ref={setMediaRef} src={src} preload="metadata" {...mediaEvents} />
      )}
      <div className="speech-media-controls">
        <button type="button" className="speech-media-play" aria-label={isPlaying ? "Pause recording" : "Play recording"} onClick={() => void togglePlayback()}>
          {isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <span className="speech-media-time">{formatTime(currentTime)}</span>
        <input
          type="range"
          aria-label="Seek recording"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          disabled={!duration}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (mediaRef.current) mediaRef.current.currentTime = next;
            setCurrentTime(next);
          }}
        />
        <span className="speech-media-time">{formatTime(duration)}</span>
      </div>
      {error ? <p className="speech-field-error" role="alert">{error}</p> : null}
    </div>
  );
};
