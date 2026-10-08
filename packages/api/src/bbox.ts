import { and, between, gte, lte, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);
// A plain decimal number. `Number` alone would read an empty part as zero and "0x10" as sixteen.
const partSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform(Number);

// "west,south,east,north", the order GeoJSON uses. West may be greater than east, for a box
// that crosses the antimeridian. South may not be above north.
export const bboxSchema = z
  .string()
  .transform((value) => value.split(","))
  .pipe(z.tuple([partSchema, partSchema, partSchema, partSchema]))
  .pipe(z.tuple([longitudeSchema, latitudeSchema, longitudeSchema, latitudeSchema]))
  .refine(([, south, , north]) => south <= north, "south is above north");

type Bbox = z.infer<typeof bboxSchema>;

/** The condition that keeps the rows whose point lies in a box. Undefined for no box. */
export function inBbox(latitude: AnyPgColumn, longitude: AnyPgColumn, bbox: Bbox | undefined) {
  if (!bbox) return undefined;
  const [west, south, east, north] = bbox;

  return and(
    between(latitude, south, north),
    // A box that crosses the antimeridian has its west edge east of its east edge.
    west <= east ? between(longitude, west, east) : or(gte(longitude, west), lte(longitude, east)),
  );
}
