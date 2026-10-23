import type { Part } from "@repo/client/alerts/alert-words";
import { isSetValue, othersOf } from "@repo/client/alerts/editing";
import type { AlertCriteria } from "@repo/client/viewer/types";
import { MAX_ALTERNATIVES } from "@repo/conditions/spots/criteria";

// Which values of a part an alert's sentence says, and where its "+" stands, as the web's editor
// says them: its own value, then each other value that asks something, after "or" and with an
// "×" that takes it away; an other value still to choose says nothing. The "+" stands after the
// last value said once that one asks something and the part has room for one more, and opens
// the value after the last. Decision 031, "The editor".

export type SaidValues = {
  /** The other values the sentence says, by their index: 1 for the first other value. */
  others: number[];
  /** Whether a "+" follows the last value said. */
  canAdd: boolean;
  /** The index the "+" opens: a value to choose, which the sentence says once it is chosen. */
  adds: number;
};

export function saidValues(criteria: AlertCriteria, key: Part): SaidValues {
  const count = othersOf(criteria, key);
  const others = Array.from({ length: count }, (_, at) => at + 1).filter((index) =>
    isSetValue(criteria, key, index),
  );
  const last = others.at(-1) ?? 0;
  return {
    others,
    canAdd: isSetValue(criteria, key, last) && count < MAX_ALTERNATIVES,
    adds: count + 1,
  };
}
