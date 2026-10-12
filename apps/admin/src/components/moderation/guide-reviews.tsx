import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Loader } from "@/components/shared/loader";
import type { Review } from "@/lib/api";
import { formatAgo, formatCount, formatDayAndHour } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { client, orpc, refreshLists } from "@/utils/orpc";

export const REVIEW_QUEUES = ["pending", "contested", "shown", "confirmed", "refused"] as const;
export type ReviewQueue = (typeof REVIEW_QUEUES)[number];

// A reason as the API takes it.
const REASON_MOST = 280;

const linked = "focus-ring rounded-xs underline underline-offset-2 hover:text-neutral-10";

// A line of a guide and how it reads. A line the API gains has to be given its reading here
// before the admin builds.
const LINES: Record<Review["line"], () => string> = {
  breakTypes: m.moderation_said_break,
  waveDirections: m.moderation_said_wave,
  bottomTypes: m.moderation_said_bottom,
  boardTypes: m.moderation_said_boards,
  bestSeasons: m.moderation_said_seasons,
  bestTides: m.moderation_said_tides,
  bestSwellDirections: m.moderation_said_swell,
  bestWindDirections: m.moderation_said_wind,
  access: m.reviews_line_access,
  entry: m.reviews_line_entry,
  hazards: m.reviews_line_hazards,
  rules: m.reviews_line_rules,
};

