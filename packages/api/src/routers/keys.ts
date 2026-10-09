import { ORPCError } from "@orpc/server";
import { apiKey, operator } from "@repo/db/schema/access";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { operatorProcedure } from "../index";
import { newKey } from "../keys";
import { hasControlCharacter } from "../text";

const keySchema = z.object({
  id: z.string(),
  name: z.string(),
  // The key's first characters. The key itself is given once, when it is made.
  prefix: z.string(),
  createdAt: z.date(),
  // To the minute. Null until the key is used.
  lastUsedAt: z.date().nullable(),
  // A revoked key no longer works, and stays in the list.
  revokedAt: z.date().nullable(),
});

const described = {
  id: apiKey.id,
  name: apiKey.name,
  prefix: apiKey.prefix,
  createdAt: apiKey.createdAt,
  lastUsedAt: apiKey.lastUsedAt,
  revokedAt: apiKey.revokedAt,
};

const SESSION_ONLY =
  "Takes the signed-in session of an operator of the instance. A key cannot make, list or " +
  "revoke keys.";

export const keysRouter = {
  list: operatorProcedure
    .route({
      method: "GET",
      path: "/keys",
      summary: "The API keys the caller made, the newest first",
      description: SESSION_ONLY,
      tags: ["Keys"],
    })
    .output(z.object({ keys: z.array(keySchema) }))
    .handler(async ({ context }) => {
      const keys = await context.db
        .select(described)
        .from(apiKey)
        .where(eq(apiKey.userId, context.session.user.id))
        .orderBy(desc(apiKey.createdAt), desc(apiKey.id));
      return { keys };
    }),

  create: operatorProcedure
    .route({
      method: "POST",
      path: "/keys",
      summary: "Make an API key",
      description:
        `${SESSION_ONLY} The answer holds the key, and nothing gives it again: the instance ` +
        "keeps only its hash. A program sends it as `Authorization: Bearer <key>`, and reads " +
        "with it the data everyone shares, nothing of an account.",
      tags: ["Keys"],
      successStatus: 201,
    })
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .refine((name) => !hasControlCharacter(name), "must not contain control characters"),
      }),
    )
    .output(keySchema.extend({ key: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { key, prefix, keyHash } = newKey();

      const made = await context.db.transaction(async (tx) => {
        // Taking the operator's rights away revokes their keys. Holding the row keeps a key
        // from being made while that happens, and from outliving it.
        const [held] = await tx
          .select({ userId: operator.userId })
          .from(operator)
          .where(eq(operator.userId, userId))
          .for("share");
        if (!held) throw new ORPCError("FORBIDDEN");

        const [row] = await tx
          .insert(apiKey)
          .values({ id: crypto.randomUUID(), userId, name: input.name, prefix, keyHash })
          .returning(described);
        return row;
      });
      if (!made) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return { ...made, key };
    }),

  revoke: operatorProcedure
    .route({
      method: "DELETE",
      path: "/keys/{id}",
      summary: "Revoke an API key the caller made",
      description: `${SESSION_ONLY} A revoked key stops working at once, and never works again.`,
      tags: ["Keys"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(keySchema)
    .handler(async ({ input, context }) => {
      const [revoked] = await context.db
        .update(apiKey)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKey.id, input.id),
            eq(apiKey.userId, context.session.user.id),
            isNull(apiKey.revokedAt),
          ),
        )
        .returning(described);
      if (!revoked)
        throw new ORPCError("NOT_FOUND", { message: `No key "${input.id}" to revoke.` });
      return revoked;
    }),
};
