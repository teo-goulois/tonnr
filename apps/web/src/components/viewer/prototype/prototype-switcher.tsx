// PROTOTYPE: thrown away once the new details panel is settled. See details-prototype.tsx.

import { ChevronLeftIcon, ChevronRightIcon } from "@repo/ui/icon";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ComponentProps, Suspense, lazy } from "react";
import { createPortal } from "react-dom";

export const VARIANTS = [
  { key: undefined, name: "In use" },
  { key: "a", name: "New panel" },
] as const;

export type VariantKey = NonNullable<(typeof VARIANTS)[number]["key"]>;

/** The variant the address asks for. Never one in production, where the bar is not shown either. */
export function useVariant(): VariantKey | undefined {
  // Only the variant is read: a panel must not be drawn again when the rest of the address changes.
  const asked = useSearch({
    strict: false,
    select: (search: { variant?: string }) => search.variant,
  });
  if (!import.meta.env.DEV) return undefined;
  return VARIANTS.find((variant) => variant.key === asked)?.key;
}

/** The bar that goes from one variant to the next. It is not part of what is being judged. */
export function PrototypeSwitcher() {
  const current = useVariant();
  const navigate = useNavigate();
  if (!import.meta.env.DEV || typeof document === "undefined") return null;

  const index = VARIANTS.findIndex((variant) => variant.key === current);
  function go(step: number) {
    const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length]!;
    void navigate({
      to: ".",
      replace: true,
      search: (previous: Record<string, unknown>) => ({ ...previous, variant: next.key }),
    } as never);
  }
  const button =
    "grid size-7 cursor-pointer place-items-center rounded-full hover:bg-white/15 [&_svg]:size-3.5";

  return createPortal(
    <div className="fixed bottom-3 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black p-1 font-mono text-xs text-white shadow-lg ring-1 ring-white/30">
      <button type="button" className={button} aria-label="Previous variant" onClick={() => go(-1)}>
        <ChevronLeftIcon aria-hidden />
      </button>
      <span className="min-w-28 text-center">{VARIANTS[index]?.name}</span>
      <button type="button" className={button} aria-label="Next variant" onClick={() => go(1)}>
        <ChevronRightIcon aria-hidden />
      </button>
    </div>,
    document.body,
  );
}

// The variants load apart from the panel, so that a build for production never carries them.
const LazyDetails = lazy(() =>
  import("./details-prototype").then((module) => ({ default: module.DetailsPrototype })),
);

export function DetailsPrototype(props: ComponentProps<typeof LazyDetails>) {
  return (
    <Suspense fallback={null}>
      <LazyDetails {...props} />
    </Suspense>
  );
}
