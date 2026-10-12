import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { holdAccounts } from "@repo/db/accounts";
import { befriend, FRIENDS_MOST, ownerOfLink, pairOf } from "@repo/db/friends";
import { user } from "@repo/db/schema/auth";
import {
  accountLink,
  breakContribution,
  friendship,
  GUIDE_LANGUAGES,
  GUIDE_TEXT_LINES,
  GUIDE_WORD_LINES,
  RANKS,
  sponsorship,
} from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { isTextLine, isWordLine } from "../community";
import { authorSchema, authorsOf, valueSchema } from "../guides";
import { linkProcedure, protectedProcedure } from "../index";
import { newToken } from "../shares";
import { standingsOf } from "../standings";

type Reader = Pick<Database, "select">;

// What a friend reads of the other: its username and its rank. Its score is not: with what
// it wrote, a score would say how many accounts it brought.
const friendSchema = z.object({
  id: z.string(),
  // Null for a friend whose username an operator took away.
  username: z.string().nullable(),
  rank: z.enum(RANKS).nullable(),
  since: z.date(),
  // Of an account that was made through the caller's link: whether it counts for the caller
  // yet, which it does once it had a contribution confirmed. Null for any other friend.
  sponsored: z.enum(["waiting", "counted"]).nullable(),
});

const linkSchema = z.object({
  // What the link ends with. The web app's address for it is `/i/<token>`.
  token: z.string(),
});

const tokenInput = z.object({ token: z.string().min(1).max(64) });

const noLink = () => new ORPCError("NOT_FOUND", { message: "This link opens nothing." });
const noFriend = () => new ORPCError("NOT_FOUND", { message: "No such friend." });
const needsUsername = () =>
  new ORPCError("FORBIDDEN", { message: "Choose a username first: a friend is read by it." });

/** The username of an account. Null for one that has none, and for no account. */
async function usernameOf(db: Reader, userId: string) {
  const [account] = await db
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, userId));
  return account?.username ?? null;
}

/** The friends of an account, the latest first, as it reads them. */
async function friendsOf(db: Reader, userId: string, only?: string) {
  const rows = await db
    .select()
    .from(friendship)
    .where(
      and(
        or(eq(friendship.userId, userId), eq(friendship.friendId, userId)),
        isNull(friendship.endedAt),
      ),
    )
    .orderBy(desc(friendship.createdAt));
  const friends = rows
    .map((row) => ({
      id: row.userId === userId ? row.friendId : row.userId,
      since: row.createdAt,
    }))
    .filter((friend) => only === undefined || friend.id === only);
  if (friends.length === 0) return [];

  const ids = friends.map((friend) => friend.id);
  const named = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(inArray(user.id, ids));
  const standings = await standingsOf(db, ids);
  const brought = await db
    .select({ sponsoredId: sponsorship.sponsoredId })
    .from(sponsorship)
    .where(and(eq(sponsorship.sponsorId, userId), inArray(sponsorship.sponsoredId, ids)));
  return friends.map((friend) => {
    const standing = standings.get(friend.id);
    const isBrought = brought.some((row) => row.sponsoredId === friend.id);
    return {
      ...friend,
      username: named.find((account) => account.id === friend.id)?.username ?? null,
      rank: standing?.rank ?? null,
      sponsored: isBrought
        ? (standing?.confirmed ?? 0) > 0
          ? ("counted" as const)
          : ("waiting" as const)
        : null,
    };
  });
}

