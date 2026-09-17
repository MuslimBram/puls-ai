import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrbitSelectorItem<T extends string = string> = {
  value: T; label: string; icon?: ReactNode; description?: string; disabled?: boolean;
};

type OrbitSelectorProps<T extends string = string> = {
  items: OrbitSelectorItem<T>[]; selectedValue?: T; onSelect: (value: T) => void;
  ariaLabel: string; rotationInterval?: number; autoRotate?: boolean; pauseOnInteractionMs?: number;
  centralContent?: (item: OrbitSelectorItem<T> | undefined) => ReactNode; className?: string;
  /** Reverses autoplay, keyboard, swipe, and orbit placement when requested. */
  direction?: "forward" | "reverse";
  /** Maximum number of visible options, including the focused center option. */
  maxVisibleItems?: number;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update(); media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}

export function OrbitSelector<T extends string = string>({
  items, selectedValue, onSelect, ariaLabel, rotationInterval = 2500, autoRotate = true,
  pauseOnInteractionMs = 5000, centralContent, className, direction = "forward", maxVisibleItems = 4,
}: OrbitSelectorProps<T>) {
  const directionSign = direction === "reverse" ? -1 : 1;
  const initialIndex = Math.max(0, items.findIndex((item) => item.value === selectedValue));
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);
  const [pausedUntil, setPausedUntil] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const rawId = useId();
  const idPrefix = `orbit-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 639px)");

  useEffect(() => {
    const selectedIndex = items.findIndex((item) => item.value === selectedValue);
    if (selectedIndex >= 0) setFocusedIndex(selectedIndex);
  }, [items, selectedValue]);

  useEffect(() => {
    if (!items.length || !autoRotate || reducedMotion) return;
    const id = window.setInterval(() => {
      if (Date.now() >= pausedUntil) setFocusedIndex((index) => (index + directionSign + items.length) % items.length);
    }, rotationInterval);
    return () => window.clearInterval(id);
  }, [autoRotate, directionSign, items.length, pausedUntil, reducedMotion, rotationInterval]);

  const pauseFromInteraction = () => setPausedUntil(Date.now() + pauseOnInteractionMs);
  const moveFocus = (delta: number) => {
    if (!items.length) return;
    pauseFromInteraction();
    setFocusedIndex((index) => (index + (delta * directionSign) + items.length) % items.length);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault(); moveFocus(event.key === "ArrowRight" ? 1 : -1);
    } else if ((event.key === "Enter" || event.key === " ") && items[focusedIndex] && !items[focusedIndex].disabled) {
      event.preventDefault(); pauseFromInteraction(); onSelect(items[focusedIndex].value);
    }
  };
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => { touchStartX.current = event.touches[0]?.clientX ?? null; };
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const startX = touchStartX.current; touchStartX.current = null;
    const endX = event.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined || Math.abs(endX - startX) < 40) return;
    moveFocus(endX < startX ? 1 : -1);
  };

  const focusedItem = items[focusedIndex];
  const radiusX = compact ? 126 : 205;
  const radiusY = compact ? 104 : 142;
  const visibleCount = Math.min(items.length, Math.max(2, maxVisibleItems));
  const orbitItems = Array.from({ length: Math.max(visibleCount - 1, 0) }, (_, offset) => {
    const index = (focusedIndex + ((offset + 1) * directionSign) + items.length) % items.length;
    return { item: items[index], originalIndex: index };
  });
  const visibleIndexes = new Set([focusedIndex, ...orbitItems.map(({ originalIndex }) => originalIndex)]);
  const hiddenItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !visibleIndexes.has(index));

  return (
    <div role="listbox" aria-label={ariaLabel}
      aria-activedescendant={focusedItem ? `${idPrefix}-${focusedItem.value}` : undefined}
      tabIndex={0} onKeyDown={handleKeyDown} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
      className={cn("relative mx-auto w-full max-w-2xl rounded-3xl border bg-card/80 p-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-6", className)}
    >
      <div className="relative min-h-[300px] touch-pan-y overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-background to-primary/10 sm:min-h-[350px]">
        <svg data-testid="orbit-arch" aria-hidden="true" viewBox="0 0 520 250"
          className="pointer-events-none absolute left-1/2 top-[18%] h-[62%] w-[92%] -translate-x-1/2 overflow-visible">
          <path d="M 35 220 A 225 190 0 0 1 485 220" fill="none" stroke="currentColor"
            className="text-primary/25" strokeWidth="2" strokeLinecap="round" />
        </svg>

        <button
          data-testid="orbit-center-symbol"
          id={focusedItem ? `${idPrefix}-${focusedItem.value}` : undefined}
          type="button"
          role="option"
          aria-label={focusedItem?.label}
          aria-selected={focusedItem?.value === selectedValue}
          disabled={!focusedItem || focusedItem.disabled}
          onClick={() => {
            pauseFromInteraction();
            if (focusedItem && !focusedItem.disabled) onSelect(focusedItem.value);
          }}
          className={cn(
            "absolute left-1/2 top-[76%] z-20 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/35 bg-background/95 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-28 sm:w-28",
            focusedItem?.value === selectedValue && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            focusedItem?.disabled && "cursor-not-allowed opacity-40",
          )}
        >
          {centralContent ? centralContent(focusedItem) : <span className="text-primary">{focusedItem?.icon}</span>}
        </button>

        {orbitItems.map(({ item, originalIndex }, orbitIndex) => {
          const count = Math.max(orbitItems.length, 1);
          const progress = count === 1 ? 0.5 : orbitIndex / (count - 1);
          // Always place the next option at the right and move it across the
          // upper half-circle. directionSign controls which option enters next.
          const angle = -progress * Math.PI;
          const x = Math.cos(angle) * radiusX;
          const y = Math.sin(angle) * radiusY;
          const isSelected = item.value === selectedValue;
          return (
            <button key={item.value} id={`${idPrefix}-${item.value}`} type="button" role="option"
              aria-selected={isSelected} disabled={item.disabled}
              onClick={() => { setFocusedIndex(originalIndex); pauseFromInteraction(); if (!item.disabled) onSelect(item.value); }}
              style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0.9)` }}
              className={cn(
                "absolute left-1/2 top-[76%] flex min-w-20 max-w-28 flex-col items-center gap-1 rounded-2xl border bg-background/95 px-3 py-2 text-center shadow-sm transition-[transform,opacity,border-color,box-shadow] duration-700 ease-in-out motion-reduce:transition-none",
                "z-10 border-border/70 opacity-75",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                item.disabled && "cursor-not-allowed opacity-40",
              )}>
              <span className={cn("text-muted-foreground", isSelected && "text-primary")}>{item.icon}</span>
              <span className="text-[11px] font-medium leading-tight sm:text-xs">{item.label}</span>
            </button>
          );
        })}

        {hiddenItems.map(({ item }) => (
          <button
            key={`orbit-a11y-${item.value}`}
            id={`${idPrefix}-${item.value}`}
            type="button"
            role="option"
            aria-selected={item.value === selectedValue}
            disabled={item.disabled}
            onClick={() => {
              pauseFromInteraction();
              if (!item.disabled) onSelect(item.value);
            }}
            className="sr-only"
          >
            {item.label}
          </button>
        ))}

        <button type="button" aria-label="Previous option" onClick={() => moveFocus(-1)}
          className="absolute bottom-3 left-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Next option" onClick={() => moveFocus(1)}
          className="absolute bottom-3 right-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex min-h-10 items-center justify-center text-center">
        <p className="text-xs text-muted-foreground">{focusedItem?.description || "Use arrow keys, swipe, or the controls to explore. Click an option to select it."}</p>
      </div>
    </div>
  );
}

export function LiveDigitalClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  return <time className={cn("font-mono text-xl font-bold tracking-wider text-primary sm:text-2xl", className)}
    dateTime={now.toISOString()} aria-label={`Local time ${now.toLocaleTimeString()}`}>
    {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
  </time>;
}
