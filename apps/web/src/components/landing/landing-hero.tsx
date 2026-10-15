import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { ArrowRightIcon, BellOnFillDuoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type CSSProperties, type Ref, useEffect, useLayoutEffect, useRef, useState } from "react";

import { WAVE_HEIGHT_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { Tile, Woven, column } from "./landing-parts";

// The top of the page comes in once, a part after the other, as every part of the landing arrives:
// a rise, a fade and a blur that clears. The alerts come last, from where they fall.
const arrives =
  "animate-in fade-in blur-in-[4px] slide-in-from-bottom-3 fill-mode-both duration-700 ease-theme-large motion-reduce:animate-none";

// The map behind the words, in the reader's language and in each theme, which
// `scripts/landing-shots.mjs` takes of the app. Its map and its sea are credited on `/sources`.
const MAP = { width: 3390, height: 1990 };
const mapOf = (theme: "light" | "dark") => `/landing/hero-map-${theme}-${getLocale()}.webp`;

// What falls on a phone while the page is read: four alerts, in the words a push says them.
const PUSHES = [
  { title: m.landing_hero_push_1_title, text: m.landing_hero_push_1_text },
  { title: m.landing_hero_push_2_title, text: m.landing_hero_push_2_text },
  { title: m.landing_hero_push_3_title, text: m.landing_hero_push_3_text },
  { title: m.landing_hero_push_4_title, text: m.landing_hero_push_4_text },
];

// The stack is Sonner's: the newest in front, the ones before it behind, each lower by the gap
// and smaller by a twentieth, with only the front one's words showing. Pointing at it spreads
// them and holds the next one back.
const STACK = { gap: 14, shown: 3, every: 3600, ms: 400 };

/** The pointer over an element, as `--px` and `--py` from -1 to 1, written without a render. */
function usePointerDepth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      element.style.setProperty("--px", String(((event.clientX - box.left) / box.width) * 2 - 1));
      element.style.setProperty("--py", String(((event.clientY - box.top) / box.height) * 2 - 1));
    };
    const leave = () => {
      element.style.setProperty("--px", "0");
      element.style.setProperty("--py", "0");
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
    };
  }, []);
  return ref;
}

// A layer that follows the pointer by `depth` pixels, and takes `ms` to get there.
const layer = (depth: number, ms: number): CSSProperties => ({
  translate: `calc(var(--px, 0) * ${depth}px) calc(var(--py, 0) * ${depth * 0.6}px)`,
  transition: `translate ${ms}ms cubic-bezier(.2,.8,.2,1)`,
});

// A push as a phone shows it.
function Push({
  ref,
  title,
  text,
  when,
  className,
}: {
  ref?: Ref<HTMLDivElement>;
  title: string;
  text: string;
  when: string;
  className?: string;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex w-80 items-start gap-s rounded-[22px] bg-neutral-1/85 p-s text-left backdrop-blur-xl",
        "shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_40px_-8px_rgb(0_0_0/0.25)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_12px_40px_-8px_rgb(0_0_0/0.6)]",
        className,
      )}
    >
      <img
        src="/apple-touch-icon.png"
        alt=""
        className="size-9 shrink-0 rounded-[9px] outline outline-1 -outline-offset-1 outline-black/10"
      />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
        <div className="flex items-baseline justify-between gap-s">
          <span className="truncate text-s font-semibold">{title}</span>
          <span className="shrink-0 text-xs text-neutral-7">{when}</span>
        </div>
        <span className="text-s leading-snug text-neutral-8">{text}</span>
      </div>
    </div>
  );
}

