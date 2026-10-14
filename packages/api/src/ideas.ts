import { DEFAULT_DAILY_MAILS } from "@repo/auth/verification";
import type { Database } from "@repo/db";
import { type Count, countCalls } from "@repo/db/calls";
import { MAIL_PROVIDER, type Mailer } from "@repo/mail";
import { type Idea, ideaMail } from "@repo/mail/ideas";

// The ideas a person sends from the landing, by mail to whoever makes the product: decision 026.
// Nothing of an idea is kept: the mail is all there is of it.

/** The name the ideas are counted under. */
export const IDEAS_PROVIDER = "ideas";
/** How many ideas the instance lets out in a day, whoever sends them. */
export const IDEAS_A_DAY = 20;

/**
 * What became of an idea. `off`: the instance sends no mail. `full`: it has sent its ideas, or
 * its mails, for the day. `failed`: the provider did not take the mail, or did not say.
 */
export type IdeaSent = { sent: true } | { sent: false; why: "off" | "full" | "failed" };

export type Ideas = { send: (idea: Idea) => Promise<IdeaSent> };

/**
 * What sends an idea. `mailer` is null on an instance that sends no mail. `dailyLimit` is the
 * instance's for all its mails, as the mail that checks an address counts it.
 */
export function createIdeas(
  database: Database,
  mailer: Mailer | null,
  dailyLimit = DEFAULT_DAILY_MAILS,
): Ideas {
  // An idea is counted with the ideas of the day and with the instance's mails, in both or in
  // neither, before it leaves.
  const counts: Count[] = [
    { provider: IDEAS_PROVIDER, bucket: "day", span: "day", limit: IDEAS_A_DAY },
    { provider: MAIL_PROVIDER, bucket: "day", span: "day", limit: dailyLimit },
  ];
  return {
    send: async (idea) => {
      if (!mailer) return { sent: false, why: "off" };
      if (await countCalls(database, counts)) return { sent: false, why: "full" };
      return (await mailer.send(ideaMail(idea))) === "accepted"
        ? { sent: true }
        : { sent: false, why: "failed" };
    },
  };
}
