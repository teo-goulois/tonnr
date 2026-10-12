import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { AlertEditor } from "../alerts/alert-editor";
import type { AlertDraft } from "../alerts/alert-words";
import { SpotAlerts } from "../alerts/spot-alerts";
import { tideAhead } from "../alerts/tide-band";
import type { Alerting } from "../alerts/types";
import { Details, type DetailsTab } from "../viewer/details/details";
import type { Nearby, NearbyWind } from "../viewer/details/parts";
import { type PointConditionsProps, Sources } from "../viewer/point-conditions";
import type { Loadable, Spot } from "../viewer/types";
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
  // Counts the times an alert of the spot was asked for from elsewhere, and which: the tab of
  // the alerts then comes in view with that one open, on a panel that is already open as on
  // one that opens.
  alertAsked: { count: number; alertId?: string };
};

// The alert that is being written in the panel: one that is saved, or a new one, which may
// start from a copy. `key` stays the same from a new alert to the alert it is saved as, so that
// what is written meanwhile is kept.
type Writing = { key: number; alertId?: string; initial?: AlertDraft };

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
}: SpotPanelProps) {
  const [tab, setTab] = useState<DetailsTab>(alertAsked.count > 0 ? "alert" : "forecast");
  // The tab of the alerts lists the spot's alerts, until one is opened or begun.
  const [writing, setWriting] = useState<Writing | null>(
    alertAsked.count > 0 && alertAsked.alertId ? { key: 0, alertId: alertAsked.alertId } : null,
  );
  const written = useRef(0);
  const write = (what: Omit<Writing, "key">) => {
    written.current += 1;
    setWriting({ ...what, key: written.current });
    setTab("alert");
  };
  const writer = useRef(write);
  writer.current = write;
  useEffect(() => {
    if (alertAsked.count === 0) return;
    setTab("alert");
    if (alertAsked.alertId) writer.current({ alertId: alertAsked.alertId });
  }, [alertAsked.count, alertAsked.alertId]);
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

  // The tide at the spot over the two days ahead, for the editor of an alert to draw beside
  // what is asked of the tide.
  const timeline = tides.data?.timeline;
  const tide = useMemo(
    () =>
      tideAhead(
        (timeline ?? []).map((entry) => ({ time: entry.time, value: entry.heightMeters })),
        now,
      ),
    [timeline, now],
  );

  // A spot that was deleted, or that is someone else's and private.
  if (spot.isError) return <p className="text-s text-neutral-7">{m.spot_not_found()}</p>;

  const found = spot.data;
  // The alerts the spot is in, the oldest first, as the list gives them.
  const own = alerting.alerts.data?.filter((one) => found && one.spotIds.includes(found.id)) ?? [];
  const alert = writing?.alertId ? own.find((one) => one.id === writing.alertId) : undefined;
  // An alert that was deleted, here or elsewhere, or that left the spot, is no longer written.
  const isGone = writing?.alertId !== undefined && alerting.alerts.data !== undefined && !alert;
  const shown = isGone ? null : writing;
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
      {offersAlert && found?.isOwner && own.length === 0 && !isEditing && !shown && (
        <div className="edge grid justify-items-start gap-xs rounded-(--radius-s) p-s [--edge-color:var(--neutral-4)]">
          <p className="text-s">{m.alert_offer()}</p>
          <div className="flex flex-wrap gap-xs">
            <Button size="sm" variant="secondary" onClick={() => write({})}>
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
          // No alert is listed or offered before the account's alerts are known: one that came
          // late would take the place of what was being written. Nor is a first one written
          // before its settings are: they say whether it is asked about mail, with that alert.
          (alerting.alerts.data && (own.length > 0 || alerting.settings.data) ? (
            shown ? (
              <AlertEditor
                key={shown.key}
                now={now}
                spot={found}
                spots={spots}
                alert={alert}
                initial={shown.initial}
                tide={tide}
                zone={alerting.settings.data?.zone ?? undefined}
                preview={alerting.preview}
                onTry={alerting.onTry}
                isSaving={alerting.isSaving}
                // Asked once, as an alert is made, of an account that never answered, on an
                // instance that sends mail.
                asksMail={
                  !alert &&
                  alerting.settings.data?.byMail === null &&
                  alerting.settings.data.mail !== "off"
                }
                mailWaits={alerting.settings.data?.mail === "unchecked"}
                onSave={(draft, changed, byMail) => {
                  const { key } = shown;
                  void alerting.onSave(alert, draft, changed, byMail).then((saved) => {
                    // A new alert that is saved is the one that is written from then on, unless
                    // the panel has moved on to something else meanwhile.
                    if (!saved || alert) return;
                    setWriting((current) =>
                      current?.key === key ? { key, alertId: saved.id } : current,
                    );
                  });
                }}
                isDeleting={alerting.isDeleting}
                onDelete={alerting.onDelete}
                onCopy={(draft) =>
                  write({ initial: { ...draft, name: m.alert_copy_name({ name: draft.name }) } })
                }
                onClose={() => setWriting(null)}
              />
            ) : (
              <SpotAlerts
                spot={found}
                spots={spots}
                alerts={own}
                onOpen={(one) => write({ alertId: one.id })}
                // A second alert on a spot is not named as the first: the spot's name, and its
                // rank among the spot's alerts.
                onNew={() =>
                  write(
                    own.length === 0
                      ? {}
                      : {
                          initial: {
                            name: m.alert_name_another({
                              spot: found.name,
                              count: own.length + 1,
                            }),
                            criteria: {},
                            enabled: true,
                            shortestMinutes: 120,
                            spotIds: [found.id],
                          },
                        },
                  )
                }
                switching={alerting.switching}
                onSwitch={alerting.onSwitch}
              />
            )
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
        // The spot is its owner's: only the forecast and the tide have a source to credit.
        footer={footer}
      />
    </div>
  );
}
