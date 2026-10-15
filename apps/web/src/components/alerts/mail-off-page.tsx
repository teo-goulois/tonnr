import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";
import { PageColumn } from "@/components/shared/page-column";

/**
 * Where the page stands: the link is `asked` to be confirmed, the mails are `off`, the link is
 * `spent`, which a link is once it was used or once mail was switched off and on again, or the
 * API `failed` to answer.
 */
export type MailOffState = "asked" | "off" | "spent" | "failed";

type MailOffPageProps = {
  state: MailOffState;
  isStopping: boolean;
  onStop: () => void;
};

const WORDS: Record<MailOffState, { title: () => string; text: () => string }> = {
  asked: { title: m.mail_off_title, text: m.mail_off_text },
  off: { title: m.mail_off_done_title, text: m.mail_off_done },
  spent: { title: m.mail_off_spent_title, text: m.mail_off_spent },
  failed: { title: m.mail_off_title, text: m.mail_off_failed },
};

/**
 * Where the link at the foot of an alert mail lands: one button that switches alert mails off.
 * The link signs no one in, and the page asks for no session: a link that a program follows by
 * itself switches nothing off, the button does.
 */
export function MailOffPage({ state, isStopping, onStop }: MailOffPageProps) {
  const words = WORDS[state];
  return (
    <PageColumn>
      <div className="grid gap-xs" aria-live="polite">
        <h1 className="text-l font-medium">{words.title()}</h1>
        <p className="text-neutral-7">{words.text()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-s">
        {state === "asked" || state === "failed" ? (
          <Button isPending={isStopping} disabled={isStopping} onClick={onStop}>
            {m.mail_off_button()}
          </Button>
        ) : (
          <Link
            to="/app"
            search={{ panel: "account", settings: "alerts" }}
            className={buttonVariants({ variant: "secondary" })}
          >
            {m.mail_off_settings()}
          </Link>
        )}
      </div>
    </PageColumn>
  );
}
