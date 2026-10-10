/*
 * PROTOTYPE, to throw away.
 *
 * The question: what should the editor of a spot look like? A spot is a point, a name and the
 * conditions that make it work (decision 006), and the API has held it since the start. The web
 * app has no screen for it, so nobody can set an alert.
 *
 * Three variants on the existing `/app` route, behind `?spot=a`, `?spot=b` and `?spot=c`, in
 * development only. The bar under the header goes from one to the next, and so do the arrow keys.
 *
 * - A, the form: every criterion is a field in view, in the panel beside the map.
 * - B, on the forecast: the week ahead is docked under the map, a lane for each quantity, and a
 *   criterion is a band dragged on its lane. An hour that worked draws every band around it.
 * - C, in a sentence: the spot is said in one sentence whose parts open what changes them, and
 *   the windows it gives come under it with what holds it back.
 *
 * All three keep one draft, so going from one to the next shows the same spot. The point is the
 * surf break that is open, or where the map was pressed. The hours that work are found by the
 * alert engine's own functions, on the forecast and the tide the API gives for the point.
 *
 * Nothing is saved: "Save" shows what `POST /v1/spots` would be sent.
 *
 * When one has won: write it as a screen that takes props in `components/spots/`, put its
 * strings in the messages, have the route save through `v1.spots.create`, and delete this
 * folder with the lines marked PROTOTYPE in the route, the viewer and the map.
 */

import { ChevronLeftIcon, ChevronRightIcon } from "@repo/ui/icon";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { Forecast, Loadable, SurfBreak, TideExtremes, TideTimeline } from "../types";
import { ViewerDrawer } from "../viewer-drawer";
import { DraftState } from "./parts";
import {
  type Criteria,
  type Draft,
  type Judged,
  type Point,
  HOUR_MS,
  hoursAhead,
  judge,
  suggest,
  t,
  tideBounds,
} from "./shared";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

export type EditorVariant = "a" | "b" | "c";
export const EDITOR_VARIANTS: { key: EditorVariant; name: () => string }[] = [
  { key: "a", name: () => t("A · The form", "A · Le formulaire") },
  { key: "b", name: () => t("B · On the forecast", "B · Sur la prévision") },
  { key: "c", name: () => t("C · In a sentence", "C · En une phrase") },
];

/** What every variant is given. Each one is free to lay it out as it likes. */
export type EditorProps = {
  draft: Draft;
  onDraft: (update: Partial<Draft>) => void;
  onCriteria: (criteria: Criteria) => void;
  // The hours ahead, each with the criteria it does not meet, and the windows they make.
  judged: Judged;
  // The lowest and the highest water of the days loaded. Undefined far from any tide.
  tide: { low: number; high: number } | undefined;
  // Where the spot is, in words.
  place: string;
  // What saving would send.
  footer: ReactNode;
  onSave: () => void;
  onClose: () => void;
};

type SpotEditorPrototypeProps = {
  variant: EditorVariant;
  wide: boolean;
  now: number;
  point: Point | null;
  // The surf break the spot starts from. Undefined for a point pressed on the map.
  found: SurfBreak | undefined;
  forecast: Loadable<Forecast>;
  tides: Loadable<TideTimeline>;
  extremes: Loadable<TideExtremes>;
  onVariant: (variant: EditorVariant) => void;
  onClose: () => void;
};

