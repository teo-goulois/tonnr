import { fold } from "@repo/config/names";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Loader } from "@/components/shared/loader";
import type { BreakPage, MapBreak } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { client, orpc } from "@/utils/orpc";

import { type BreakDraft, draftOf, type DescriptionLanguage, pointOfDraft } from "./break-fields";
import { BreakPanel } from "./break-panel";
import { CatalogueMap } from "./catalogue-map";
import { MergeDialog } from "./merge-dialog";

export const BREAK_FILTERS = ["all", "unknown", "close"] as const;
export type BreakFilter = (typeof BREAK_FILTERS)[number];

// Two breaks closer than this may be one place told twice.
const CLOSE_METERS = 60;
// What a search shows at most.
const FOUND_MOST = 12;

function meters(one: MapBreak, other: MapBreak) {
  const north = (other.latitude - one.latitude) * 111_000;
  const east =
    (other.longitude - one.longitude) * 111_000 * Math.cos((one.latitude * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** The pairs of breaks closer than `CLOSE_METERS`, the closest first. */
export function closePairs(breaks: MapBreak[]) {
  // Each break goes into a cell of the grid, and is compared with those of the cells around.
  const cell = CLOSE_METERS / 111_000;
  const cells = new Map<string, MapBreak[]>();
  const keyOf = (x: number, y: number) => `${x}:${y}`;
  for (const found of breaks) {
    const key = keyOf(Math.floor(found.longitude / cell), Math.floor(found.latitude / cell));
    cells.set(key, [...(cells.get(key) ?? []), found]);
  }
  const pairs: { one: MapBreak; other: MapBreak; meters: number }[] = [];
  for (const one of breaks) {
    const x = Math.floor(one.longitude / cell);
    const y = Math.floor(one.latitude / cell);
    // The cells of longitude narrow away from the equator: two around are enough to 60°.
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of cells.get(keyOf(x + dx, y + dy)) ?? []) {
          if (other.id <= one.id) continue;
          const apart = meters(one, other);
          if (apart <= CLOSE_METERS) pairs.push({ one, other, meters: Math.round(apart) });
        }
      }
    }
  }
  return pairs.sort((a, b) => a.meters - b.meters);
}

type BreaksPageProps = {
  selectedId: string | undefined;
  filter: BreakFilter;
  onSelect: (id: string | undefined) => void;
  onFilterChange: (filter: BreakFilter) => void;
};

