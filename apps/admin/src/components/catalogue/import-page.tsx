import { Badge } from "@repo/ui/components/ui/badge";
import { fold } from "@repo/config/names";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { cn } from "@repo/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Loader } from "@/components/shared/loader";
import type { CandidatePage, CandidateStatus } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { CandidateDesk } from "./candidate-desk";

export const CANDIDATE_STATES = ["waiting", "later", "added", "merged", "ignored"] as const;

const STATE_LABELS: Record<CandidateStatus, () => string> = {
  waiting: m.catalogue_queue_waiting,
  later: m.catalogue_queue_later,
  added: m.catalogue_queue_added,
  merged: m.catalogue_queue_merged,
  ignored: m.catalogue_queue_ignored,
};

const ACTION_LABELS = {
  add: m.catalogue_action_add,
  merge: m.catalogue_action_merge,
  hold: m.catalogue_action_hold,
};

type ImportPageProps = {
  candidateId: string | undefined;
  status: CandidateStatus;
  region: string | undefined;
  onOpen: (id: string | undefined, replace?: boolean) => void;
  onStatusChange: (status: CandidateStatus) => void;
  onRegionChange: (region: string | undefined) => void;
};

/**
 * The breaks lists propose to the catalogue, one at a time: the queue in one state and one
 * region, and the candidate in view, which the operator adds, merges, puts off or leaves out.
 */
export function ImportPage({
  candidateId,
  status,
  region,
  onOpen,
  onStatusChange,
  onRegionChange,
}: ImportPageProps) {
  const queryClient = useQueryClient();
  const queue = useQuery(orpc.v1.candidates.list.queryOptions({ input: { status, region } }));
  const breaks = useQuery(orpc.v1.catalogue.map.queryOptions({ staleTime: 5 * 60 * 1000 }));
  const page = useQuery(
    orpc.v1.candidates.get.queryOptions({
      input: { id: candidateId ?? "" },
      enabled: candidateId !== undefined,
      meta: { quietWhenMissing: true },
    }),
  );

  // What is typed in the search: the queue shows the candidates whose name or places hold it,
  // whatever its case and its marks.
  const [query, setQuery] = useState("");
  const typed = fold(query.trim());
  const listed = (queue.data?.candidates ?? []).filter(
    (one) =>
      typed === "" ||
      fold(one.name).includes(typed) ||
      (one.location ?? []).some((place) => fold(place).includes(typed)),
  );
  const [isQueueShown, setQueueShown] = useState(false);
  // The first of the queue, when none is asked for.
  const first = listed[0]?.id;
  useEffect(() => {
    if (candidateId === undefined && first) onOpen(first, true);
  }, [candidateId, first]);

  const at = listed.findIndex((one) => one.id === candidateId);
  const previousId = at > 0 ? listed[at - 1]?.id : undefined;
  const nextId = at >= 0 ? listed[at + 1]?.id : listed[0]?.id;

  const decided = (next: CandidatePage) => {
    queryClient.setQueryData(
      orpc.v1.candidates.get.queryKey({ input: { id: next.candidate.id } }),
      next,
    );
    // The next of the queue as it was read, or the one the API says waits after it, at once:
    // the lists are read again behind it.
    onOpen(nextId ?? next.next ?? undefined);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.v1.candidates.list.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.catalogue.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.actions.key() }),
    ]);
  };

  const counts = queue.data?.counts;

  return (
    <div className="grid gap-m">
      <div className="flex flex-wrap items-center gap-s">
        <ToggleGroup
          size="sm"
          variant="outline"
          aria-label={m.catalogue_queue_state()}
          value={[status]}
          onValueChange={(chosen) => {
            const [next] = chosen as CandidateStatus[];
            if (next) onStatusChange(next);
          }}
        >
          {CANDIDATE_STATES.map((state) => (
            <ToggleGroupItem key={state} value={state}>
              {STATE_LABELS[state]()}
              {counts && (
                <span className="tabular-nums opacity-70">{formatCount(counts[state])}</span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {queue.data && queue.data.regions.length > 1 && (
          <ToggleGroup
            size="sm"
            variant="default"
            aria-label={m.catalogue_queue_region()}
            value={[region ?? ""]}
            onValueChange={(chosen) => {
              const [next] = chosen as string[];
              onRegionChange(next === "" ? undefined : next);
            }}
          >
            <ToggleGroupItem value="">{m.catalogue_queue_everywhere()}</ToggleGroupItem>
            {queue.data.regions.map((one) => (
              <ToggleGroupItem key={one.name} value={one.name}>
                {one.name}
                <span className="tabular-nums opacity-70">{formatCount(one.total)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      <div className="grid gap-l lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* A phone shows the candidate in view, and the queue when asked: it is long. */}
        <Button
          variant="outline"
          className="justify-self-start lg:hidden"
          aria-expanded={isQueueShown}
          onClick={() => setQueueShown(!isQueueShown)}
        >
          {isQueueShown
            ? m.catalogue_queue_hide()
            : m.catalogue_queue_show({ count: formatCount(listed.length) })}
        </Button>
        <nav
          aria-label={m.catalogue_queue()}
          className={cn(
            "grid content-start gap-xxs lg:-mx-xs lg:-mt-xs lg:max-h-[calc(100svh-14rem)] lg:overflow-y-auto lg:px-xs lg:pt-xs",
            !isQueueShown && candidateId && "max-lg:hidden",
          )}
        >
          <Input
            type="search"
            className="mb-xs"
            aria-label={m.catalogue_queue_search()}
            placeholder={m.catalogue_queue_search()}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {queue.isPending ? (
            <Loader />
          ) : listed.length === 0 ? (
            <p className="text-neutral-7">
              {typed === "" ? m.catalogue_queue_empty() : m.catalogue_queue_none_found()}
            </p>
          ) : (
            listed.map((one) => (
              <button
                key={one.id}
                type="button"
                aria-current={one.id === candidateId || undefined}
                onClick={() => {
                  onOpen(one.id);
                  setQueueShown(false);
                }}
                className={cn(
                  "focus-ring grid gap-xxs rounded-xs px-xs py-xs text-left",
                  "hover:bg-neutral-3 aria-[current]:bg-neutral-3",
                )}
              >
                <span className="font-medium">{one.name}</span>
                <span className="flex flex-wrap items-center gap-xs text-s text-neutral-7">
                  {one.location?.at(-1)}
                  {one.action && (
                    <Badge variant={one.action === "hold" ? "warning" : "neutral"}>
                      {ACTION_LABELS[one.action]()}
                    </Badge>
                  )}
                </span>
              </button>
            ))
          )}
        </nav>

        <div className="min-w-0">
          {page.data && breaks.data ? (
            <CandidateDesk
              key={`${page.data.candidate.id}:${page.data.candidate.updatedAt.getTime()}`}
              page={page.data}
              breaks={breaks.data.breaks}
              previousId={previousId}
              nextId={nextId}
              onOpen={onOpen}
              onDecided={decided}
            />
          ) : candidateId && (page.isPending || breaks.isPending) ? (
            <Loader />
          ) : (
            listed.length === 0 && <p className="text-neutral-7">{m.catalogue_queue_done()}</p>
          )}
        </div>
      </div>
    </div>
  );
}
