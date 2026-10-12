import {
  type PushApi,
  type PushBrowser,
  type PushDevice,
  type PushKept,
  type PushLeave,
  PushRefused,
  type PushSubscriptionGiven,
} from "./push";

// What stands for a browser and for the API in the tests of push: neither asks anyone. A test
// changes `state` to say what the user, another tab or another device did meanwhile.

/** The key of the instance of the tests. */
export const TEST_PUSH_KEY = "the-instance-key";

const subscriptionAt = (endpoint: string): PushSubscriptionGiven => ({
  endpoint,
  keys: { p256dh: `p256dh of ${endpoint}`, auth: `auth of ${endpoint}` },
});

/**
 * A browser that keeps what it is told. `calls` lists what was asked of it, in order. A
 * subscription it holds was made for the instance's key, unless a test says for which, or that
 * the browser does not say.
 */
export function testBrowser(
  start: {
    leave?: PushLeave;
    // What the user answers when asked.
    answer?: PushLeave;
    held?: { endpoint: string; madeFor?: string | null } | null;
    hasWorker?: boolean;
    kept?: PushKept | null;
  } = {},
) {
  const calls: string[] = [];
  const state = {
    leave: start.leave ?? "default",
    held: start.held
      ? {
          ...subscriptionAt(start.held.endpoint),
          madeFor: start.held.madeFor === undefined ? TEST_PUSH_KEY : start.held.madeFor,
        }
      : null,
    hasWorker: start.hasWorker ?? Boolean(start.held),
    kept: start.kept ?? null,
    made: 0,
    // Fails when it is asked to subscribe, or to let go.
    cannotSubscribe: false,
    cannotDrop: false,
  };
  // The turn that the tabs of the browser take: one piece of work at a time, in the order asked.
  let turn: Promise<unknown> = Promise.resolve();
  const browser: PushBrowser = {
    ability: () => "able",
    leave: () => state.leave,
    askLeave: async () => {
      calls.push("ask");
      if (state.leave === "default") state.leave = start.answer ?? "granted";
      return state.leave;
    },
    held: async () => state.held,
    hasWorker: async () => state.hasWorker,
    subscribe: async (publicKey) => {
      calls.push(`subscribe ${publicKey}`);
      if (state.cannotSubscribe) throw new Error("the push service did not answer");
      // A browser gives back the subscription it holds, unless it was made for another key.
      if (!state.held || state.held.madeFor !== publicKey) {
        state.made += 1;
        state.held = {
          ...subscriptionAt(`https://push.example/new-${state.made}`),
          madeFor: publicKey,
        };
      }
      state.hasWorker = true;
      const { endpoint, keys } = state.held;
      return { endpoint, keys };
    },
    drop: async () => {
      calls.push("drop");
      if (state.cannotDrop) throw new Error("the browser did not let go");
      state.held = null;
      state.hasWorker = false;
    },
    label: () => "Firefox · Linux",
    kept: () => state.kept,
    keep: (kept) => {
      state.kept = kept;
    },
    alone: (work) => {
      const mine = turn.then(() => {
        calls.push("alone");
        return work();
      });
      turn = mine.catch(() => undefined);
      return mine;
    },
  };
  return { browser, state, calls };
}

/**
 * An API that keeps devices as the real one does. `devices` holds Ana's, each device's address
 * by its id, and Ana is who is signed in until a test says that another account is: that one's
 * devices are kept apart, and it reads and changes nothing of hers. `state` says how the API
 * answers: `down`, it gives no answer, and `deaf`, it does what it is asked and its answer is
 * lost.
 */
export function testPushApi(start: { key?: string | null; devices?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const devices = new Map(Object.entries(start.devices ?? {}));
  const others = new Map<string, Map<string, string>>();
  // The devices of whoever is signed in.
  const mine = () => {
    if (state.account === "ana") return devices;
    const theirs = others.get(state.account) ?? new Map<string, string>();
    others.set(state.account, theirs);
    return theirs;
  };
  const state = {
    key: start.key === undefined ? TEST_PUSH_KEY : start.key,
    // Whose session the requests come with.
    account: "ana",
    down: false,
    deaf: false,
    full: false,
    // Refuses whatever it is asked, as an API that answers and writes nothing.
    refusing: false,
    made: 0,
  };
  const reached = () => {
    if (state.down) throw new Error("the API did not answer");
    if (state.refusing) throw new PushRefused();
  };
  const heard = () => {
    if (state.deaf) throw new Error("the answer was lost");
  };
  // A page that acts for another account than the one that is signed in is refused.
  const acting = (account: string) => {
    if (account !== state.account) throw new PushRefused("other-account");
  };
  const listed = (id: string): PushDevice => ({
    id,
    label: "Firefox · Linux",
    createdAt: new Date("2026-10-12T08:00:00Z"),
    seenAt: new Date("2026-10-12T08:00:00Z"),
  });
  const api: PushApi = {
    signedIn: async () => {
      calls.push("signedIn");
      reached();
      return state.account;
    },
    key: async () => {
      calls.push("key");
      reached();
      return state.key;
    },
    devices: async () => {
      calls.push("devices");
      reached();
      return [...mine().keys()].map(listed);
    },
    subscribe: async (given, account) => {
      calls.push(`subscribe ${given.endpoint} as ${given.label}`);
      reached();
      acting(account);
      if (state.full) return "full";
      // One device for an address, as the API keeps them.
      const known = [...mine()].find(([, address]) => address === given.endpoint)?.[0];
      state.made += known ? 0 : 1;
      const id = known ?? `device-${state.made}`;
      mine().set(id, given.endpoint);
      heard();
      return { id };
    },
    renew: async (id, given, account) => {
      calls.push(`renew ${id} ${given.endpoint}`);
      reached();
      acting(account);
      // The device of that id, or else the one that has the address.
      const byAddress = [...mine()].find(([, address]) => address === given.endpoint)?.[0];
      const known = id !== null && mine().has(id) ? id : byAddress;
      if (known === undefined) return "gone";
      mine().set(known, given.endpoint);
      heard();
      return { id: known };
    },
    forget: async (endpoint, account) => {
      calls.push(`forget ${endpoint}`);
      reached();
      acting(account);
      for (const [id, address] of mine()) if (address === endpoint) mine().delete(id);
      heard();
    },
    remove: async (id, account) => {
      calls.push(`remove ${id}`);
      reached();
      acting(account);
      mine().delete(id);
      heard();
    },
  };
  return { api, devices, state, calls };
}
