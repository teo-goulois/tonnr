import { APP_NAME, CONTACT_EMAIL } from "@repo/config/app";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { SendIcon, XIcon } from "@repo/ui/icon";
import { type Ref, useRef, useState } from "react";
import { z } from "zod";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { client } from "@/utils/orpc";

// Why a message was kept back: for the reason the API gave, or for none when it did not answer.
type Refusal = "off" | "full" | "failed" | "unanswered";

// A message as the API takes it.
const NAME_MOST = 60;
const EMAIL_MOST = 254;
const TEXT_MOST = 4000;

/** What a message is about, chosen above it: its words, and how the text then starts. */
export type Topic = { id: string; label: string; start: string };

/** What a form says, which an idea and a message say each in its own words. */
export type MessageWords = {
  text: string;
  placeholder: string;
  // What a refusal says before the address to write to.
  full: string;
  failed: string;
};

/**
 * The form that sends whoever makes the product an idea, or a message: a first name, an address
 * and the text, by mail, to be answered at the address given. Decision 026, made with the form
 * kit of decision 076: what is missing or wrong is said under its field once the form is sent.
 */
export function MessageForm({
  about,
  words,
  first,
  start,
  topics,
  topic: firstTopic,
  onSent,
}: {
  about: "idea" | "message";
  words: MessageWords;
  first?: Ref<HTMLInputElement>;
  // What the text says before the reader writes, when the form is opened for one idea.
  start?: string;
  // What the message may be about, and the one chosen when the form opens.
  topics?: Topic[];
  topic?: string;
  onSent: (name: string) => void;
}) {
  const [refusal, setRefusal] = useState<Refusal>();
  const [topic, setTopic] = useState(firstTopic ?? topics?.[0]?.id);
  const text = useRef<HTMLTextAreaElement>(null);
  const startOf = (id: string | undefined) => topics?.find((each) => each.id === id)?.start ?? "";
  // The text the form opens with, kept as it was: a topic chosen later writes the text itself.
  const [opening] = useState(() => ({ name: "", email: "", text: start ?? startOf(topic) }));

  const form = useAppForm({
    defaultValues: opening,
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, m.landing_idea_name_missing()).max(NAME_MOST),
        email: z.string().trim().pipe(z.email(m.auth_email_invalid())),
        text: z.string().trim().min(1, m.landing_idea_text_missing()).max(TEXT_MOST),
      }),
    },
    onSubmit: async ({ value }) => {
      setRefusal(undefined);
      const name = value.name.trim();
      try {
        const answer = await client.v1.ideas.send({
          name,
          email: value.email.trim(),
          idea: value.text.trim(),
          locale: getLocale(),
          about,
        });
        if (answer.sent) onSent(name);
        else setRefusal(answer.why);
      } catch {
        setRefusal("unanswered");
      }
    },
  });

  // A topic chosen starts the text its way, unless the reader has written something of their own.
  function choose(id: string) {
    setTopic(id);
    const written = form.getFieldValue("text").trim();
    if (written !== "" && !topics?.some((each) => each.start.trim() === written)) return;
    const next = startOf(id);
    form.setFieldValue("text", next);
    // The text is written once the form draws it again: the caret then goes to its end.
    requestAnimationFrame(() => {
      const area = text.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(next.length, next.length);
    });
  }

  return (
    <form.AppForm>
      <form.Form className="grid gap-m">
        <div className="grid gap-m sm:grid-cols-2">
          <form.AppField name="name">
            {(field) => (
              <field.Input
                ref={first}
                label={m.landing_idea_name()}
                required
                maxLength={NAME_MOST}
                autoComplete="given-name"
              />
            )}
          </form.AppField>
          <form.AppField name="email">
            {(field) => (
              <field.Input
                label={m.landing_idea_email()}
                type="email"
                required
                maxLength={EMAIL_MOST}
                autoComplete="email"
              />
            )}
          </form.AppField>
        </div>
        {topics && (
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={m.contact_topic()}
            value={topic ? [topic] : []}
            onValueChange={([pressed]) => {
              if (pressed) choose(pressed);
            }}
          >
            {topics.map((each) => (
              <ToggleGroupItem key={each.id} value={each.id}>
                {each.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <form.AppField name="text">
          {(field) => (
            <field.Textarea
              ref={text}
              label={words.text}
              required
              maxLength={TEXT_MOST}
              rows={5}
              placeholder={words.placeholder}
            />
          )}
        </form.AppField>
        {refusal && (
          <p role="alert" className="text-s text-error">
            {refusal === "full" ? words.full : words.failed}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
          </p>
        )}
        <form.SubmitButton className="justify-self-end">
          <SendIcon aria-hidden />
          {m.landing_idea_send()}
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

/**
 * A button that opens the form that sends its maker an idea, in a dialog. It goes by mail, to be
 * answered at the address given: decision 026. Given an idea of the list, the button says the
 * reader wants it, and the text starts by naming it: the mail tells which one is awaited.
 */
export function IdeaDialog({ wants }: { wants?: string }) {
  const [open, setOpen] = useState(false);
  // Who sent the idea that left, while the dialog says thank you.
  const [sentBy, setSentBy] = useState<string | null>(null);
  // The dialog opens on the first field, where writing starts.
  const first = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A dialog opened again after an idea left starts a new one. What was typed and not
        // sent stays: the form is not drawn again while it is closed.
        if (next) setSentBy(null);
      }}
    >
      <DialogTrigger
        render={<Button variant="secondary" size="sm" className="justify-self-start" />}
      >
        {wants === undefined ? m.landing_idea_open() : m.landing_next_want()}
      </DialogTrigger>
      <DialogPopup initialFocus={first} className="w-[min(30rem,calc(100vw-2rem))] gap-m p-l">
        <div className="flex items-start justify-between gap-s">
          <div className="grid gap-xxs">
            <DialogTitle>
              {sentBy === null
                ? m.landing_idea_title()
                : m.landing_idea_sent_title({ name: sentBy })}
            </DialogTitle>
            <DialogDescription>
              {sentBy === null ? m.landing_idea_text() : m.landing_idea_sent_text()}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={m.action_close()}
            render={<Button variant="ghost" size="icon" className="-mt-xs -mr-xs" />}
          >
            <XIcon data-slot="icon" aria-hidden />
          </DialogClose>
        </div>
        {sentBy === null ? (
          <MessageForm
            about="idea"
            first={first}
            onSent={setSentBy}
            start={
              wants === undefined ? undefined : `${m.landing_next_want_idea({ idea: wants })}\n\n`
            }
            words={{
              text: m.landing_idea_idea(),
              placeholder: m.landing_idea_placeholder({ name: APP_NAME }),
              full: m.landing_idea_full(),
              failed: m.landing_idea_failed(),
            }}
          />
        ) : (
          <DialogClose render={<Button variant="secondary" className="self-end" />}>
            {m.action_close()}
          </DialogClose>
        )}
      </DialogPopup>
    </Dialog>
  );
}
