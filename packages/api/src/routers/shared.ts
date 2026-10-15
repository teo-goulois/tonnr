import { ORPCError } from "@orpc/server";
import { user } from "@repo/db/schema/auth";
import { stationList, stationListMember } from "@repo/db/schema/lists";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { linkProcedure, protectedProcedure } from "../index";
import { passOf, shareOf, tryPassword } from "../shares";
import { listViewSchema, viewOf } from "./lists";

// How many accounts keep one list, and how many lists of others one account keeps.
const MAX_MEMBERS_PER_LIST = 100;
const MAX_JOINED_PER_USER = 50;

// What a link of a list ends with, and what it may ask for: its password, or the pass that
// stood for it since it was given.
const linkInput = z.object({
  token: z.string().max(64),
  password: z.string().max(72).optional(),
  pass: z.string().max(64).optional(),
});

function noLink() {
  return new ORPCError("NOT_FOUND", { message: "This link opens no list." });
}

function locked() {
  return new ORPCError("TOO_MANY_REQUESTS", {
    message: "Too many wrong passwords for this link. Try again in a quarter of an hour.",
  });
}

export const sharedRouter = {
  open: linkProcedure
    .meta({ analytics: "shared_list_opened" })
    .route({
      method: "POST",
      path: "/shared/open",
      summary: "The list a link opens",
      description:
        "Takes neither a key nor a session: the link is what opens the list. A link that " +
        "asks for a password answers `locked` until it is given one, and 403 for a wrong one. " +
        "Ten wrong ones in a quarter of an hour close it for the rest of it. With the list " +
        "comes `pass`, for a list with a password, which this route takes in its place from " +
        "then on: a reader sends `Authorization: List " +
        "<token>.<pass>`, or `List <token>` without one, to read the stations, the breaks, " +
        "the forecasts and the tides as an account does. The list's owner and an account " +
        "that kept it are known by their session, and are asked no password. `owner` is the " +
        "username of whoever shares the list, null for an account that chose none. " +
        "Decision 035.",
      tags: ["Lists"],
    })
    .input(linkInput)
    .output(
      z.union([
        z.object({ locked: z.literal(true) }),
        z.object({
          locked: z.literal(false),
          // What stands for the password from then on. Null for a link that asks none.
          pass: z.string().nullable(),
          // The username of whoever shares the list, which a link is shown with. Null for an
          // account that chose none.
          owner: z.string().nullable(),
          list: listViewSchema,
        }),
      ]),
    )
    .handler(async ({ input, context }) => {
      const share = await shareOf(context.db, input.token);
      if (!share) throw noLink();
      const [list] = await context.db
        .select()
        .from(stationList)
        .where(eq(stationList.id, share.listId));
      if (!list) throw noLink();

      const userId = context.session?.user.id;
      const [kept] = userId
        ? await context.db
            .select({ listId: stationListMember.listId })
            .from(stationListMember)
            .where(and(eq(stationListMember.listId, list.id), eq(stationListMember.userId, userId)))
        : [];
      const access = list.userId === userId ? "owner" : kept ? "member" : "link";
      // A request that carries the link with its pass has given the password before, and so
      // has an account that gives the pass it was read with before it signed in.
      const passed =
        (context.named.via === "link" && context.named.listId === list.id) ||
        (input.pass !== undefined && input.pass === passOf(share));

      if (access === "link" && !passed && share.passwordHash !== null) {
        if (input.password === undefined) return { locked: true as const };
        const tried = await tryPassword(context.db, share, input.password);
        if (tried === "locked") throw locked();
        if (tried === "wrong") throw new ORPCError("FORBIDDEN", { message: "Wrong password." });
      }
      const [owner] = await context.db
        .select({ username: user.username })
        .from(user)
        .where(eq(user.id, list.userId));
      return {
        locked: false as const,
        pass: passOf(share),
        owner: owner?.username ?? null,
        list: await viewOf(context.db, list, access, userId),
      };
    }),

  join: protectedProcedure
    .meta({ analytics: "shared_list_joined" })
    .route({
      method: "POST",
      path: "/shared/join",
      summary: "Keep the list a link opens among the caller's lists",
      description:
        "The caller then reads the list without its link, at `GET /lists/{id}/view`, until " +
        "its owner stops sharing it. The password is asked as it is when the link is opened, " +
        "and `pass` stands for it as it does there. " +
        "Keeping one's own list, or a list kept already, changes nothing. An account keeps " +
        `at most ${MAX_JOINED_PER_USER} lists of others, and a list is kept by at most ` +
        `${MAX_MEMBERS_PER_LIST} accounts.`,
      tags: ["Lists"],
    })
    .input(linkInput)
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const share = await shareOf(context.db, input.token);
      if (!share) throw noLink();
      // What stood for the password while the caller read the list without an account does
      // so here too.
      if (share.passwordHash !== null && input.pass !== passOf(share)) {
        const tried = await tryPassword(context.db, share, input.password ?? "");
        if (tried === "locked") throw locked();
        if (tried === "wrong") throw new ORPCError("FORBIDDEN", { message: "Wrong password." });
      }

      return context.db.transaction(async (tx) => {
        // Locking the account row makes what it keeps run one after the other, and locking the
        // list does the same for who keeps it: two requests at once cannot both pass a limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
        const [list] = await tx
          .select()
          .from(stationList)
          .where(eq(stationList.id, share.listId))
          .for("update");
        // The link was ended meanwhile.
        if (!list || !(await shareOf(tx, input.token))) throw noLink();
        if (list.userId === userId) return { id: list.id };

        const [already] = await tx
          .select({ listId: stationListMember.listId })
          .from(stationListMember)
          .where(and(eq(stationListMember.listId, list.id), eq(stationListMember.userId, userId)));
        if (already) return { id: list.id };

        const [mine] = await tx
          .select({ total: count() })
          .from(stationListMember)
          .where(eq(stationListMember.userId, userId));
        if ((mine?.total ?? 0) >= MAX_JOINED_PER_USER) {
          throw new ORPCError("FORBIDDEN", {
            message: `An account keeps at most ${MAX_JOINED_PER_USER} lists of others.`,
          });
        }
        const [theirs] = await tx
          .select({ total: count() })
          .from(stationListMember)
          .where(eq(stationListMember.listId, list.id));
        if ((theirs?.total ?? 0) >= MAX_MEMBERS_PER_LIST) {
          throw new ORPCError("FORBIDDEN", {
            message: `A list is kept by at most ${MAX_MEMBERS_PER_LIST} accounts.`,
          });
        }
        await tx.insert(stationListMember).values({ listId: list.id, userId });
        return { id: list.id };
      });
    }),
};
