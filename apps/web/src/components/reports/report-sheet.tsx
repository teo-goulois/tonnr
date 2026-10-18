import { REPORT_MOST_MEDIA, REPORT_NOTE_MOST } from "@repo/config/media";
import { Button } from "@repo/ui/components/ui/button";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { cn } from "@repo/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { UsernameForm } from "../account/username-form";
import { SessionMediaField } from "../sessions/session-media";
import { SurfSizeInput } from "../sessions/surf-size";
import type { SurfSize } from "../sessions/types";
import { ViewerDrawer } from "../viewer/viewer-drawer";
import type { Reporting } from "./types";

// The form a report is sent from, at a break: its photos and videos, how big the waves look, and
// a few words. Decision 067.

type ReportSheetProps = {
  wide: boolean;
  reporting: Reporting;
  // The account's username: a report is read under it, and one is chosen here first.
  username: string | null | undefined;
  onUsernameSave: (username: string) => Promise<string | undefined>;
};

/** What a report is made of, as its form holds it, at one break. */
function ReportForm({ wide, reporting }: { wide: boolean; reporting: Reporting }) {
  const [entries, setEntries] = useState<string[]>([]);
  const [waveSize, setWaveSize] = useState<SurfSize | null>(null);
  const [setSize, setSetSize] = useState<SurfSize | null>(null);
  const [note, setNote] = useState("");
  // What was sent from this form and not sent with a report is let go as it closes.
  const kept = useRef<string[]>([]);
  kept.current = entries;
  const drop = useRef(reporting.onDrop);
  drop.current = reporting.onDrop;
  useEffect(() => () => kept.current.forEach((key) => drop.current(key)), []);

  const uploads = entries.map((key) => reporting.uploads.get(key));
  const isGoing = uploads.some((upload) => upload?.state === "sending");
  const sent = uploads.filter((upload) => upload?.state === "sent").length;

  async function send() {
    if (isGoing || sent === 0 || reporting.isSending) return;
    const done = await reporting.onSend({ uploads: entries, waveSize, setSize, note });
    // The report took them: they are no longer this form's to let go.
    if (done) kept.current = [];
  }

  return (
    <form
      className="grid gap-m"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="text-s text-neutral-7 text-pretty">{m.report_rules()}</p>
      <div
        className={cn(
          "edge rounded-(--radius-xs) [--edge-color:var(--neutral-4)]",
          "[&>*+*]:shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]",
        )}
      >
        <SessionMediaField
          entries={entries.map((key) => ({ upload: key }))}
          kept={[]}
          uploads={reporting.uploads}
          disabled={reporting.isSending}
          paused={reporting.status?.paused === true}
          most={REPORT_MOST_MEDIA}
          onAdd={(files) => {
            const keys = reporting.onStart(files.slice(0, REPORT_MOST_MEDIA - entries.length));
            setEntries([...entries, ...keys]);
          }}
          onRemove={(index) => {
            const key = entries[index];
            if (key) reporting.onDrop(key);
            setEntries(entries.filter((_, at) => at !== index));
          }}
          onRetry={reporting.onRetry}
          onOpen={() => {}}
        />
        <div className="flex min-h-14 items-center justify-between gap-s px-s py-xs">
          <span className="shrink-0">{m.surf_size_title()}</span>
          <SurfSizeInput
            waves={waveSize}
            sets={setSize}
            onChange={(waves, sets) => {
              setWaveSize(waves);
              setSetSize(sets);
            }}
            wide={wide}
            disabled={reporting.isSending}
          />
        </div>
      </div>
      <Textarea
        aria-label={m.report_note()}
        value={note}
        rows={2}
        maxLength={REPORT_NOTE_MOST}
        placeholder={m.report_note_placeholder()}
        disabled={reporting.isSending}
        onChange={(event) => setNote(event.target.value)}
      />
      <p className="text-xs text-neutral-7 text-pretty">
        {m.report_rights()}{" "}
        <Link to="/terms" className="underline underline-offset-2">
          {m.report_rights_link()}
        </Link>
      </p>
      <Button type="submit" disabled={isGoing || sent === 0} isPending={reporting.isSending}>
        {isGoing ? m.report_waiting_uploads() : m.report_send_now()}
      </Button>
    </form>
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
