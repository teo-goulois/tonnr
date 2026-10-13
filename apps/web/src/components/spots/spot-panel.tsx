import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { answerLeaving, leaveWith } from "@/lib/unsaved";
import { m } from "@/paraglide/messages.js";

import { AlertEditor } from "../alerts/alert-editor";
import { type Written, isOpenAlert } from "../alerts/alert-words";
import { SpotAlerts } from "../alerts/spot-alerts";
import { tideAhead } from "../alerts/tide-band";
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
  // Counts the times an alert of the spot was asked for from elsewhere, and which: the tab of
  // the alerts then comes in view with that one open, on a panel that is already open as on
  // one that opens. `isNew` asks for a new one, which is begun once: `onAlertBegun` says so.
  alertAsked: { count: number; alertId?: string; isNew?: boolean };
  onAlertBegun?: () => void;
  // The sessions the owner surfed there, for the last tab. It is given what begins an alert
  // with the conditions they liked: decision 043.
  sessions?: (onAlert: (criteria: AlertCriteria) => void) => ReactNode;
};

// The alert that is being written in the panel. `key` stays the same from a new alert to the
// alert it is saved as, so that what is written meanwhile is kept.
type Writing = Written & { key: number };

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
  onAlertBegun,
  sessions,
}: SpotPanelProps) {
  const [tab, setTab] = useState<DetailsTab>(alertAsked.count > 0 ? "alert" : "forecast");
  // The tab of the alerts lists the spot's alerts, until one is opened or begun.
  const [writing, setWriting] = useState<Writing | null>(
    alertAsked.count > 0 && alertAsked.alertId ? { key: 0, alertId: alertAsked.alertId } : null,
  );
  const written = useRef(0);
  const go = (to: Written | null) => {
    if (to) {
      written.current += 1;
      setWriting({ ...to, key: written.current });
    } else {
      setWriting(null);
    }
  };
  // Writes something else, or goes back to the list: at once when nothing would be lost, and
  // once its user has said so otherwise. The alert that is open stays as it is when it is the
  // one asked for, and a question that was asked about leaving it no longer stands.
  const leave = (to: Written | null) => {
    setTab("alert");
    if (isOpenAlert(writing, to)) answerLeaving("stay");
    else leaveWith(() => go(to));
  };
  const leaver = useRef(leave);
  leaver.current = leave;
  const asked = useRef(alertAsked.count);
  useEffect(() => {
    // Asked again since the panel opened: what it opened on is already there.
    if (alertAsked.count === asked.current) return;
    asked.current = alertAsked.count;
    setTab("alert");
    if (alertAsked.alertId) leaver.current({ alertId: alertAsked.alertId });
  }, [alertAsked.count, alertAsked.alertId]);
  // The spot and the alerts it is in, the oldest first, as the list gives them.
  const found = spot.data;
  const own = alerting.alerts.data?.filter((one) => found && one.spotIds.includes(found.id)) ?? [];
  // A new alert of the spot: the first is named after it by its editor, and another after the
  // spot and its rank among the spot's alerts.
  const another = (): Written =>
    !found || own.length === 0
      ? {}
      : {
          initial: {
            name: m.alert_name_another({ spot: found.name, count: own.length + 1 }),
            criteria: {},
            enabled: true,
            shortestMinutes: 120,
            spotIds: [found.id],
          },
        };
  const next = useRef(another);
  next.current = another;
  // A new alert that was asked for from elsewhere is begun once the spot and its alerts are
  // known, since its name follows how many the spot has, and whoever asked is told that it is.
  const begins =
    alertAsked.isNew === true && found?.isOwner === true && alerting.alerts.data !== undefined;
  const begun = useRef(onAlertBegun);
  begun.current = onAlertBegun;
  useEffect(() => {
    if (!begins) return;
    begun.current?.();
    leaver.current(next.current());
  }, [begins, alertAsked.count]);
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
            <Button size="sm" variant="secondary" onClick={() => leave({})}>
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
                  return alerting.onSave(alert, draft, changed, byMail).then((saved) => {
                    // A new alert that is saved is the one that is written from then on, unless
                    // the panel has moved on to something else meanwhile.
                    if (saved && !alert) {
                      setWriting((current) =>
                        current?.key === key ? { key, alertId: saved.id } : current,
                      );
                    }
                    return saved;
                  });
                }}
                isDeleting={alerting.isDeleting}
                onDelete={alerting.onDelete}
                onCopy={(draft) =>
                  leave({ initial: { ...draft, name: m.alert_copy_name({ name: draft.name }) } })
                }
                onClose={() => leave(null)}
              />
            ) : (
              <SpotAlerts
                spot={found}
                spots={spots}
                alerts={own}
                onOpen={(one) => leave({ alertId: one.id })}
                onNew={() => leave(another())}
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
        sessions={
          found?.isOwner &&
          sessions?.((criteria) =>
            // An alert of what was liked there, named after the spot, to be looked over before
            // it is saved.
            leave({
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
