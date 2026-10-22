// What asks a spot's guide to open what describes it: the offer a spot just added makes its owner
// (`NewSpotOffer`), as the web's panel opens its editor from it. The guide may be drawn already or
// come after the ask, and opens it once either way. Decision 006. A module that imports nothing of
// React Native, so that a test reads it.

const asked = new Set<string>();
const listeners = new Set<() => void>();

/** Asks the guide of a spot to open what describes it. */
export function askToDescribe(spotId: string) {
  asked.add(spotId);
  for (const listener of listeners) listener();
}

/** Whether the guide of a spot was asked to open what describes it, which answers the ask. */
export function takeDescribeAsk(spotId: string) {
  return asked.delete(spotId);
}

/** Hears each ask: a guide that is drawn. */
export function onDescribeAsked(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