/** The bar that goes from one variant to the next. It is not part of what is being judged. */
function EditorSwitcher({
  current,
  onVariant,
}: {
  current: EditorVariant;
  onVariant: (variant: EditorVariant) => void;
}) {
  const index = EDITOR_VARIANTS.findIndex((variant) => variant.key === current);
  const go = (step: number) =>
    onVariant(
      EDITOR_VARIANTS[(index + step + EDITOR_VARIANTS.length) % EDITOR_VARIANTS.length]!.key,
    );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // The arrows belong to what is being typed in, or dragged.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable], [role=slider]")) return;
      go(event.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (typeof document === "undefined") return null;
  const button =
    "grid size-7 cursor-pointer place-items-center rounded-full hover:bg-white/15 [&_svg]:size-3.5";
  // Under the header and not at the bottom of the screen, where one variant docks its lanes.
  return createPortal(
    <div className="fixed top-[4.25rem] left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black p-1 font-mono text-xs text-white shadow-lg ring-1 ring-white/30">
      <button type="button" className={button} aria-label="Previous variant" onClick={() => go(-1)}>
        <ChevronLeftIcon aria-hidden />
      </button>
      <span className="min-w-44 text-center">{EDITOR_VARIANTS[index]?.name()}</span>
      <button type="button" className={button} aria-label="Next variant" onClick={() => go(1)}>
        <ChevronRightIcon aria-hidden />
      </button>
    </div>,
    document.body,
  );
}

const EMPTY: Draft = { name: "", criteria: {}, alertsEnabled: true, visibility: "private" };

export function SpotEditorPrototype({
  variant,
  wide,
  now,
  point,
  found,
  forecast,
  tides,
  extremes,
  onVariant,
  onClose,
}: SpotEditorPrototypeProps) {
  // The draft starts from what the catalogue says of the break, and again when the tide of the
  // place comes, until a criterion is touched. It is kept from one variant to the next.
  const seed = found?.id ?? (point ? "point" : "");
  const hasTides = tides.data !== undefined;
  const [state, setState] = useState({ seed: "", hasTides: false, touched: false, draft: EMPTY });
  if (state.seed !== seed || (!state.touched && state.hasTides !== hasTides)) {
    setState({
      seed,
      hasTides,
      touched: false,
      draft: {
        ...state.draft,
        name: state.seed === seed ? state.draft.name : (found?.name ?? ""),
        criteria: seed ? suggest(found, tides.data) : {},
      },
    });
  }
  const { draft } = state;
  const onDraft = (update: Partial<Draft>) =>
    setState((previous) => ({ ...previous, draft: { ...previous.draft, ...update } }));
  const onCriteria = (criteria: Criteria) =>
    setState((previous) => ({
      ...previous,
      touched: true,
      draft: { ...previous.draft, criteria },
    }));

  const hour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const hours = useMemo(
    () => hoursAhead(forecast.data, tides.data, extremes.data, hour),
    [forecast.data, tides.data, extremes.data, hour],
  );
  const judged = useMemo(() => judge(hours, draft.criteria), [hours, draft.criteria]);
  const tide = useMemo(() => tideBounds(tides.data), [tides.data]);

  const place = !point
    ? t(
        "Press the map where the spot is, or press a surf break.",
        "Clique la carte là où est le spot, ou clique un break.",
      )
    : found
      ? t(`From the catalogue: ${found.name}`, `Depuis le catalogue : ${found.name}`)
      : t(
          `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)} · press the map to move it`,
          `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)} · clique la carte pour le déplacer`,
        );
  const editor: EditorProps = {
    draft,
    onDraft,
    onCriteria,
    judged,
    tide,
    place,
    footer: <DraftState draft={draft} point={point} breakId={found?.id} />,
    onSave: () =>
      toast(t("Prototype: nothing is saved.", "Prototype : rien n’est enregistré."), {
        description: JSON.stringify(draft.criteria),
      }),
    onClose,
  };

  return (
    <>
      {variant === "b" ? (
        <VariantB {...editor} />
      ) : (
        <ViewerDrawer
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
          wide={wide}
          alongside
          title={draft.name || t("New spot", "Nouveau spot")}
          description={
            forecast.isPending
              ? t("Loading the forecast…", "Chargement de la prévision…")
              : t("A spot of your own", "Un spot à toi")
          }
        >
          {variant === "a" ? <VariantA {...editor} /> : <VariantC {...editor} />}
        </ViewerDrawer>
      )}
      <EditorSwitcher current={variant} onVariant={onVariant} />
    </>
  );
}
