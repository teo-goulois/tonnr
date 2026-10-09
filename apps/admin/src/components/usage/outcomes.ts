import type { Outcome } from "@/lib/usage";
import { m } from "@/paraglide/messages.js";

/** What came of a call, in words, in the order the screens give them. */
export const OUTCOME_LABELS: Record<Outcome, () => string> = {
  answered: m.outcome_answered,
  invalid: m.outcome_invalid,
  refused: m.outcome_refused,
  limited: m.outcome_limited,
  failed: m.outcome_failed,
};

/** What each word means, for whoever reads the counts for the first time. */
export const OUTCOME_HINTS: Record<Outcome, () => string> = {
  answered: m.outcome_answered_hint,
  invalid: m.outcome_invalid_hint,
  refused: m.outcome_refused_hint,
  limited: m.outcome_limited_hint,
  failed: m.outcome_failed_hint,
};
