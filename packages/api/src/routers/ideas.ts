import { ORPCError } from "@orpc/server";
import { readSender } from "@repo/mail";
import { z } from "zod";

import { IDEAS_A_DAY } from "../ideas";
import { linkProcedure } from "../index";

// A line of text a person types, with no sign that is no character: a line break in a name would
// make two lines of a subject.
const LINE = /^[^\p{Cc}]+$/u;

export const ideasRouter = {
  send: linkProcedure
    .route({
      method: "POST",
      path: "/ideas",
      summary: "Send whoever makes the product an idea, or a message",
      description:
        "Takes a visitor of the web app or an account, from the web app's site, and no key " +
        "and no link: an idea is a person's, sent from the landing, and so is a message, sent " +
        "from the contact page, which `about: message` says. It goes by mail to whoever " +
        "makes the product, with the address given as where an answer goes, and nothing of it " +
        `is kept. The instance sends ${IDEAS_A_DAY} a day at most, ideas and messages together, ` +
        "within its mails for the day, " +
        "whether or not it answers visitors. `sent: false` says why: `off`, the instance sends " +
        "no mail; `full`, it has sent its ideas or its mails for the day, in UTC; `failed`, the " +
        "provider did not take the mail. Decision 026.",
      tags: ["Instance"],
    })
    .use(({ context, next }) => {
      const { via } = context.named;
      if (via === "none") throw new ORPCError("UNAUTHORIZED");
      if (via === "key" || via === "link") {
        throw new ORPCError("FORBIDDEN", {
          message: "An idea is sent by a person, from the web app. A key or a link sends none.",
        });
      }
      return next();
    })
    .input(
      z.object({
        name: z.string().trim().min(1).max(60).regex(LINE),
        // An address as a sender has one, since an answer goes to it.
        email: z
          .string()
          .trim()
          .max(254)
          .refine((email) => readSender(email)?.email === email),
        idea: z.string().trim().min(1).max(4000),
        locale: z.enum(["en", "fr"]),
        about: z.enum(["idea", "message"]).default("idea"),
      }),
    )
    .output(
      z.discriminatedUnion("sent", [
        z.object({ sent: z.literal(true) }),
        z.object({ sent: z.literal(false), why: z.enum(["off", "full", "failed"]) }),
      ]),
    )
    .handler(async ({ input, context }) =>
      context.ideas ? context.ideas.send(input) : { sent: false as const, why: "off" as const },
    ),
};