function StackedPush({
  index,
  spread,
  offset,
  height,
  onMeasure,
  title,
  text,
}: {
  index: number;
  spread: boolean;
  offset: number;
  height: number | undefined;
  onMeasure: (height: number) => void;
  title: string;
  text: string;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [isIn, setIn] = useState(false);

  // Measured once, as it arrives, and let in at the next frame, so that it slides from above.
  useLayoutEffect(() => {
    if (card.current) onMeasure(card.current.scrollHeight);
    const frame = requestAnimationFrame(() => setIn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const isBehind = index > 0 && !spread;
  return (
    <div
      className="absolute inset-x-0 top-0 origin-bottom motion-reduce:transition-none!"
      style={{
        zIndex: STACK.shown + 1 - index,
        height,
        opacity: isIn && index < STACK.shown ? 1 : 0,
        transform: isIn
          ? `translateY(${offset}px) scale(${spread ? 1 : 1 - index * 0.05})`
          : "translateY(-100%)",
        transition: `transform ${STACK.ms}ms, opacity ${STACK.ms}ms, height ${STACK.ms}ms`,
      }}
    >
      <Push
        ref={card}
        title={title}
        text={text}
        when={
          index === 0 ? m.landing_hero_push_now() : m.landing_hero_push_ago({ minutes: index * 4 })
        }
        className={cn(
          "h-full overflow-hidden [&>*]:transition-opacity [&>*]:duration-400",
          isBehind && "[&>*]:opacity-0",
        )}
      />
    </div>
  );
}

/** The alerts as they fall on a phone, one after the other, in a stack as Sonner draws one. */
function PushStack() {
  const [arrived, setArrived] = useState(1);
  const [spread, setSpread] = useState(false);
  const [heights, setHeights] = useState<Record<number, number>>({});

  useEffect(() => {
    if (spread || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setArrived((count) => count + 1), STACK.every);
    return () => window.clearInterval(timer);
  }, [spread]);

  // The newest first, and one more than is shown, which fades out as the next one comes.
  const stack = Array.from({ length: Math.min(arrived, STACK.shown + 1) }, (_, index) => {
    const id = arrived - 1 - index;
    return { id, index, push: PUSHES[id % PUSHES.length] };
  });
  const front = heights[stack[0].id] ?? 0;
  const above = (index: number) =>
    stack.slice(0, index).reduce((sum, { id }) => sum + (heights[id] ?? 0) + STACK.gap, 0);

  return (
    <div
      aria-hidden
      className="relative w-80"
      style={{ height: spread ? above(STACK.shown) : front + STACK.gap * (STACK.shown - 1) }}
      onPointerEnter={() => setSpread(true)}
      onPointerLeave={() => setSpread(false)}
    >
      {stack.map(({ id, index, push }) => (
        <StackedPush
          key={id}
          index={index}
          spread={spread}
          offset={spread ? above(index) : index * STACK.gap}
          height={spread || index === 0 ? heights[id] : front}
          onMeasure={(height) => setHeights((known) => ({ ...known, [id]: height }))}
          title={push.title()}
          text={push.text()}
        />
      ))}
    </div>
  );
}

/**
 * The top of the page: the map fills it, and what the product is stands over it, with the way in;
 * on a wide screen, the alerts fall over the map as they would on a phone.
 */
export function LandingHero() {
  const depth = usePointerDepth<HTMLElement>();

  return (
    <section
      ref={depth}
      className="relative isolate -mt-[calc(var(--space-xxl)*1.4)] min-h-[min(100svh,980px)] overflow-hidden max-sm:min-h-[36rem]"
    >
      {/* The map sinks behind the words as the page is scrolled, slower than they go: `landing-sink`
          in `index.css`, where the browser ties an animation to the scroll. */}
      <div aria-hidden className="landing-sink absolute -inset-[2%] -z-10">
        <div className="absolute inset-0" style={layer(-6, 1400)}>
          {/* The map comes in first, out of a blur and from a little closer, as the page is drawn:
              the words then arrive over it. */}
          <div className="absolute inset-0 animate-in fade-in blur-in-[12px] zoom-in-106 fill-mode-both duration-[1600ms] ease-theme-large motion-reduce:animate-none">
            {/* Both are lazy, so that a browser fetches only the one its theme shows. */}
            {(["light", "dark"] as const).map((theme) => (
              <img
                key={theme}
                src={mapOf(theme)}
                alt=""
                width={MAP.width}
                height={MAP.height}
                loading="lazy"
                className={cn(
                  "absolute inset-y-0 left-[-6%] h-full w-[112%] max-w-none object-cover object-[55%_45%]",
                  theme === "light" ? "dark:hidden" : "hidden dark:block",
                )}
              />
            ))}
          </div>
        </div>
      </div>
      {/* The page washes over the map, whole under the words, so that no marker shows through
          them, and the map shows beyond. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--neutral-1)_0%,var(--neutral-1)_46%,color-mix(in_oklab,var(--neutral-1)_60%,transparent)_57%,transparent_78%)] max-lg:bg-[linear-gradient(90deg,var(--neutral-1)_0%,color-mix(in_oklab,var(--neutral-1)_88%,transparent)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 -z-10 w-[8%] bg-linear-to-r from-transparent to-neutral-1"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-56 bg-linear-to-b from-transparent to-neutral-1"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-t from-transparent to-neutral-1"
      />

      <div
        className={`${column} flex min-h-[inherit] items-center pt-[calc(var(--space-xxl)*2.4)] pb-xxl`}
      >
        <div className="landing-lift grid w-full max-w-[42rem] justify-items-start gap-m sm:gap-l">
          <h1
            className={`${arrives} text-[2.25rem] leading-[1.04] sm:text-[clamp(2.5rem,4.6vw,4rem)] font-bold tracking-[-0.04em] text-balance text-neutral-9`}
          >
            <Woven
              say={m.landing_hero_title}
              words={{
                word: (
                  <>
                    <Tile color={scaleColor(WAVE_HEIGHT_SCALE, 1.5)} className="mr-[0.18em]">
                      <BellOnFillDuoIcon />
                    </Tile>
                    {m.landing_hero_word()}
                  </>
                ),
              }}
            />
          </h1>
          <p
            className={`${arrives} max-w-[30rem] leading-[1.5] sm:text-l sm:leading-[1.45] tracking-[-0.01em] text-neutral-7 delay-100`}
          >
            {m.landing_hero_body()}
          </p>
          <div className={`${arrives} grid justify-items-start gap-s delay-200`}>
            <Link
              to="/app"
              className={cn(
                buttonVariants(),
                "group h-12 gap-s rounded-full bg-neutral-9 pr-m pl-l sm:h-14 sm:text-l shadow-[0_10px_30px_-12px_rgb(0_0_0/0.4)] hover:bg-neutral-10",
              )}
            >
              {m.landing_open_map()}
              <ArrowRightIcon
                aria-hidden
                className="size-4 transition-[translate] duration-(--motion-duration) ease-theme group-hover:translate-x-0.5 sm:size-5"
              />
            </Link>
            <p className="text-s text-neutral-7">{m.landing_hero_free()}</p>
          </div>
        </div>
      </div>

      <div
        className="landing-lift absolute top-[30%] right-[12%] max-lg:hidden"
        style={layer(12, 1000)}
      >
        <div className="animate-in fade-in blur-in-[4px] fill-mode-both duration-700 ease-theme-large delay-300 motion-reduce:animate-none">
          <PushStack />
        </div>
      </div>
    </section>
  );
}
