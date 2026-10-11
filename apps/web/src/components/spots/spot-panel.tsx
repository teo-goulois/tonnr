import { Button } from "@repo/ui/components/ui/button";
import { TrashIcon } from "@repo/ui/icon";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { AlertEditor } from "../alerts/alert-editor";
import type { Alerting } from "../alerts/types";
import { Details, type DetailsTab } from "../viewer/details/details";
import type { Nearby } from "../viewer/details/parts";
import { type PointConditionsProps, Sources } from "../viewer/point-conditions";
import type { Loadable, Spot } from "../viewer/types";
import { type SpotDescription, SpotGuide } from "./spot-guide";

type SpotPanelProps = PointConditionsProps & {
  spot: Loadable<Spot>;
  // The buoy the sea is read on at this spot, and how to open its panel over this one.
  nearby?: Nearby;
  onOpenBuoy?: (stationId: string) => void;
  // True for a spot that was just added: its owner is offered to describe it, once.
  isNew: boolean;
  onOfferSeen: () => void;
  // The owner says what the spot is like. `done` is called once it is saved.
  isDescribing: boolean;
  onDescribe: (spot: Spot, said: SpotDescription, done: () => void) => void;
  // The user's spots, for the neighbours an alert may hold, and their alerts.
  spots: Spot[];
  alerting: Alerting;
  // Counts the times the spot's alert was asked for from elsewhere: its tab then comes in view,
  // on a panel that is already open as on one that opens.
  alertAsked: number;
};

/** The week and the tide at a spot of the user's own, and what they say of it. */
export function SpotPanel({
  now,
  spot,
  forecast,
  tides,
  extremes,
  onTideExtend,
  nearby,
  onOpenBuoy,
  isNew,
  onOfferSeen,
  isDescribing,
  onDescribe,
  spots,
  alerting,
  alertAsked,
}: SpotPanelProps) {
  const [tab, setTab] = useState<DetailsTab>(alertAsked > 0 ? "alert" : "forecast");
  useEffect(() => {
    if (alertAsked > 0) setTab("alert");
  }, [alertAsked]);
  const [isEditing, setIsEditing] = useState(false);
  // A spot that was just added is offered an alert once the offer to describe it is answered.
  const [offersAlert, setOffersAlert] = useState(false);
  const [isSettingAlert, setIsSettingAlert] = useState(false);
  // Whether the spot was new when this panel opened: the route forgets it with the first offer.
  const isNewHere = useRef(isNew);
  // Describing the spot answers the offer to, wherever it was started from.
  const edit = (editing: boolean) => {
    setIsEditing(editing);
    if (editing) onOfferSeen();
    else if (isNewHere.current) setOffersAlert(true);
  };
  // The same credits from one render to the next: the forecast is drawn again when what it
  // shows changes, and not when the tab beside it does.
  const footer = useMemo(
    () => <Sources origin={null} license={null} forecast={forecast.data} tides={tides.data} />,
    [forecast.data, tides.data],
  );

  // A spot that was deleted, or that is someone else's and private.
  if (spot.isError) return <p className="text-s text-neutral-7">{m.spot_not_found()}</p>;

  const found = spot.data;
  const alert = alerting.alerts.data?.find((one) => found && one.spotIds.includes(found.id));
  return (
    <div className="grid gap-m">
      {/* A spot is saved with a point and a name. The rest is offered, and may wait. */}
      {isNew && found?.isOwner && !isEditing && (
        <div className="edge grid justify-items-start gap-xs rounded-(--radius-s) p-s [--edge-color:var(--neutral-4)]">
          <p className="text-s">{m.spot_new_describe()}</p>
          <div className="flex flex-wrap gap-xs">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setTab("guide");
                edit(true);
              }}
            >
              {m.spot_guide_describe()}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onOfferSeen();
                setOffersAlert(true);
              }}
            >
              {m.spot_later()}
            </Button>
          </div>
        </div>
      )}
      {offersAlert && found?.isOwner && !alert && !isEditing && !isSettingAlert && (
        <div className="edge grid justify-items-start gap-xs rounded-(--radius-s) p-s [--edge-color:var(--neutral-4)]">
          <p className="text-s">{m.alert_offer()}</p>
          <div className="flex flex-wrap gap-xs">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setTab("alert");
                setIsSettingAlert(true);
              }}
            >
              {m.alert_create()}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOffersAlert(false)}>
              {m.spot_later()}
            </Button>
          </div>
        </div>
      )}
      <Details
        spot={found}
        now={now}
        forecast={forecast}
        tides={tides}
        extremes={extremes}
        onTideExtend={onTideExtend}
        nearby={nearby}
        onOpenStation={onOpenBuoy}
        tab={tab}
        onTabChange={setTab}
        guide={
          found && (
            <SpotGuide
              spot={found}
              isEditing={isEditing}
              onEditingChange={edit}
              isSaving={isDescribing}
              onSave={(said) => onDescribe(found, said, () => edit(false))}
            />
          )
        }
        alert={
          found?.isOwner &&
          // No alert is offered before the account's alerts are known: one that came late
          // would take the place of what was being written.
          (alerting.alerts.data ? (
            <AlertEditor
              now={now}
              spot={found}
              spots={spots}
              alert={alert}
              opened={isSettingAlert}
              zone={alerting.settings.data?.zone ?? undefined}
              preview={alerting.preview}
              onTry={alerting.onTry}
              isSaving={alerting.isSaving}
              onSave={(draft, changed) => alerting.onSave(alert, draft, changed)}
              isDeleting={alerting.isDeleting}
              onDelete={alerting.onDelete}
            />
          ) : alerting.alerts.isError ? (
            <p className="text-s text-neutral-7">{m.alerts_mine_load_failed()}</p>
          ) : (
            <div className="grid gap-s">
              <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
              <Skeleton className="h-(--line-m) w-4/5 rounded-(--radius-xs)" />
            </div>
          ))
        }
        // The spot is its owner's: only the forecast and the tide have a source to credit.
        footer={footer}
      />
    </div>
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
