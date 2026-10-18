import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Loader } from "@/components/shared/loader";
import type { BreakPage, OperatorBreak } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, orpc } from "@/utils/orpc";

import { type Choices, fillBlanks, MergeChoices, mergedValues } from "./merge-choices";

type MergeDialogProps = {
  // The break in view, and the one the operator chose to merge with it.
  current: BreakPage;
  otherId: string;
  onClose: () => void;
  // The break that stays, once merged.
  onMerged: (page: BreakPage) => void;
};

const sourceOf = (found: OperatorBreak) =>
  [found.source.provider, found.source.ref].filter(Boolean).join(" · ") || m.catalogue_no_source();

/** Merges two breaks into one, after the operator chose which stays and what it keeps. */
export function MergeDialog({ current, otherId, onClose, onMerged }: MergeDialogProps) {
  const other = useQuery(orpc.v1.catalogue.get.queryOptions({ input: { id: otherId } }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="w-full max-w-3xl gap-l p-l">
        <div className="grid gap-xs">
          <DialogTitle>{m.catalogue_merge_title()}</DialogTitle>
          <DialogDescription>{m.catalogue_merge_body()}</DialogDescription>
        </div>
        {other.data ? (
          <Choosing first={current} second={other.data} onClose={onClose} onMerged={onMerged} />
        ) : (
          <Loader />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function Choosing({
  first,
  second,
  onClose,
  onMerged,
}: {
  first: BreakPage;
  second: BreakPage;
  onClose: () => void;
  onMerged: (page: BreakPage) => void;
}) {
  // A break that accounts wrote in the guide of stays: the API would refuse to take it away.
  const [keptId, setKeptId] = useState(
    second.uses.contributions + second.uses.publications > 0 ? second.break.id : first.break.id,
  );
  const kept = keptId === first.break.id ? first.break : second.break;
  const gone = keptId === first.break.id ? second.break : first.break;
  const goneUses = keptId === first.break.id ? second.uses : first.uses;
  const [choices, setChoices] = useState<Choices>(() => fillBlanks(kept, gone));
  // The source that says a licence is kept, so that the break still says it.
  const [sourceFrom, setSourceFrom] = useState<"kept" | "merged">(
    !kept.source.license && gone.source.license ? "merged" : "kept",
  );
  const swap = () => {
    setKeptId(gone.id);
    setChoices(fillBlanks(gone, kept));
    setSourceFrom(!gone.source.license && kept.source.license ? "merged" : "kept");
  };

  const merge = useMutation({
    mutationFn: () =>
      client.v1.catalogue.merge({
        id: kept.id,
        updatedAt: kept.updatedAt,
        mergeId: gone.id,
        mergeUpdatedAt: gone.updatedAt,
        values: mergedValues(kept, gone, choices),
        sourceOf: sourceFrom,
      }),
    onSuccess: (page) => {
      toast.success(m.catalogue_merged({ name: page.break.name }));
      onMerged(page);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <div className="grid gap-s sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="grid gap-xxs">
          <span className="text-s text-neutral-7">{m.catalogue_merge_stays()}</span>
          <span className="font-medium">{kept.name}</span>
          <span className="text-s text-neutral-7">{sourceOf(kept)}</span>
        </div>
        <Button variant="outline" size="sm" onClick={swap}>
          {m.catalogue_merge_swap()}
        </Button>
        <div className="grid gap-xxs">
          <span className="text-s text-neutral-7">{m.catalogue_merge_goes()}</span>
          <span className="font-medium">{gone.name}</span>
          <span className="text-s text-neutral-7">{sourceOf(gone)}</span>
        </div>
      </div>

      <div className="-mx-xs max-h-[50svh] overflow-y-auto px-xs py-xs">
        <MergeChoices
          kept={kept}
          other={gone}
          keptLabel={kept.name}
          otherLabel={gone.name}
          choices={choices}
          onChange={setChoices}
          confirmed={kept.confirmed}
        />
      </div>

      {sourceOf(kept) !== sourceOf(gone) && (
        <fieldset className="grid gap-xxs">
          <legend className="mb-xxs font-medium">{m.catalogue_merge_source()}</legend>
          <ToggleGroup
            size="sm"
            variant="outline"
            value={[sourceFrom]}
            onValueChange={(chosen) => {
              const [next] = chosen as ("kept" | "merged")[];
              if (next) setSourceFrom(next);
            }}
          >
            <ToggleGroupItem value="kept">{sourceOf(kept)}</ToggleGroupItem>
            <ToggleGroupItem value="merged">{sourceOf(gone)}</ToggleGroupItem>
          </ToggleGroup>
        </fieldset>
      )}

      {goneUses.spots + goneUses.lists + goneUses.sessions > 0 && (
        <p className="text-s text-neutral-7">
          {m.catalogue_merge_moves({
            name: gone.name,
            spots: formatCount(goneUses.spots),
            lists: formatCount(goneUses.lists),
            sessions: formatCount(goneUses.sessions),
          })}
        </p>
      )}

      <div className="flex justify-end gap-xs">
        <Button variant="ghost" onClick={onClose}>
          {m.cancel()}
        </Button>
        <Button isPending={merge.isPending} onClick={() => merge.mutate()}>
          {m.catalogue_merge_confirm()}
        </Button>
      </div>
    </>
  );
}
