import { REPORT_MOST_MEDIA, REPORT_NOTE_MOST } from "@repo/config/media";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { cn } from "@repo/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";

import { m } from "@/paraglide/messages.js";

import { UsernameForm } from "../account/username-form";
import { Answer, ROW } from "../sessions/session-form";
import { SessionMediaField } from "../sessions/session-media";
import { SurfSizeInput } from "../sessions/surf-size";
import type { SurfSize } from "../sessions/types";
import { ViewerDrawer } from "../viewer/viewer-drawer";
import type { Reporting } from "./types";

// The form a report is sent from, at a break: its photos and videos, how big the waves look, and
// a few words. Decision 067, made with the form kit of decision 076.

type ReportSheetProps = {
  wide: boolean;
  reporting: Reporting;
  // The account's username: a report is read under it, and one is chosen here first.
  username: string | null | undefined;
  onUsernameSave: (username: string) => Promise<string | undefined>;
};

/** How big most of the waves and the sets look. */
type Sizes = { waves: SurfSize | null; sets: SurfSize | null };

/** What a report is made of, as its form holds it: the keys of its files, its sizes, its words. */
type ReportValues = { entries: string[]; sizes: Sizes; note: string };

const EMPTY: ReportValues = { entries: [], sizes: { waves: null, sets: null }, note: "" };

/** What a report is made of, as its form holds it, at one break. */
function ReportForm({ wide, reporting }: { wide: boolean; reporting: Reporting }) {
  // What was sent from this form and not sent with a report is let go as it closes.
  const kept = useRef<string[]>([]);
  // Once the report took them, they are no longer this form's to let go.
  const taken = useRef(false);
  const drop = useRef(reporting.onDrop);
  drop.current = reporting.onDrop;
  useEffect(
    () => () => {
      if (!taken.current) kept.current.forEach((key) => drop.current(key));
    },
    [],
  );

  const stateOf = (key: string) => reporting.uploads.get(key)?.state;
  const isGoingOf = (entries: string[]) => entries.some((key) => stateOf(key) === "sending");

  const form = useAppForm({
    defaultValues: EMPTY,
    validators: {
      onSubmit: z.object({
        // A report shows the waves: one file at least went up whole.
        entries: z
          .array(z.string())
          .refine((keys) => keys.some((key) => stateOf(key) === "sent"), m.report_media_missing()),
        sizes: z.custom<Sizes>(),
        note: z.string().max(REPORT_NOTE_MOST),
      }),
    },
    onSubmit: async ({ value }) => {
      if (isGoingOf(value.entries) || reporting.isSending) return;
      const done = await reporting.onSend({
        uploads: value.entries,
        waveSize: value.sizes.waves,
        setSize: value.sizes.sets,
        note: value.note,
      });
      if (done) taken.current = true;
    },
  });

  return (
    <form.AppForm>
      <form.Form className="grid gap-m">
        <p className="text-s text-neutral-7 text-pretty">{m.report_rules()}</p>
        <div
          className={cn(
            "edge rounded-(--radius-xs) [--edge-color:var(--neutral-4)]",
            "[&>*+*]:shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]",
          )}
        >
          <form.AppField name="entries">
            {(field) => (
              // What is wrong with the strip is said under it, where its own words stand.
              <field.Control<
                string[]
              > className="grid min-w-0 has-[[role=alert]]:pb-s [&>:not([data-slot=form-control])]:px-s">
                {(control) => {
                  const entries = control.value;
                  kept.current = entries;
                  return (
                    <SessionMediaField
                      entries={entries.map((key) => ({ upload: key }))}
                      kept={[]}
                      uploads={reporting.uploads}
                      disabled={reporting.isSending}
                      paused={reporting.status?.paused === true}
                      most={REPORT_MOST_MEDIA}
                      onAdd={(files) => {
                        const keys = reporting.onStart(
                          files.slice(0, REPORT_MOST_MEDIA - entries.length),
                        );
                        control.onChange([...entries, ...keys]);
                      }}
                      onRemove={(index) => {
                        const key = entries[index];
                        if (key) reporting.onDrop(key);
                        control.onChange(entries.filter((_, at) => at !== index));
                      }}
                      onRetry={reporting.onRetry}
                      onOpen={() => {}}
                      aria-describedby={control["aria-describedby"]}
                      aria-invalid={control["aria-invalid"]}
                    />
                  );
                }}
              </field.Control>
            )}
          </form.AppField>
          <form.AppField name="sizes">
            {(field) => (
              <field.Control<Sizes> label={m.surf_size_title()} layout="inline" className={ROW}>
                {(control) => (
                  <Answer>
                    <SurfSizeInput
                      waves={control.value.waves}
                      sets={control.value.sets}
                      onChange={(waves, sets) => control.onChange({ waves, sets })}
                      wide={wide}
                      disabled={reporting.isSending}
                    />
                  </Answer>
                )}
              </field.Control>
            )}
          </form.AppField>
        </div>
        <form.AppField name="note">
          {(field) => (
            <field.Textarea
              aria-label={m.report_note()}
              rows={2}
              maxLength={REPORT_NOTE_MOST}
              placeholder={m.report_note_placeholder()}
              disabled={reporting.isSending}
            />
          )}
        </form.AppField>
        <p className="text-xs text-neutral-7 text-pretty">
          {m.report_rights()}{" "}
          <Link to="/terms" className="underline underline-offset-2">
            {m.report_rights_link()}
          </Link>
        </p>
        {/* The report waits for its files to be up, and says so. */}
        <form.Subscribe selector={(state) => isGoingOf(state.values.entries)}>
          {(isGoing) => (
            <form.SubmitButton disabled={isGoing} isPending={reporting.isSending}>
              {isGoing ? m.report_waiting_uploads() : m.report_send_now()}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.Form>
    </form.AppForm>
  );
}

/**
 * The sheet a report is sent from, over the panel of its break. An account with no username
 * chooses one first: a report is read under it.
 */
export function ReportSheet({ wide, reporting, username, onUsernameSave }: ReportSheetProps) {
  const { open } = reporting;
  return (
    <ViewerDrawer
      open={open !== null}
      onOpenChange={(next) => {
        if (!next) reporting.onClose();
      }}
      wide={wide}
      title={m.report_new()}
      description={open?.name}
    >
      {open &&
        (username ? (
          <ReportForm key={open.breakId} wide={wide} reporting={reporting} />
        ) : (
          <div className="grid gap-s">
            <p className="text-s text-neutral-7">{m.report_username_first()}</p>
            <UsernameForm current={null} onSave={onUsernameSave} onSaved={() => {}} />
          </div>
        ))}
    </ViewerDrawer>
  );
}
