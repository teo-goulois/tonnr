import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { readSize } from "@/components/catalogue/words";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Loader } from "@/components/shared/loader";
import type { Publication } from "@/lib/api";
import { formatAgo, formatCount, formatDayAndHour } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, orpc, refreshLists } from "@/utils/orpc";

import { ReasonForm } from "./reason-form";

export type PublicationStatus = Publication["status"];

const linked = "focus-ring rounded-xs underline underline-offset-2 hover:text-neutral-10";

// What its owner says a spot is like, each list under the name of what it speaks of.
const SAID: { key: keyof Publication["spot"]["characteristics"]; label: () => string }[] = [
  { key: "breakTypes", label: m.moderation_said_break },
  { key: "waveDirections", label: m.moderation_said_wave },
  { key: "bottomTypes", label: m.moderation_said_bottom },
  { key: "abilityLevels", label: m.moderation_said_ability },
  { key: "boardTypes", label: m.moderation_said_boards },
  { key: "bestSeasons", label: m.moderation_said_seasons },
  { key: "bestTides", label: m.moderation_said_tides },
  { key: "bestSwellDirections", label: m.moderation_said_swell },
  { key: "bestWindDirections", label: m.moderation_said_wind },
  { key: "sizeFactors", label: m.moderation_said_size_factor },
  { key: "offshoreDirectionDegrees", label: m.moderation_said_offshore },
  { key: "waveSizeMeters", label: m.catalogue_size },
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-xxs">
      <dt className="text-s text-neutral-7">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

// The place on OpenStreetMap, to see where the marker stands.
function mapOf({ latitude, longitude }: { latitude: number; longitude: number }) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

type RequestProps = {
  publication: Publication;
  now: number;
  onAccept: () => void;
  onRefuse: () => void;
};

/** One request: the spot as it is now, what its owner says, and what helps to answer. */
function Request({ publication, now, onAccept, onRefuse }: RequestProps) {
  const { spot } = publication;
  const said = SAID.flatMap(({ key, label }) => {
    const value = spot.characteristics[key];
    if (value === null) return [];
    const read =
      typeof value === "number"
        ? `${value}°`
        : Array.isArray(value)
          ? value.join(", ")
          : readSize(value);
    return [`${label()} : ${read}`];
  });

  return (
    <li className="edge grid gap-m rounded-m p-m [--edge-color:var(--neutral-4)]">
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h2 className="text-m font-medium">{spot.name}</h2>
        <span className="text-s text-neutral-7">
          {publication.status === "pending"
            ? m.moderation_asked({ ago: formatAgo(publication.requestedAt, now) })
            : publication.decidedAt && formatDayAndHour(publication.decidedAt)}
        </span>
      </div>

      <dl className="grid gap-m sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={m.moderation_point()}>
          <a href={mapOf(spot)} target="_blank" rel="noreferrer" className={linked}>
            <span className="tabular-nums">
              {spot.latitude.toFixed(5)}, {spot.longitude.toFixed(5)}
            </span>
          </a>
        </Fact>
        <Fact label={m.moderation_account()}>
          <Link
            to="/accounts/$accountId"
            params={{ accountId: publication.accountId }}
            className={linked}
          >
            {m.moderation_account_open()}
          </Link>
        </Fact>
        <Fact label={m.moderation_note()}>
          {publication.note ?? <span className="text-neutral-7">{m.moderation_none()}</span>}
        </Fact>
        <Fact label={m.moderation_said()}>
          {said.length > 0 ? (
            <ul className="grid gap-xxs">
              {said.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <span className="text-neutral-7">{m.moderation_none()}</span>
          )}
        </Fact>
        <Fact label={m.moderation_catalogue()}>
          {publication.nearbyBreaks.length > 0 ? (
            <ul className="grid gap-xxs">
              {publication.nearbyBreaks.map((found) => (
                <li key={found.id}>
                  {m.moderation_break_near({
                    name: found.name,
                    meters: formatCount(found.meters),
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-neutral-7">{m.moderation_catalogue_none()}</span>
          )}
        </Fact>
        <Fact label={m.moderation_others()}>
          {publication.otherAccountsHere > 0 ? (
            <Badge variant="warning">
              {publication.otherAccountsHere === 1
                ? m.moderation_others_one()
                : m.moderation_others_some({
                    count: formatCount(publication.otherAccountsHere),
                  })}
            </Badge>
          ) : (
            <span className="text-neutral-7">{m.moderation_others_none()}</span>
          )}
        </Fact>
        {publication.status === "refused" && (
          <Fact label={m.moderation_reason()}>{publication.reason}</Fact>
        )}
      </dl>

      {publication.status === "pending" && (
        <div className="flex flex-wrap gap-xs">
          <Button onClick={onAccept}>{m.moderation_accept()}</Button>
          <Button variant="outline" onClick={onRefuse}>
            {m.moderation_refuse()}
          </Button>
        </div>
      )}
    </li>
  );
}

export type ModerationKind = "spots" | "guides" | "reports";

type ModerationPageProps = {
  kind: ModerationKind;
  onKindChange: (kind: ModerationKind) => void;
  // How many of each kind wait for the operator.
  waiting: Record<ModerationKind, number>;
  // What the kind in view shows.
  children: ReactNode;
};

/**
 * What users ask the instance to show to everyone, for an operator to answer: the spots their
 * owners asked to make public, what accounts wrote of the breaks, and the photos and videos of
 * the waves they sent from them.
 */
export function ModerationPage({ kind, onKindChange, waiting, children }: ModerationPageProps) {
  const counted = (count: number) =>
    count > 0 && (
      <Badge variant="warning" className="ml-xs tabular-nums">
        <span className="sr-only">{m.moderation_waiting()}</span>
        {count}
      </Badge>
    );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h1 className="text-l font-medium">{m.nav_moderation()}</h1>
        <Tabs value={kind} onValueChange={(value) => onKindChange(value as ModerationKind)}>
          <TabsList aria-label={m.moderation_kind()}>
            <TabsTab value="spots">
              {m.moderation_kind_spots()}
              {counted(waiting.spots)}
            </TabsTab>
            <TabsTab value="guides">
              {m.moderation_kind_guides()}
              {counted(waiting.guides)}
            </TabsTab>
            <TabsTab value="reports">
              {m.moderation_kind_reports()}
              {counted(waiting.reports)}
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>
      {children}
    </>
  );
}

type SpotRequestsProps = {
  status: PublicationStatus;
  onStatusChange: (status: PublicationStatus) => void;
  // Undefined while the requests load.
  publications: Publication[] | undefined;
  now: number;
};

/**
 * The spots their owners asked to make public, for an operator to accept into the catalogue or
 * to refuse. Decision 034.
 */
export function SpotRequests({ status, onStatusChange, publications, now }: SpotRequestsProps) {
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState<Publication | null>(null);
  const [refusing, setRefusing] = useState<Publication | null>(null);

  const answered = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.v1.publications.key() }),
      refreshLists(queryClient),
    ]);
  const accept = useMutation({
    mutationFn: (one: Publication) =>
      client.v1.publications.accept({ id: one.id, spotUpdatedAt: one.spot.updatedAt }),
    onSuccess: async (done) => {
      toast.success(m.moderation_accepted({ name: done.spot.name }));
      await answered();
    },
    onError: async (error) => {
      toast.error(error.message);
      // The spot changed, or the request was answered elsewhere: it is read again.
      await answered();
    },
  });
  const refuse = useMutation({
    mutationFn: ({ one, reason }: { one: Publication; reason: string }) =>
      client.v1.publications.refuse({ id: one.id, reason }),
    onSuccess: async (done) => {
      toast.success(m.moderation_refused({ name: done.spot.name }));
      setRefusing(null);
      await answered();
    },
    onError: (error) => toast.error(error.message),
  });

  const empty =
    status === "pending"
      ? m.moderation_empty()
      : status === "accepted"
        ? m.moderation_empty_accepted()
        : m.moderation_empty_refused();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-s">
        <p className="max-w-(--container-3xl) text-neutral-7">{m.moderation_intro()}</p>
        <Tabs value={status} onValueChange={(value) => onStatusChange(value as PublicationStatus)}>
          <TabsList variant="segment" aria-label={m.moderation_status()}>
            <TabsTab value="pending">{m.moderation_pending()}</TabsTab>
            <TabsTab value="accepted">{m.moderation_accepted_tab()}</TabsTab>
            <TabsTab value="refused">{m.moderation_refused_tab()}</TabsTab>
          </TabsList>
        </Tabs>
      </div>

      {!publications ? (
        <Loader />
      ) : publications.length === 0 ? (
        <p className="text-neutral-7">{empty}</p>
      ) : (
        <ul className="grid gap-m">
          {publications.map((publication) => (
            <Request
              key={publication.id}
              publication={publication}
              now={now}
              onAccept={() => setAccepting(publication)}
              onRefuse={() => setRefusing(publication)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={accepting !== null}
        onOpenChange={(open) => !open && setAccepting(null)}
        title={m.moderation_accept_title({ name: accepting?.spot.name ?? "" })}
        body={m.moderation_accept_body()}
        confirmLabel={m.moderation_accept()}
        onConfirm={() => (accepting ? accept.mutateAsync(accepting) : Promise.resolve())}
      />

      <Dialog open={refusing !== null} onOpenChange={(open) => !open && setRefusing(null)}>
        <DialogPopup className="w-full max-w-md gap-l p-l">
          <div className="grid gap-xs">
            <DialogTitle>
              {m.moderation_refuse_title({ name: refusing?.spot.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{m.moderation_refuse_body()}</DialogDescription>
          </div>
          <ReasonForm
            isPending={refuse.isPending}
            onRefuse={(reason) =>
              refusing ? refuse.mutateAsync({ one: refusing, reason }) : Promise.resolve()
            }
            onCancel={() => setRefusing(null)}
          />
        </DialogPopup>
      </Dialog>
    </>
  );
}
