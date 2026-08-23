import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrbitSelectorItem<T extends string = string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
};

type OrbitSelectorProps<T extends string = string> = {
  items: OrbitSelectorItem<T>[];
  selectedValue?: T;
  onSelect: (value: T) => void;
  ariaLabel: string;
  rotationInterval?: number;
  autoRotate?: boolean;
  pauseOnInteractionMs?: number;
  centralContent?: (item: OrbitSelectorItem<T> | undefined) => ReactNode;
  className?: string;
};

export function OrbitSelector<T extends string = string>({
  items,
  selectedValue,
  onSelect,
  ariaLabel,
  rotationInterval = 2500,
  autoRotate = true,
  pauseOnInteractionMs = 5000,
  centralContent,
  className,
}: OrbitSelectorProps<T>) {
  const initialIndex = Math.max(0, items.findIndex((item) => item.value === selectedValue));
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (!items.length || !autoRotate || reducedMotion || hovered) return;
    const id = window.setInterval(() => {
      if (Date.now() < pausedUntil) return;
      setFocusedIndex((index) => (index + 1) % items.length);
    }, rotationInterval);
    return () => window.clearInterval(id);
  }, [autoRotate, hovered, items.length, pausedUntil, reducedMotion, rotationInterval]);

  useEffect(() => {
    if (!items.length) return;
    setFocusedIndex((index) => Math.min(index, items.length - 1));
  }, [items.length]);

  const pauseFromInteraction = () => setPausedUntil(Date.now() + pauseOnInteractionMs);
  const moveFocus = (delta: number) => {
    if (!items.length) return;
    pauseFromInteraction();
    setFocusedIndex((index) => (index + delta + items.length) % items.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(-1);
    } else if ((event.key === "Enter" || event.key === " ") && items[focusedIndex] && !items[focusedIndex].disabled) {
      event.preventDefault();
      pauseFromInteraction();
      onSelect(items[focusedIndex].value);
    }
  };

  const focusedItem = items[focusedIndex];

  return (
    <div
      ref={rootRef}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={focusedItem ? `${ariaLabel}-${focusedItem.value}` : undefined}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false);
      }}
      className={cn("relative mx-auto w-full max-w-2xl rounded-3xl border bg-card/80 p-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-6", className)}
    >
      <div className="relative min-h-[340px] overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-background to-primary/10 sm:min-h-[390px]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15 sm:h-64 sm:w-64" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 sm:h-80 sm:w-80" />

        <div className="absolute left-1/2 top-1/2 z-10 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/30 bg-background/95 shadow-lg sm:h-36 sm:w-36">
          {centralContent ? centralContent(focusedItem) : (
            <div className="flex flex-col items-center gap-2 px-3 text-center">
              <div className="text-primary">{focusedItem?.icon}</div>
              <span className="text-xs font-semibold sm:text-sm">{focusedItem?.label}</span>
            </div>
          )}
        </div>

        {items.map((item, index) => {
          const count = Math.max(items.length, 1);
          const relative = ((index - focusedIndex + count) % count + count) % count;
          const signed = relative > count / 2 ? relative - count : relative;
          const angle = signed * (360 / count) - 20;
          const radius = typeof window !== "undefined" && window.innerWidth < 640 ? 118 : 150;
          const x = Math.cos((angle * Math.PI) / 180) * radius;
          const y = Math.sin((angle * Math.PI) / 180) * radius;
          const isFocused = index === focusedIndex;
          const isSelected = item.value === selectedValue;

          return (
            <button
              key={item.value}
              id={`${ariaLabel}-${item.value}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={item.disabled}
              onClick={() => {
                setFocusedIndex(index);
                pauseFromInteraction();
                if (!item.disabled) onSelect(item.value);
              }}
              style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isFocused ? 1.08 : 0.92})` }}
              className={cn(
                "absolute left-1/2 top-1/2 flex min-w-20 max-w-28 flex-col items-center gap-1 rounded-2xl border bg-background/95 px-3 py-2 text-center shadow-sm transition-[transform,opacity,border-color,box-shadow] duration-500 ease-out",
                isFocused ? "z-20 border-primary/60 opacity-100 shadow-md" : "z-0 border-border/70 opacity-70",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                item.disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <span className={cn("text-muted-foreground", (isFocused || isSelected) && "text-primary")}>{item.icon}</span>
              <span className="text-[11px] font-medium leading-tight sm:text-xs">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-label="Previous option"
          onClick={() => moveFocus(-1)}
          className="absolute bottom-3 left-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/90 shadow-sm transition hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next option"
          onClick={() => moveFocus(1)}
          className="absolute bottom-3 right-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/90 shadow-sm transition hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex min-h-10 items-center justify-center text-center">
        <p className="text-xs text-muted-foreground">
          {focusedItem?.description || "Use arrow keys or the controls to explore. Click an option to select it."}
        </p>
      </div>
    </div>
  );
}

export function LiveDigitalClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time className={cn("font-mono text-xl font-bold tracking-wider text-primary sm:text-2xl", className)} dateTime={now.toISOString()}>
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </time>
  );
}
