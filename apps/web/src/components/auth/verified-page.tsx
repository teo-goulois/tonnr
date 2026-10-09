import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

/**
 * What the page says. Of the account that is signed in: its address is `checked`, or `pending`,
 * or `unknown` when the API did not say. Of the link alone: it is `expired`, `invalid`, its
 * account is `gone`, or the address says nothing against it, which is all `followed` means.
 */
export type VerifiedOutcome =
  | "checked"
  | "pending"
  | "unknown"
  | "followed"
  | "expired"
  | "invalid"
  | "gone";

// What became of the link, from the word the API put in the address. The address of a page is
// anyone's to write: every word that is not the API's is a link that does not work.
function linkOutcome(error: string | undefined) {
  switch (error) {
    case undefined:
      return "followed";
    case "TOKEN_EXPIRED":
      return "expired";
    case "USER_NOT_FOUND":
      return "gone";
    default:
      return "invalid";
  }
}

/**
 * What to say, from the word the API put in the address and from the account signed in here.
 * The link may be another account's, and the page can be opened by its address without any
 * link, so an address with no word in it proves nothing. An account that is signed in is told
 * about its own address, which the API gives. Without one, the page knows the address alone.
 */
export function verifiedOutcome(
  error: string | undefined,
  account: { emailVerified: boolean } | undefined,
  signedIn: boolean | undefined,
): VerifiedOutcome {
  const link = linkOutcome(error);
  // Signed in, and the API gave no answer: the page does not say what it was not told.
  if (!account) return signedIn && link === "followed" ? "unknown" : link;
  if (account.emailVerified) return "checked";
  // A link that worked, or one of an account that is gone, was not this account's.
  return link === "followed" || link === "gone" ? "pending" : link;
}

type VerifiedPageProps = {
  outcome: VerifiedOutcome;
  // Undefined while the page does not know who is signed in: what it says may still change.
  signedIn: boolean | undefined;
  // Whether the signed-in account can be sent a new mail: its address is not checked, on an
  // instance that checks addresses.
  canSend: boolean;
  isSending: boolean;
  onSend: () => void;
  // Asks the API about the account again, after it gave no answer.
  isRetrying: boolean;
  onRetry: () => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
};

const WORDS: Record<VerifiedOutcome, { title: () => string; text: () => string }> = {
  checked: { title: m.verify_title_checked, text: m.verify_checked },
  pending: { title: m.verify_not_checked, text: m.verify_pending },
  unknown: { title: m.verify_title_followed, text: m.verify_unknown },
  followed: { title: m.verify_title_followed, text: m.verify_followed },
  expired: { title: m.verify_title_expired, text: m.verify_expired },
  invalid: { title: m.verify_title_invalid, text: m.verify_invalid },
  gone: { title: m.verify_title_gone, text: m.verify_gone },
};

const LAYOUT = "mx-auto grid w-full max-w-(--container-sm) content-start gap-l px-m py-xl";

/**
 * Where the link of the mail that checks an address lands. The link signs no one in, and may be
 * opened in another browser than the one that signed up, so the page works with and without a
 * session.
 */
export function VerifiedPage({
  outcome,
  signedIn,
  canSend,
  isSending,
  onSend,
  isRetrying,
  onRetry,
  onSignIn,
  onCreateAccount,
}: VerifiedPageProps) {
  const words = WORDS[outcome];
  // A new mail is what a link that failed, or an address still to check, asks for.
  const wantsMail = outcome === "pending" || outcome === "expired" || outcome === "invalid";

  if (signedIn === undefined) {
    return (
      <main className={LAYOUT} aria-busy>
        <div className="grid gap-xs">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-40 rounded-(--radius-s)" />
      </main>
    );
  }

  return (
    <main className={LAYOUT}>
      <div className="grid gap-xs">
        <h1 className="text-l font-medium">{words.title()}</h1>
        <p className="text-neutral-7">{words.text()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-s">
        {outcome === "unknown" ? (
          <Button disabled={isRetrying} onClick={onRetry}>
            {m.action_retry()}
          </Button>
        ) : signedIn && wantsMail && canSend ? (
          <Button disabled={isSending} onClick={onSend}>
            {m.verify_send()}
          </Button>
        ) : signedIn ? (
          <Link to="/app" className={buttonVariants()}>
            {m.verify_open_map()}
          </Link>
        ) : outcome === "gone" ? (
          <Button onClick={onCreateAccount}>{m.auth_create_account()}</Button>
        ) : (
          <>
            <Button onClick={onSignIn}>{m.auth_sign_in()}</Button>
            {wantsMail && <p className="text-s text-neutral-7">{m.verify_sign_in_to_send()}</p>}
          </>
        )}
      </div>
    </main>
  );
}
