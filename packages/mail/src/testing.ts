import { failingAdapter, memoryAdapter } from "@opencoredev/email-sdk/testing";

import { createMailer, type Mail } from "./index";

// What stands for the mail in a test, here and in the programs that send some. No test sends a
// mail: the library's adapter in memory takes the place of the provider.

/** A mailer that keeps what it is given, or that refuses it. `sent` holds the mails it took. */
export function testMailer({ failing = false }: { failing?: boolean } = {}) {
  const out = memoryAdapter("unosend");
  const mailer = createMailer(
    { UNOSEND_API_KEY: "made-up", EMAIL_FROM: "Tonnr <hello@example.org>" },
    failing ? failingAdapter("unosend", new Error("The provider is down")) : out,
  );
  if (!mailer) throw new Error("No mailer was made");
  return {
    mailer,
    // The mails that were taken, as the instance wrote them.
    sent: () => (out.raw?.sent ?? []).map((kept) => kept.message as unknown as Mail),
  };
}
