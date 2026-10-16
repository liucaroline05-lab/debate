import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ResourceItem } from "@/types/models";

// One looping "set" repeats the list until it holds more cards than fit on
// screen (three), so a single set always fills the row.
const MIN_SET_LENGTH = 4;
const SCROLL_SETTLE_MS = 140;

interface QuickReadsCarouselProps {
  resources: ResourceItem[];
  getPath: (resource: ResourceItem) => string;
  getDescription: (resource: ResourceItem) => string;
}

interface CarouselSlot {
  resource: ResourceItem;
  copy: number;
  slot: number;
  /** False for the looping duplicates, which are hidden from assistive tech. */
  isPrimary: boolean;
}

/**
 * Quick reads in an endless carousel. Three copies of the list sit side by
 * side and the view is kept on the middle copy: whenever scrolling settles
 * near either end, the row jumps by exactly one copy, which lands on an
 * identical card, so the loop has no visible start or end.
 */
export const QuickReadsCarousel = ({ resources, getPath, getDescription }: QuickReadsCarouselProps) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef(0);
  const [centeredSlot, setCenteredSlot] = useState<number | null>(null);
  const loops = resources.length > 1;

  const slots = useMemo<CarouselSlot[]>(() => {
    if (!loops) return resources.map((resource, slot) => ({ resource, copy: 0, slot, isPrimary: true }));
    const repeats = Math.ceil(MIN_SET_LENGTH / resources.length);
    const set = Array.from({ length: repeats }, () => resources).flat();
    return [0, 1, 2].flatMap((copy) => set.map((resource, slot) => ({
      resource,
      copy,
      slot,
      isPrimary: copy === 1 && slot < resources.length,
    })));
  }, [loops, resources]);

  const cardAt = (track: HTMLElement, copy: number, slot: number) =>
    track.querySelector<HTMLElement>(`[data-copy="${copy}"][data-slot="${slot}"]`);

  const setWidth = (track: HTMLElement) => {
    const first = cardAt(track, 0, 0);
    const middle = cardAt(track, 1, 0);
    return first && middle ? middle.offsetLeft - first.offsetLeft : 0;
  };

  // Every copy of the card nearest the middle is enlarged, so the class does
  // not change (and nothing animates) when the loop jumps between copies.
  const updateCentered = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;
    let closestSlot: number | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    track.querySelectorAll<HTMLElement>("[data-slot]").forEach((card) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - trackCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSlot = Number(card.dataset.slot);
      }
    });
    setCenteredSlot(closestSlot);
  }, []);

  const keepInMiddleCopy = useCallback(() => {
    const track = trackRef.current;
    if (!track || !loops) return;
    const width = setWidth(track);
    if (!width) return;
    if (track.scrollLeft < width * 0.5) track.scrollLeft += width;
    else if (track.scrollLeft > width * 1.5) track.scrollLeft -= width;
  }, [loops]);

  // Start on the middle copy, lined up the way an unlooped list would begin.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = loops ? setWidth(track) : 0;
    updateCentered();
  }, [loops, slots, updateCentered]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const settle = () => {
      window.clearTimeout(settleTimerRef.current);
      keepInMiddleCopy();
      updateCentered();
    };
    const onScroll = () => {
      updateCentered();
      // Browsers without `scrollend` settle after a short pause instead.
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(settle, SCROLL_SETTLE_MS);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", settle);
    window.addEventListener("resize", settle);
    return () => {
      window.clearTimeout(settleTimerRef.current);
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", settle);
      window.removeEventListener("resize", settle);
    };
  }, [keepInMiddleCopy, updateCentered]);

  const step = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    keepInMiddleCopy();
    const first = cardAt(track, loops ? 1 : 0, 0);
    const second = cardAt(track, loops ? 1 : 0, 1) ?? cardAt(track, 2, 0);
    const cardStep = first && second ? second.offsetLeft - first.offsetLeft : track.clientWidth / 3;
    track.scrollBy({ left: direction * cardStep, behavior: "smooth" });
  };

  return (
    <div className="resource-quick-reads-viewport">
      {loops ? (
        <button type="button" className="carousel-button carousel-button-left" aria-label="Previous quick read" onClick={() => step(-1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      ) : null}
      <div className="resource-quick-reads-row" ref={trackRef}>
        {slots.map(({ resource, copy, slot, isPrimary }) => (
          <Link
            key={`${copy}-${slot}`}
            to={getPath(resource)}
            data-copy={copy}
            data-slot={slot}
            aria-hidden={isPrimary ? undefined : true}
            tabIndex={isPrimary ? undefined : -1}
            className={centeredSlot === slot ? "resource-quick-read-card is-centered" : "resource-quick-read-card"}
          >
            <span className="pill">{resource.category}</span>
            <strong>{resource.title}</strong>
            <p className="card-copy">{getDescription(resource)}</p>
            <span className="meta-line">
              {resource.level} • {resource.format ?? "All Formats"} • {resource.estimatedTime ?? "Quick read"}
            </span>
          </Link>
        ))}
      </div>
      {loops ? (
        <button type="button" className="carousel-button carousel-button-right" aria-label="Next quick read" onClick={() => step(1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
};
