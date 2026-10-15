import { slugify } from "@repo/config/names";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "./index";
import { surfBreak, surfBreakAlias } from "./schema/spots";

// The address of a break's page, `/spots/<country>/<region>/<slug>`, given once as the break
// enters the catalogue and never changed by a rename: decision 057. The migration that made the
// columns wrote the same for the breaks that were there, with the same letters read the same way.

type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "select" | "insert" | "update">;

export type Address = {
  countrySlug: string | null;
  regionSlug: string | null;
  slug: string;
};

/** The places a break's address names: its country and its region, or the country twice. */
export function placesOf(location: readonly string[] | null | undefined) {
  const countrySlug = location?.[0] ? slugify(location[0]) || null : null;
  const regionSlug = location?.[1] ? slugify(location[1]) || countrySlug : countrySlug;
  return { countrySlug, regionSlug };
}

/** How far a break of 30 km around a point is, to borrow its places: a spot made public has none. */
const WITHIN_DEGREES = 0.3;

/**
 * The places of the nearest break of the catalogue, within about 30 km of a point, for a break
 * made of a spot: a spot names no places of its own. Null where none stands near.
 */
export async function nearestPlaces(db: Reader, point: { latitude: number; longitude: number }) {
  const [near] = await db
    .select({ location: surfBreak.location })
    .from(surfBreak)
    .where(
      and(
        sql`${surfBreak.latitude} between ${point.latitude - WITHIN_DEGREES} and ${point.latitude + WITHIN_DEGREES}`,
        sql`${surfBreak.longitude} between ${point.longitude - WITHIN_DEGREES} and ${point.longitude + WITHIN_DEGREES}`,
        sql`${surfBreak.location} is not null`,
      ),
    )
    .orderBy(
      sql`power(${surfBreak.latitude} - ${point.latitude}, 2) + power((${surfBreak.longitude} - ${point.longitude}) * cos(radians(${point.latitude})), 2)`,
    )
    .limit(1);
  return near?.location ?? null;
}

const key = (address: Address) => `${address.countrySlug}/${address.regionSlug}/${address.slug}`;

/** Whether a break or an alias holds an address already. */
async function isTaken(db: Reader, address: Address) {
  const sameCountry = address.countrySlug
    ? eq(surfBreak.countrySlug, address.countrySlug)
    : isNull(surfBreak.countrySlug);
  const sameRegion = address.regionSlug
    ? eq(surfBreak.regionSlug, address.regionSlug)
    : isNull(surfBreak.regionSlug);
  const [held] = await db
    .select({ id: surfBreak.id })
    .from(surfBreak)
    .where(and(sameCountry, sameRegion, eq(surfBreak.slug, address.slug)))
    .limit(1);
  if (held) return true;
  if (!address.countrySlug || !address.regionSlug) return false;
  const [kept] = await db
    .select({ slug: surfBreakAlias.slug })
    .from(surfBreakAlias)
    .where(
      and(
        eq(surfBreakAlias.countrySlug, address.countrySlug),
        eq(surfBreakAlias.regionSlug, address.regionSlug),
        eq(surfBreakAlias.slug, address.slug),
      ),
    )
    .limit(1);
  return kept !== undefined;
}

/**
 * The address a new break takes: its name as a slug, under its country and its region. When
 * that one is taken in the region, by a break or by an alias, its nearest place is added, and
 * then the first six characters of its id. `reserved` holds the addresses given in the same
 * transaction and not written yet, as an import gives thousands at once.
 */
export async function addressOf(
  db: Reader,
  found: { id: string; name: string; location: readonly string[] | null | undefined },
  reserved?: Set<string>,
): Promise<Address> {
  const places = placesOf(found.location);
  const base = slugify(found.name) || `spot-${found.id.slice(0, 6)}`;
  const nearest =
    found.location && found.location.length > 2
      ? slugify(found.location[found.location.length - 1] ?? "")
      : "";
  const tried = [
    base,
    ...(nearest && nearest !== base ? [`${base}-${nearest}`] : []),
    `${base}-${found.id.slice(0, 6)}`,
  ];
  for (const slug of tried) {
    const address = { ...places, slug };
    if (reserved?.has(key(address))) continue;
    if (await isTaken(db, address)) continue;
    reserved?.add(key(address));
    return address;
  }
  // The id makes the last one unique: it is never reached.
  return { ...places, slug: tried.at(-1)! };
}

/**
 * Keeps the address of a break that is merged into another, so that it leads to the one that
 * stays: its own, and the ones it kept from earlier merges. Called before the merged break is
 * deleted, whose aliases would go with it.
 */
export async function keepAddressOf(tx: Writer, merged: Address & { id: string }, keepId: string) {
  await tx
    .update(surfBreakAlias)
    .set({ breakId: keepId })
    .where(eq(surfBreakAlias.breakId, merged.id));
  if (!merged.countrySlug || !merged.regionSlug) return;
  await tx
    .insert(surfBreakAlias)
    .values({
      countrySlug: merged.countrySlug,
      regionSlug: merged.regionSlug,
      slug: merged.slug,
      breakId: keepId,
    })
    .onConflictDoNothing();
}

/** The break an address names, or the one an alias leads to: `moved` says which. */
export async function breakAtAddress(db: Reader, address: Address) {
  if (!address.countrySlug || !address.regionSlug) return null;
  const [own] = await db
    .select()
    .from(surfBreak)
    .where(
      and(
        eq(surfBreak.countrySlug, address.countrySlug),
        eq(surfBreak.regionSlug, address.regionSlug),
        eq(surfBreak.slug, address.slug),
      ),
    )
    .limit(1);
  if (own) return { row: own, moved: false };
  const [alias] = await db
    .select({ row: surfBreak })
    .from(surfBreakAlias)
    .innerJoin(surfBreak, eq(surfBreak.id, surfBreakAlias.breakId))
    .where(
      and(
        eq(surfBreakAlias.countrySlug, address.countrySlug),
        eq(surfBreakAlias.regionSlug, address.regionSlug),
        eq(surfBreakAlias.slug, address.slug),
      ),
    )
    .limit(1);
  return alias ? { row: alias.row, moved: true } : null;
}

/** The path of a break's page in the web app, before its language. Null for a break with no places. */
export function pathOf(address: Address) {
  if (!address.countrySlug || !address.regionSlug) return null;
  return `/spots/${address.countrySlug}/${address.regionSlug}/${address.slug}`;
}
