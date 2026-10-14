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
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { SendIcon, XIcon } from "@repo/ui/icon";
import { type FormEvent, type ReactNode, useRef, useState } from "react";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { client } from "@/utils/orpc";

// Where an idea stands: being written, on its way, arrived, or kept back for the reason the API
// gave, or for none when the API did not answer.
type State =
  | { at: "writing" }
  | { at: "sending" }
  | { at: "sent"; name: string }
  | { at: "refused"; why: "off" | "full" | "failed" | "unanswered" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-xxs">
      {label}
      {children}
    </Label>
  );
}

/**
 * A button that opens the form that sends its maker an idea, in a dialog. It goes by mail, to be
 * answered at the address given: decision 026.
 */
export function IdeaDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ at: "writing" });
  // The dialog opens on the first field, where writing starts.
  const first = useRef<HTMLInputElement>(null);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? "").trim();
    const name = read("name");
    setState({ at: "sending" });
    try {
      const answer = await client.v1.ideas.send({
        name,
        email: read("email"),
        idea: read("idea"),
        locale: getLocale() === "fr" ? "fr" : "en",
      });
      setState(answer.sent ? { at: "sent", name } : { at: "refused", why: answer.why });
    } catch {
      setState({ at: "refused", why: "unanswered" });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A dialog opened again after an idea left starts a new one. What was typed and not
        // sent stays: the form is not drawn again while it is closed.
        if (next && state.at === "sent") setState({ at: "writing" });
      }}
    >
      <DialogTrigger
        render={<Button variant="secondary" size="sm" className="justify-self-start" />}
      >
        {m.landing_idea_open()}
      </DialogTrigger>
      <DialogPopup initialFocus={first} className="w-[min(30rem,calc(100vw-2rem))] gap-m p-l">
        <div className="flex items-start justify-between gap-s">
          <div className="grid gap-xxs">
            <DialogTitle>
              {state.at === "sent"
                ? m.landing_idea_sent_title({ name: state.name })
                : m.landing_idea_title()}
            </DialogTitle>
            <DialogDescription>
              {state.at === "sent" ? m.landing_idea_sent_text() : m.landing_idea_text()}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={m.action_close()}
            render={<Button variant="ghost" size="icon" className="-mt-xs -mr-xs" />}
          >
            <XIcon data-slot="icon" aria-hidden />
          </DialogClose>
        </div>
        {state.at === "sent" ? (
          <DialogClose render={<Button variant="secondary" className="self-end" />}>
            {m.action_close()}
          </DialogClose>
        ) : (
          <form className="grid gap-m" onSubmit={send}>
            <div className="grid gap-m sm:grid-cols-2">
              <Field label={m.landing_idea_name()}>
                <Input ref={first} name="name" required maxLength={60} autoComplete="given-name" />
              </Field>
              <Field label={m.landing_idea_email()}>
                <Input name="email" type="email" required maxLength={254} autoComplete="email" />
              </Field>
            </div>
            <Field label={m.landing_idea_idea()}>
              <Textarea
                name="idea"
                required
                maxLength={4000}
                rows={5}
                placeholder={m.landing_idea_placeholder({ name: APP_NAME })}
              />
            </Field>
            {state.at === "refused" && (
              <p role="alert" className="text-s text-error">
                {state.why === "full" ? m.landing_idea_full() : m.landing_idea_failed()}{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
                  {CONTACT_EMAIL}
                </a>
              </p>
            )}
            <Button type="submit" className="justify-self-end" isPending={state.at === "sending"}>
              <SendIcon aria-hidden />
              {m.landing_idea_send()}
            </Button>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}