/** Every break of the catalogue on a map, and the one in view, which its operator changes. */
export function BreaksPage({ selectedId, filter, onSelect, onFilterChange }: BreaksPageProps) {
  const queryClient = useQueryClient();
  const all = useQuery(orpc.v1.catalogue.map.queryOptions({ staleTime: 5 * 60 * 1000 }));
  const selected = useQuery(
    orpc.v1.catalogue.get.queryOptions({
      input: { id: selectedId ?? "" },
      enabled: selectedId !== undefined,
      meta: { quietWhenMissing: true },
    }),
  );
  const [query, setQuery] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Where the map looks: it goes to a break chosen from a list, not to one pressed on it.
  const [focus, setFocus] = useState<{
    key: string;
    point: { latitude: number; longitude: number };
  } | null>(null);

  const breaks = all.data?.breaks;
  const pairs = useMemo(() => (breaks ? closePairs(breaks) : []), [breaks]);
  const shown = useMemo(() => {
    if (!breaks) return [];
    if (filter === "unknown") return breaks.filter((found) => !found.known);
    if (filter === "close") {
      const ids = new Set(pairs.flatMap((pair) => [pair.one.id, pair.other.id]));
      return breaks.filter((found) => ids.has(found.id));
    }
    return breaks;
  }, [breaks, filter, pairs]);
  const found = useMemo(() => {
    const typed = fold(query.trim());
    if (typed.length < 2 || !breaks) return [];
    return breaks.filter((one) => fold(one.name).includes(typed)).slice(0, FOUND_MOST);
  }, [breaks, query]);

  // What the operator writes of the break in view, from the version the API gave.
  const page = selected.data;
  const language: DescriptionLanguage = getLocale() === "fr" ? "fr" : "en";
  const [draft, setDraft] = useState<BreakDraft | null>(null);
  const version = page ? `${page.break.id}:${page.break.updatedAt.getTime()}` : "";
  useEffect(() => {
    setDraft(page ? draftOf(page.break, language) : null);
  }, [version]);

  const choose = (id: string) => {
    const one = breaks?.find((candidate) => candidate.id === id);
    if (one) setFocus({ key: `${id}:${Date.now()}`, point: one });
    onSelect(id);
  };
  const refresh = async (next?: BreakPage) => {
    if (next)
      queryClient.setQueryData(
        orpc.v1.catalogue.get.queryKey({ input: { id: next.break.id } }),
        next,
      );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.v1.catalogue.map.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.catalogue.get.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.candidates.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.actions.key() }),
    ]);
  };
  const remove = useMutation({
    mutationFn: (one: BreakPage["break"]) =>
      client.v1.catalogue.remove({ id: one.id, updatedAt: one.updatedAt }),
    onSuccess: async () => {
      toast.success(m.catalogue_deleted({ name: page?.break.name ?? "" }));
      onSelect(undefined);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const marker = draft ? pointOfDraft(draft) : null;

  return (
    <div className="grid gap-m lg:h-[calc(100svh-12rem)] lg:min-h-[36rem] lg:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="h-[50svh] lg:h-full">
        {breaks ? (
          <CatalogueMap
            breaks={shown}
            selectedId={selectedId}
            markedIds={page?.nearby.map((near) => near.id) ?? []}
            marker={marker}
            onMarkerMove={
              draft
                ? (point) =>
                    setDraft({
                      ...draft,
                      latitude: point.latitude.toFixed(5),
                      longitude: point.longitude.toFixed(5),
                    })
                : undefined
            }
            onSelect={onSelect}
            focus={focus}
          />
        ) : (
          <Loader />
        )}
      </div>

      <div className="grid content-start gap-l lg:overflow-y-auto lg:pr-xs">
        <div className="grid gap-s">
          <Input
            type="search"
            value={query}
            placeholder={m.catalogue_search()}
            aria-label={m.catalogue_search()}
            onChange={(event) => setQuery(event.target.value)}
          />
          {found.length > 0 && (
            <ul className="grid gap-xxs">
              {found.map((one) => (
                <li key={one.id}>
                  <button
                    type="button"
                    className="focus-ring w-full rounded-xs px-xs py-xxs text-left hover:bg-neutral-3"
                    onClick={() => {
                      choose(one.id);
                      setQuery("");
                    }}
                  >
                    {one.name}
                    {one.provider && (
                      <span className="text-s text-neutral-7"> · {one.provider}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-xs">
            <ToggleGroup
              size="sm"
              variant="outline"
              aria-label={m.catalogue_filter()}
              value={[filter]}
              onValueChange={(chosen) => {
                const [next] = chosen as BreakFilter[];
                if (next) onFilterChange(next);
              }}
            >
              <ToggleGroupItem value="all">{m.catalogue_filter_all()}</ToggleGroupItem>
              <ToggleGroupItem value="unknown">{m.catalogue_filter_unknown()}</ToggleGroupItem>
              <ToggleGroupItem value="close">{m.catalogue_filter_close()}</ToggleGroupItem>
            </ToggleGroup>
            {breaks && (
              <span className="text-s text-neutral-7 tabular-nums">
                {m.catalogue_count({ count: formatCount(shown.length) })}
              </span>
            )}
          </div>
        </div>

        {page && draft ? (
          <BreakPanel
            key={page.break.id}
            page={page}
            draft={draft}
            onDraftChange={setDraft}
            onSaved={(next) => void refresh(next)}
            onSelect={choose}
            onMerge={setMerging}
            onDelete={() => setDeleting(true)}
          />
        ) : selectedId && selected.isPending ? (
          <Loader />
        ) : filter === "close" ? (
          <section className="grid gap-xs">
            <h2 className="font-medium">{m.catalogue_close_title({ meters: CLOSE_METERS })}</h2>
            {pairs.length > 0 ? (
              <ul className="grid gap-xs">
                {pairs.slice(0, 200).map(({ one, other, meters: apart }) => (
                  <li key={`${one.id}:${other.id}`} className="grid gap-xxs">
                    <span className="flex flex-wrap gap-x-xs">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => choose(one.id)}
                      >
                        {one.name}
                      </Button>
                      <span className="text-neutral-7">·</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => choose(other.id)}
                      >
                        {other.name}
                      </Button>
                    </span>
                    <span className="text-s text-neutral-7">
                      {m.catalogue_meters({ meters: formatCount(apart) })}
                      {" · "}
                      {[one.provider, other.provider].join(" / ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-neutral-7">{m.catalogue_close_none()}</p>
            )}
          </section>
        ) : (
          <p className="text-neutral-7">{m.catalogue_pick()}</p>
        )}
      </div>

      {page && merging && (
        <MergeDialog
          current={page}
          otherId={merging}
          onClose={() => setMerging(null)}
          onMerged={(next) => {
            setMerging(null);
            onSelect(next.break.id);
            void refresh(next);
          }}
        />
      )}
      {page && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={m.catalogue_delete_confirm_title({ name: page.break.name })}
          body={m.catalogue_delete_confirm_body()}
          confirmLabel={m.catalogue_delete()}
          onConfirm={() => remove.mutateAsync(page.break)}
        />
      )}
    </div>
  );
}
