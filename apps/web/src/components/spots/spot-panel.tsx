import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { m } from "@/paraglide/messages.js";

import type { Written } from "../alerts/alert-words";
import { SpotAlerts } from "../alerts/spot-alerts";
import type { Alerting } from "../alerts/types";
import { Details, type DetailsTab } from "../viewer/details/details";
import type { Nearby, NearbyWind } from "../viewer/details/parts";
import { type PointConditionsProps, Sources } from "../viewer/point-conditions";
import type { AlertCriteria, Loadable, Spot } from "../viewer/types";
import { type SpotDescription, SpotGuide } from "./spot-guide";

type SpotPanelProps = PointConditionsProps & {
  spot: Loadable<Spot>;
  // The buoy the sea is read on at this spot, and how to open its panel over this one.
  nearby?: Nearby;
  nearbyWind?: NearbyWind;
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
  // Counts the times an alert of the spot was asked for from elsewhere: the tab of the alerts
  // then comes in view, on a panel that is already open as on one that opens.
  alertAsked: number;
  // Opens an alert of the spot, or a new one, in the sheet an alert is written in.
  onWriteAlert: (written: Written) => void;
  // The sessions the owner surfed there, for the last tab. It is given what begins an alert
  // with the conditions they liked: decision 043.
  sessions?: (onAlert: (criteria: AlertCriteria) => void) => ReactNode;
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
  nearbyWind,
  onOpenBuoy,
  isNew,
  onOfferSeen,
  isDescribing,
  onDescribe,
  spots,
  alerting,
  alertAsked,
  onWriteAlert,
  sessions,
}: SpotPanelProps) {
  const [tab, setTab] = useState<DetailsTab>(alertAsked > 0 ? "alert" : "forecast");
  const asked = useRef(alertAsked);
  useEffect(() => {
    // Asked again since the panel opened: what it opened on is already there.
    if (alertAsked === asked.current) return;
    asked.current = alertAsked;
    setTab("alert");
  }, [alertAsked]);
  // The spot and the alerts it is in, the oldest first, as the list gives them.
  const found = spot.data;
  const own = alerting.alerts.data?.filter((one) => found && one.spotIds.includes(found.id)) ?? [];
  const [isEditing, setIsEditing] = useState(false);
  // A spot that was just added is offered an alert once the offer to describe it is answered.
  const [offersAlert, setOffersAlert] = useState(false);
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
      {offersAlert && found?.isOwner && own.length === 0 && !isEditing && (
        <div className="edge grid justify-items-start gap-xs rounded-(--radius-s) p-s [--edge-color:var(--neutral-4)]">
          <p className="text-s">{m.alert_offer()}</p>
          <div className="flex flex-wrap gap-xs">
            <Button size="sm" variant="secondary" onClick={() => onWriteAlert({})}>
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
        nearbyWind={nearbyWind}
        offshoreFrom={found?.characteristics?.offshoreDirectionDegrees}
        words={found?.characteristics}
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
          // The spot's alerts are listed once they are known: each opens in the sheet an alert is
          // written in, as a new one does.
          (alerting.alerts.data ? (
            <SpotAlerts
              spot={found}
              spots={spots}
              alerts={own}
              onOpen={(one) => onWriteAlert({ alertId: one.id })}
              onNew={() => onWriteAlert({})}
              switching={alerting.switching}
              onSwitch={alerting.onSwitch}
            />
          ) : alerting.alerts.isError || alerting.settings.isError ? (
            <div className="grid justify-items-start gap-s">
              <p className="text-s text-neutral-7">
                {alerting.alerts.isError
                  ? m.alerts_mine_load_failed()
                  : m.alert_settings_load_failed()}
              </p>
              <Button variant="secondary" onClick={alerting.onRetry}>
                {m.action_retry()}
              </Button>
            </div>
          ) : (
            <div className="grid gap-s">
              <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
              <Skeleton className="h-(--line-m) w-4/5 rounded-(--radius-xs)" />
            </div>
          ))
        }
        sessions={
          found?.isOwner &&
          sessions?.((criteria) =>
            // An alert of what was liked there, named after the spot, to be looked over before
            // it is saved.
            onWriteAlert({
              initial: {
                name: m.sessions_liked_alert_name({ spot: found.name }),
                criteria,
                enabled: true,
                shortestMinutes: 120,
                spotIds: [found.id],
              },
            }),
          )
        }
        // The spot is its owner's: only the forecast and the tide have a source to credit.
        footer={footer}
      />
    </div>
  );
}