export const friendsRouter = {
  link: protectedProcedure
    .route({
      method: "GET",
      path: "/friends/link",
      summary: "The link the caller gives to whoever it wants as a friend",
      description:
        "Takes a signed-in session. The link is made the first time it is asked for. An " +
        "account made through it has the caller as its sponsor, and the two are friends. An " +
        "account that exists already and opens it becomes a friend. The link of an account " +
        "that has no username opens nothing until it has one: a friend is read by it. " +
        "Decision 041.",
      tags: ["Friends"],
    })
    .output(linkSchema)
    .handler(async ({ context }) => {
      const userId = context.session.user.id;
      // Of two requests at once, one writes the link and both read it.
      await context.db
        .insert(accountLink)
        .values({ userId, token: newToken() })
        .onConflictDoNothing();
      const [link] = await context.db
        .select({ token: accountLink.token })
        .from(accountLink)
        .where(eq(accountLink.userId, userId));
      if (!link) throw noLink();
      return link;
    }),

  renewLink: protectedProcedure
    .route({
      method: "POST",
      path: "/friends/link/renew",
      summary: "Give the caller a new link",
      description:
        "Takes a signed-in session. The link before opens nothing from then on. The friends " +
        "it made stay. Decision 041.",
      tags: ["Friends"],
    })
    .output(linkSchema)
    .handler(async ({ context }) => {
      const userId = context.session.user.id;
      const token = newToken();
      await context.db
        .insert(accountLink)
        .values({ userId, token })
        .onConflictDoUpdate({ target: accountLink.userId, set: { token, createdAt: new Date() } });
      return { token };
    }),

  open: linkProcedure
    .route({
      method: "POST",
      path: "/friends/open",
      summary: "Whose link this is",
      description:
        "Takes neither a key nor a session: the link is what says whose it is, to whoever " +
        "was given it. It answers the username and the rank of its owner, and nothing else. " +
        "A link whose owner has no username opens nothing. To sign up through it, send it " +
        "with the sign-up, as `invitation`: the new account then has the owner as its " +
        "sponsor. Decision 041.",
      tags: ["Friends"],
    })
    .input(tokenInput)
    .output(authorSchema)
    .handler(async ({ input, context }) => {
      const owner = await ownerOfLink(context.db, input.token);
      const found = owner === null ? undefined : (await authorsOf(context.db, [owner])).get(owner);
      if (!found) throw noLink();
      return found;
    }),

  accept: protectedProcedure
    .route({
      method: "POST",
      path: "/friends",
      summary: "Become the friend of the account whose link this is",
      description:
        "Takes a signed-in session of an account that has a username. The two accounts are " +
        "friends from then on: each reads the other's username, rank and confirmed " +
        "contributions, and nothing of its spots, its alerts or its lists. It makes no " +
        "sponsor: only an account made through a link has one. The answer is 409 for the " +
        "caller's own link, and 403 when the link's owner ended the friendship, which its " +
        `link no longer makes, or when either has ${FRIENDS_MOST} friends. Decision 041.`,
      tags: ["Friends"],
    })
    .input(tokenInput)
    .output(friendSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        if ((await usernameOf(tx, userId)) === null) throw needsUsername();
        const owner = await ownerOfLink(tx, input.token);
        if (owner === null || (await usernameOf(tx, owner)) === null) throw noLink();
        if (owner === userId) {
          throw new ORPCError("CONFLICT", { message: "This is your own link." });
        }
        const made = await befriend(tx, userId, owner);
        if (made === "ended") {
          throw new ORPCError("FORBIDDEN", {
            message: "This account ended the friendship. Its link no longer makes it.",
          });
        }
        if (made === "full") {
          throw new ORPCError("FORBIDDEN", {
            message: `An account has at most ${FRIENDS_MOST} friends.`,
          });
        }
        const [friend] = await friendsOf(tx, userId, owner);
        if (!friend) throw noFriend();
        return friend;
      });
    }),

  list: protectedProcedure
    .route({
      method: "GET",
      path: "/friends",
      summary: "The caller's friends",
      description:
        "Takes a signed-in session. Each friend comes with its username and its rank, the " +
        "latest first. `sponsored` says of an account made through the caller's link " +
        "whether it counts for the caller yet. Decision 041.",
      tags: ["Friends"],
    })
    .output(z.object({ friends: z.array(friendSchema) }))
    .handler(async ({ context }) => ({
      friends: await friendsOf(context.db, context.session.user.id),
    })),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/friends/{id}",
      summary: "What a friend wrote in the guides",
      description:
        "Takes a signed-in session. The answer is 404 for an account that is not the " +
        "caller's friend. It gives the friend's username, its rank, and its contributions " +
        "that were confirmed, the latest first: what anyone reads in the guides under that " +
        "username. A spot the friend asked to make public is not among them: a break names " +
        "no account. Decision 041.",
      tags: ["Friends"],
    })
    .input(z.object({ id: z.string().min(1).max(200) }))
    .output(
      friendSchema.extend({
        contributions: z.array(
          z.object({
            id: z.string(),
            // The break it was written of. Null once the break has left the catalogue.
            break: z.object({ id: z.string(), name: z.string() }).nullable(),
            line: z.enum([...GUIDE_WORD_LINES, ...GUIDE_TEXT_LINES]),
            value: valueSchema,
            language: z.enum(GUIDE_LANGUAGES).nullable(),
            confirmedAt: z.date().nullable(),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      const { db } = context;
      const [friend] = await friendsOf(db, context.session.user.id, input.id);
      if (!friend) throw noFriend();
      const rows = await db
        .select({ contribution: breakContribution, breakId: surfBreak.id, name: surfBreak.name })
        .from(breakContribution)
        .leftJoin(surfBreak, eq(surfBreak.id, breakContribution.breakId))
        .where(
          and(
            eq(breakContribution.userId, friend.id),
            eq(breakContribution.status, "confirmed"),
            ne(breakContribution.line, "place"),
          ),
        )
        .orderBy(desc(breakContribution.confirmedAt), desc(breakContribution.id))
        .limit(100);
      return {
        ...friend,
        contributions: rows.flatMap(({ contribution, breakId, name }) =>
          isWordLine(contribution.line) || isTextLine(contribution.line)
            ? [
                {
                  id: contribution.id,
                  break: breakId !== null && name !== null ? { id: breakId, name } : null,
                  line: contribution.line,
                  value: contribution.value,
                  language: contribution.language,
                  confirmedAt: contribution.confirmedAt,
                },
              ]
            : [],
        ),
      };
    }),

  remove: protectedProcedure
    .route({
      method: "DELETE",
      path: "/friends/{id}",
      summary: "End a friendship",
      description:
        "Takes a signed-in session. Neither reads the other's contributions as a friend " +
        "from then on. The other does not make the friendship again by the caller's link: " +
        "the caller does, by opening the other's. Decision 041.",
      tags: ["Friends"],
    })
    .input(z.object({ id: z.string().min(1).max(200) }))
    .output(z.object({ ended: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const pair = pairOf(userId, input.id);
      const ended = await context.db.transaction(async (tx) => {
        // Both accounts are held, as they are when a friendship is made: one that is being
        // made by the other's link at the same moment is made first, then ended.
        await holdAccounts(tx, [userId, input.id]);
        const [row] = await tx
          .update(friendship)
          .set({ endedBy: userId, endedAt: new Date() })
          .where(
            and(
              eq(friendship.userId, pair.userId),
              eq(friendship.friendId, pair.friendId),
              isNull(friendship.endedAt),
            ),
          )
          .returning({ userId: friendship.userId });
        return row;
      });
      if (!ended) throw noFriend();
      return { ended: true as const };
    }),
};