const QUEUE_NAMES: Record<ReviewQueue, () => string> = {
  pending: m.reviews_pending,
  contested: m.reviews_contested,
  shown: m.reviews_shown,
  confirmed: m.reviews_confirmed,
  refused: m.reviews_refused,
};
const EMPTY: Record<ReviewQueue, () => string> = {
  pending: m.reviews_empty_pending,
  contested: m.reviews_empty_contested,
  shown: m.reviews_empty_shown,
  confirmed: m.reviews_empty_confirmed,
  refused: m.reviews_empty_refused,
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-xxs">
      <dt className="text-s text-neutral-7">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

// The place on OpenStreetMap, to see which break it is.
function mapOf({ latitude, longitude }: { latitude: number; longitude: number }) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

// A value as it was written: the catalogue's words as the API names them, or the text.
function Value({ value }: { value: Review["value"] | null }) {
  if (value === null) return <span className="text-neutral-7">{m.moderation_none()}</span>;
  return Array.isArray(value) ? value.join(", ") : `« ${value} »`;
}

type ContributionProps = {
  review: Review;
  now: number;
  isBusy: boolean;
  onAccept: () => void;
  onKeep: () => void;
  onRefuse: () => void;
};

/** One contribution: its break, what it says of which line, who wrote it, and what was said of it. */
function Contribution({ review, now, isBusy, onAccept, onKeep, onRefuse }: ContributionProps) {
  const place = review.break;
  const contested = review.contests.length > 0;

  return (
    <li className="edge grid gap-m rounded-m p-m [--edge-color:var(--neutral-4)]">
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h2 className="text-m font-medium">
          {place ? (
            <a href={mapOf(place)} target="_blank" rel="noreferrer" className={linked}>
              {place.name}
            </a>
          ) : (
            m.reviews_break_gone()
          )}
          {place?.location && (
            <span className="ml-xs text-s font-normal text-neutral-7">
              {[...place.location].reverse().slice(0, 2).join(", ")}
            </span>
          )}
        </h2>
        <span className="text-s text-neutral-7">
          {review.decidedAt
            ? formatDayAndHour(review.decidedAt)
            : m.reviews_written({ ago: formatAgo(review.createdAt, now) })}
        </span>
      </div>

      <dl className="grid gap-m sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={`${LINES[review.line]()} · ${m.reviews_proposed()}`}>
          <span className="flex flex-wrap items-center gap-xs">
            <Value value={review.value} />
            {review.language && <Badge>{review.language.toUpperCase()}</Badge>}
          </span>
        </Fact>
        {review.status !== "confirmed" && (
          <Fact label={m.reviews_current()}>
            <Value value={review.current} />
          </Fact>
        )}
        <Fact label={m.reviews_author()}>
          {review.author ? (
            <span className="grid gap-xxs">
              <Link
                to="/accounts/$accountId"
                params={{ accountId: review.author.id }}
                className={linked}
              >
                {review.author.username ? `@${review.author.username}` : m.reviews_no_username()}
              </Link>
              <span className="text-s text-neutral-7">
                {review.author.confirmed === 1
                  ? m.reviews_author_confirmed_one()
                  : m.reviews_author_confirmed({ count: formatCount(review.author.confirmed) })}
              </span>
            </span>
          ) : (
            <span className="text-neutral-7">{m.reviews_author_gone()}</span>
          )}
        </Fact>
        {review.confirmations > 0 && (
          <Fact label={m.reviews_confirmations()}>
            {m.reviews_confirmations_count({ count: formatCount(review.confirmations) })}
          </Fact>
        )}
        {contested && (
          <Fact label={m.reviews_contests()}>
            <ul className="grid gap-xs">
              {review.contests.map((contest) => (
                <li key={contest.accountId} className="grid gap-xxs">
                  <span>« {contest.reason} »</span>
                  <span className="text-s text-neutral-7">
                    <Link
                      to="/accounts/$accountId"
                      params={{ accountId: contest.accountId }}
                      className={linked}
                    >
                      {contest.username ? `@${contest.username}` : m.reviews_no_username()}
                    </Link>
                    {" · "}
                    {formatAgo(contest.at, now)}
                  </span>
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {review.status === "refused" && <Fact label={m.moderation_reason()}>{review.reason}</Fact>}
      </dl>

      {review.status !== "refused" && (
        <div className="flex flex-wrap gap-xs">
          {/* What was contested is kept or refused. What waits is accepted or refused. */}
          {contested ? (
            <Button disabled={isBusy} onClick={onKeep}>
              {m.reviews_keep()}
            </Button>
          ) : (
            review.status !== "confirmed" &&
            place && (
              <Button disabled={isBusy} onClick={onAccept}>
                {m.moderation_accept()}
              </Button>
            )
          )}
          <Button variant="outline" disabled={isBusy} onClick={onRefuse}>
            {m.moderation_refuse()}
          </Button>
        </div>
      )}
    </li>
  );
}

type GuideReviewsProps = {
  queue: ReviewQueue;
  onQueueChange: (queue: ReviewQueue) => void;
  // Undefined while the contributions load.
  reviews: Review[] | undefined;
  // How many the queue holds: more than are shown, for a long one.
  total: number;
  now: number;
};

/**
 * What accounts wrote of the breaks, for an operator to confirm or to refuse: what waits to be
 * read, what an account that keeps the break contested, and what was answered. Decision 041.
 */
export function GuideReviews({ queue, onQueueChange, reviews, total, now }: GuideReviewsProps) {
  const queryClient = useQueryClient();
  const [refusing, setRefusing] = useState<Review | null>(null);
  const [reason, setReason] = useState("");

  const answered = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.v1.reviews.key() }),
      refreshLists(queryClient),
    ]);
  // A contribution that was answered elsewhere, or taken back, is read again.
  const failed = async (error: Error) => {
    toast.error(error.message);
    await answered();
  };
  const accept = useMutation({
    mutationFn: (one: Review) => client.v1.reviews.accept({ id: one.id }),
    onSuccess: async (done) => {
      toast.success(m.reviews_accepted({ name: done.break?.name ?? "" }));
      await answered();
    },
    onError: failed,
  });
  const keep = useMutation({
    // The contests that were read are closed: one that came since still waits.
    mutationFn: (one: Review) =>
      client.v1.reviews.keep({ id: one.id, through: one.contests.at(-1)?.at ?? new Date() }),
    onSuccess: async () => {
      toast.success(m.reviews_kept());
      await answered();
    },
    onError: failed,
  });
  const refuse = useMutation({
    mutationFn: (one: Review) => client.v1.reviews.refuse({ id: one.id, reason }),
    onSuccess: async () => {
      toast.success(m.reviews_refused_done());
      setRefusing(null);
      setReason("");
      await answered();
    },
    onError: failed,
  });
  const isBusy = accept.isPending || keep.isPending || refuse.isPending;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-s">
        <p className="max-w-(--container-3xl) text-neutral-7">{m.reviews_intro()}</p>
        <Tabs value={queue} onValueChange={(value) => onQueueChange(value as ReviewQueue)}>
          <TabsList variant="segment" aria-label={m.reviews_queue()}>
            {REVIEW_QUEUES.map((one) => (
              <TabsTab key={one} value={one}>
                {QUEUE_NAMES[one]()}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {!reviews ? (
        <Loader />
      ) : reviews.length === 0 ? (
        <p className="text-neutral-7">{EMPTY[queue]()}</p>
      ) : (
        <>
          <ul className="grid gap-m">
            {reviews.map((review) => (
              <Contribution
                key={review.id}
                review={review}
                now={now}
                isBusy={isBusy}
                onAccept={() => accept.mutate(review)}
                onKeep={() => keep.mutate(review)}
                onRefuse={() => setRefusing(review)}
              />
            ))}
          </ul>
          {total > reviews.length && (
            <p className="text-s text-neutral-7">
              {m.reviews_more({
                count: formatCount(reviews.length),
                total: formatCount(total),
              })}
            </p>
          )}
        </>
      )}

      <Dialog open={refusing !== null} onOpenChange={(open) => !open && setRefusing(null)}>
        <DialogPopup className="w-full max-w-md gap-l p-l">
          <div className="grid gap-xs">
            <DialogTitle>{m.reviews_refuse_title()}</DialogTitle>
            <DialogDescription>{m.reviews_refuse_body()}</DialogDescription>
          </div>
          <form
            className="grid gap-l"
            onSubmit={(event) => {
              event.preventDefault();
              if (refusing && reason.trim() && !refuse.isPending) refuse.mutate(refusing);
            }}
          >
            <Field label={m.moderation_reason()}>
              {() => (
                <Textarea
                  value={reason}
                  maxLength={REASON_MOST}
                  rows={2}
                  disabled={refuse.isPending}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>
            <div className="flex justify-end gap-xs">
              <Button type="button" variant="ghost" onClick={() => setRefusing(null)}>
                {m.cancel()}
              </Button>
              <Button type="submit" disabled={!reason.trim()} isPending={refuse.isPending}>
                {m.moderation_refuse()}
              </Button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
    </>
  );
}
