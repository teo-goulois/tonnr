import { isProcedure } from "@orpc/server";

// The name of each procedure: its place in the router, such as `v1.stations.list`. A call is
// counted under it, whichever transport carried the call: one of them knows the procedure from
// the root of the router and the other from `v1`, so the path a call arrives with would give one
// procedure two names.
const names = new WeakMap<object, string>();

/** Names every procedure of a router after its place in it. */
export function nameProcedures(router: object, path: string[] = []) {
  for (const [key, value] of Object.entries(router)) {
    if (isProcedure(value)) names.set(value, [...path, key].join("."));
    else if (typeof value === "object" && value !== null) nameProcedures(value, [...path, key]);
  }
}

/** The name a procedure was given, or `unnamed` for one that belongs to no router. */
export function procedureName(procedure: object) {
  return names.get(procedure) ?? "unnamed";
}
