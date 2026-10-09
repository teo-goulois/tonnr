import { ORPCError } from "@orpc/server";
import { privateBreak } from "@repo/db/schema/private-breaks";
import { and, asc, eq, gt, ilike } from "drizzle-orm";
import { z } from "zod";

import { bboxSchema, inBbox } from "../bbox";
import { operatorProcedure } from "../index";

const OPERATOR_ONLY =
  "Takes the signed-in session of an operator of the instance. No key reads this list, and " +
  "no other account does: decision 016.";

const listedSchema = z.object({
  id: z.string(),
  // The short name the operator gave the list this break belongs to.
  provider: z.string(),
  // The break's identifier in that list.
  ref: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

const listed = {
  id: privateBreak.id,
  provider: privateBreak.provider,
  ref: privateBreak.providerRef,
  name: privateBreak.name,
  latitude: privateBreak.latitude,
  longitude: privateBreak.longitude,
};

// In a LIKE pattern these three characters have a meaning of their own.
function literal(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export const privateBreaksRouter = {
  list: operatorProcedure
    .route({
      method: "GET",
      path: "/private-breaks",
      summary: "The instance's private list of breaks, in an area or by name",
      description:
        `${OPERATOR_ONLY} Pages follow one another through \`after\`. A break's details come ` +
        "with the break alone.",
      tags: ["Private breaks"],
    })
    .input(
      z.object({
        bbox: bboxSchema.optional(),
        // Part of the name, in any case.
        q: z.string().trim().min(2).max(80).optional(),
        // The `next` of the page before.
        after: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(2000).default(500),
      }),
    )
    .output(
      z.object({
        breaks: z.array(listedSchema),
        // What to pass as `after` to get the breaks that follow. Null on the last page.
        next: z.string().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      const rows = await context.db
        .select(listed)
        .from(privateBreak)
        .where(
          and(
            inBbox(privateBreak.latitude, privateBreak.longitude, input.bbox),
            input.q ? ilike(privateBreak.name, `%${literal(input.q)}%`) : undefined,
            input.after ? gt(privateBreak.id, input.after) : undefined,
          ),
        )
        .orderBy(asc(privateBreak.id))
        // One more than asked, to know whether a page follows.
        .limit(input.limit + 1);

      const page = rows.slice(0, input.limit);
      return {
        breaks: page,
        next: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    }),

  get: operatorProcedure
    .route({
      method: "GET",
      path: "/private-breaks/{id}",
      summary: "One break of the private list, with its details",
      description: OPERATOR_ONLY,
      tags: ["Private breaks"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(
      listedSchema.extend({
        // The page that shows the break and the terms the list falls under, when the file
        // that brought the list gave them.
        sourceUrl: z.string().nullable(),
        termsUrl: z.string().nullable(),
        rights: z.string(),
        collectedAt: z.date(),
        // What else the list says of the break, as its file gave it.
        details: z.record(z.string(), z.unknown()),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select({
          ...listed,
          sourceUrl: privateBreak.sourceUrl,
          termsUrl: privateBreak.termsUrl,
          rights: privateBreak.rights,
          collectedAt: privateBreak.collectedAt,
          details: privateBreak.details,
        })
        .from(privateBreak)
        .where(eq(privateBreak.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND", { message: `No private break "${input.id}".` });
      return row;
    }),
};
