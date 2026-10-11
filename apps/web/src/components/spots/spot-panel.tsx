import { Button } from "@repo/ui/components/ui/button";
import { TrashIcon } from "@repo/ui/icon";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";

import { Details } from "../viewer/details/details";
import type { Nearby } from "../viewer/details/parts";
import { type PointConditionsProps, Sources } from "../viewer/point-conditions";
import type { Loadable, Spot } from "../viewer/types";

type SpotPanelProps = PointConditionsProps & {
  spot: Loadable<Spot>;
  // The buoy the sea is read on at this spot, and how to open its panel over this one.
  nearby?: Nearby;
  onOpenBuoy?: (stationId: string) => void;
};

/** The week and the tide at a spot of the user's own. */
export function SpotPanel({
  now,
  spot,
  forecast,
  tides,
  extremes,
  onTideExtend,
  nearby,
  onOpenBuoy,
}: SpotPanelProps) {
  // A spot that was deleted, or that is someone else's and private.
  if (spot.isError) return <p className="text-s text-neutral-7">{m.spot_not_found()}</p>;

  return (
    <Details
      spot={spot.data}
      now={now}
      forecast={forecast}
      tides={tides}
      extremes={extremes}
      onTideExtend={onTideExtend}
      nearby={nearby}
      onOpenStation={onOpenBuoy}
      // Nothing is written of a spot yet: the tab says so.
      guide={null}
      // The spot is its owner's: only the forecast and the tide have a source to credit.
      footer={<Sources origin={null} license={null} forecast={forecast.data} tides={tides.data} />}
    />
  );
}

/** What the owner of a spot does with it from its panel: delete it, in two presses. */
export function SpotActions({
  name,
  isDeleting,
  onDelete,
}: {
  name: string;
  // True while the API is asked to delete it: it is not asked twice.
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.spot_delete({ name })}
        isPending={isDeleting}
        disabled={isDeleting}
        onClick={() => setIsConfirming(true)}
      >
        <TrashIcon data-slot="icon" aria-hidden />
      </Button>
    );
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setIsConfirming(false)}>
        {m.action_cancel()}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        aria-label={m.spot_delete({ name })}
        onClick={() => {
          setIsConfirming(false);
          onDelete();
        }}
      >
        {m.action_delete()}
      </Button>
    </>
  );
}
