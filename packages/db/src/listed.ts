import { and, isNotNull, sql } from "drizzle-orm";

import type { Database } from "./index";
import { breakContribution, GUIDE_TEXT_LINES } from "./schema/community";
import { surfBreak } from "./schema/spots";

// Which breaks of the catalogue a search engine is asked to list: decision 057. The rule reads
// no clock and no database, and `standsAloneSql` says the same to the database, so that the API,
// which answers a page, and the worker, which keeps the forecasts of the listed breaks, agree.

export type Break = typeof surfBreak.$inferSelect;

/** How many of its eleven characteristics a break says. */
export function saidCharacteristics(row: Break) {
  return [
    row.breakTypes,
    row.waveDirections,
    row.bottomTypes,
    row.abilityLevels,
    row.boardTypes,
    row.bestSeasons,
    row.bestTides,
    row.bestSwellDirections,
    row.bestWindDirections,
    row.offshoreDirectionDegrees,
    row.waveSizeMeters,
  ].filter((value) => value !== null).length;
}

/**
 * How many characteristics a break says before its page stands on its own. The catalogue has
 * no break between three and seven: the ones with a guide's pictograms say seven or more, the
 * ones with a place alone say three or fewer.
 */
export const STANDS_ALONE_AT = 7;

/**
 * Whether a break's page stands on its own, so that a search engine is asked to list it: it
 * says enough of itself, or its operator described it, or an account's text of its guide was
 * confirmed.
 */
export function standsAlone(row: Break, guide: { hasText: boolean }) {
  return saidCharacteristics(row) >= STANDS_ALONE_AT || row.description !== null || guide.hasText;
}

const saidSql = sql<number>`(
  (${surfBreak.breakTypes} is not null)::int + (${surfBreak.waveDirections} is not null)::int
  + (${surfBreak.bottomTypes} is not null)::int + (${surfBreak.abilityLevels} is not null)::int
  + (${surfBreak.boardTypes} is not null)::int + (${surfBreak.bestSeasons} is not null)::int
  + (${surfBreak.bestTides} is not null)::int + (${surfBreak.bestSwellDirections} is not null)::int
  + (${surfBreak.bestWindDirections} is not null)::int
  + (${surfBreak.offshoreDirectionDegrees} is not null)::int
  + (${surfBreak.waveSizeMeters} is not null)::int
)`;

const hasTextSql = sql`exists (
  select 1 from ${breakContribution}
  where ${breakContribution.breakId} = ${surfBreak.id}
    and ${breakContribution.status} = 'confirmed'
    and ${breakContribution.line} in (${sql.join(
      GUIDE_TEXT_LINES.map((line) => sql`${line}`),
      sql`, `,
    )})
)`;

/** `standsAlone`, said to the database of the row of `surf_break` a query stands on. */
export const standsAloneSql = sql<boolean>`(${saidSql} >= ${STANDS_ALONE_AT} or ${surfBreak.description} is not null or ${hasTextSql})`;

/** A break has a page when it has places: with `standsAloneSql`, this makes the listed ones. */
export const hasPageSql = and(isNotNull(surfBreak.countrySlug), isNotNull(surfBreak.regionSlug))!;

/** The points of the listed breaks, for the worker that keeps their forecasts. */
export async function listedPoints(db: Pick<Database, "select">) {
  return db
    .select({ id: surfBreak.id, latitude: surfBreak.latitude, longitude: surfBreak.longitude })
    .from(surfBreak)
    .where(and(hasPageSql, standsAloneSql))
    .orderBy(surfBreak.id);
}
