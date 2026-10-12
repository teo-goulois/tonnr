/**
 * Push on this device: decision 031, "Push". What a browser can do about it, what it holds, and
 * what switching push on and off does, there and in the API. The browser and the API are given
 * to each function, so that a test stands for both: `testBrowser` and `testPushApi`, in
 * `push-testing.ts`. `thisBrowser`, below, and `pushApi`, in `push-api.ts`, are the real ones.
 */

/** What a browser gives of its subscription, as the API takes it. */
export type PushSubscriptionGiven = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** A browser the account's alerts are pushed to, as the API lists it: never its address. */
export type PushDevice = { id: string; label: string | null; createdAt: Date; seenAt: Date };

/**
 * Whether a browser can be sent a push: it can, it could once the app is on the Home Screen, as
 * on an iPhone, or it cannot.
 */
export type PushAbility = "able" | "home-screen" | "unable";

/** Whether the user lets the browser notify: the browser's own three answers. */
export type PushLeave = "default" | "granted" | "denied";

/**
 * What a browser keeps of push between visits. The account is how a browser knows, without
 * asking anyone, that what it holds was left by another.
 */
export type PushKept = {
  // The id of the device this browser is, as the API named it. Null while the API has not
  // answered which device it is.
  id: string | null;
  // The account the subscription was made for.
  account: string;
  // The address the browser had when it let go and the API could not be told: what names the
  // device to the API when there is no id, to have it forgotten at the next load.
  gone?: string;
};

/** The browser's part of push. */
export type PushBrowser = {
  ability: () => PushAbility;
  leave: () => PushLeave;
  /** Asks the user. It must be the first thing a press does: a browser asks only then. */
  askLeave: () => Promise<PushLeave>;
  /**
   * The subscription the browser holds, with the instance's key it was made for when the
   * browser says which. Null when it holds none.
   */
  held: () => Promise<(PushSubscriptionGiven & { madeFor: string | null }) | null>;
  /** Whether the service worker is registered: push was switched on here, and not off since. */
  hasWorker: () => Promise<boolean>;
  /**
   * Registers the service worker and subscribes with the instance's key. A subscription made
   * for another key gives way first.
   */
  subscribe: (publicKey: string) => Promise<PushSubscriptionGiven>;
  /** Lets go of the subscription and of the service worker. */
  drop: () => Promise<void>;
  /** What the browser calls itself, such as "Firefox · Android". */
  label: () => string | null;
  kept: () => PushKept | null;
  keep: (kept: PushKept | null) => void;
  /**
   * Runs what reads and changes the above while no other tab of the browser does: two tabs
   * share one subscription, and one must not let go of what the other has just made.
   */
  alone: <Result>(work: () => Promise<Result>) => Promise<Result>;
};

/**
 * The API answered, and refused: it wrote nothing. Anything else an API's function throws means
 * that no answer came, and that what was asked may have been done all the same. `why` tells a
 * refusal of what was asked from one of who asks: no account is signed in any more, or another
 * is than the one the page acts for. The page is then behind, and what the browser holds is not
 * its own to change.
 */
export class PushRefused extends Error {
  constructor(readonly why: "refused" | "signed-out" | "other-account" = "refused") {
    super("The API refused");
  }

  get isBehind() {
    return this.why !== "refused";
  }
}

/**
 * The API's part of push, for the account that is signed in. What changes something names the
 * account the page acts for: the API refuses when another is signed in by then, as when
 * someone signs in from another tab.
 */
export type PushApi = {
  /** The account that is signed in, as the API has it now. Null when no one is. */
  signedIn: () => Promise<string | null>;
  /** The public key of the instance's pair. Null when it sends no push. */
  key: () => Promise<string | null>;
  devices: () => Promise<PushDevice[]>;
  /** Makes this browser a device of the account. "full" when the account can keep no more. */
  subscribe: (
    given: PushSubscriptionGiven & { label?: string },
    account: string,
  ) => Promise<{ id: string } | "full">;
  /**
   * Says again what this browser holds, for the device it is: the one of that id, or without
   * one the device of the account that has the address. "gone" when the account has neither.
   * It never makes a device.
   */
  renew: (
    id: string | null,
    given: PushSubscriptionGiven & { label?: string },
    account: string,
  ) => Promise<{ id: string } | "gone">;
  /** Forgets the device of the account that has this address, if it has one. */
  forget: (endpoint: string, account: string) => Promise<unknown>;
  /** Removes a device by its id. One that is gone already is no failure. */
  remove: (id: string, account: string) => Promise<unknown>;
};

/** Whether push is on in this browser, and which of the account's devices it then is. */
export type PushHere = { on: boolean; deviceId: string | null };

/** Why push stayed off when it was switched on. */
export type PushRefusal = "refused" | "dismissed" | "full" | "failed";

const OFF: PushHere = { on: false, deviceId: null };
const nothing = () => undefined;

export type BrowserFacts = {
  hasWorker: boolean;
  hasPush: boolean;
  hasNotification: boolean;
  userAgent: string;
  touchPoints: number;
  // Whether the page runs as an app opened from the Home Screen.
  isStandalone: boolean;
};

// An iPad says that it is a Mac. A Mac has no touch screen.
const isAppleTouch = ({
  userAgent,
  touchPoints,
}: Pick<BrowserFacts, "userAgent" | "touchPoints">) =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);

/** What a browser can do about push, from what it says of itself. */
export function abilityOf(facts: BrowserFacts): PushAbility {
  if (facts.hasWorker && facts.hasPush && facts.hasNotification) return "able";
  // An iPhone gives push to a web app only once it is on the Home Screen.
  return isAppleTouch(facts) && !facts.isStandalone ? "home-screen" : "unable";
}

// The first that matches wins: every browser built on Chrome says "Chrome" too, and Chrome says
// "Safari".
const BROWSERS: [name: string, sign: RegExp][] = [
  ["Edge", /Edg(e|A|iOS)?\//],
  ["Opera", /OPR\//],
  ["Samsung Internet", /SamsungBrowser\//],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\//],
  ["Safari", /Safari\//],
];
const SYSTEMS: [name: string, sign: RegExp][] = [
  ["iPhone", /iPhone|iPod/],
  ["iPad", /iPad/],
  ["Android", /Android/],
  ["Windows", /Windows/],
  ["ChromeOS", /CrOS/],
  ["macOS", /Macintosh|Mac OS X/],
  ["Linux", /Linux/],
];

/**
 * What a browser is called in the list of an account's devices: its name and its system, such
 * as "Safari · iPhone". Null when it says neither. The names are the same in every language.
 */
export function deviceLabel(userAgent: string, touchPoints = 0) {
  const named = (names: [string, RegExp][]) => names.find(([, sign]) => sign.test(userAgent))?.[0];
  const system =
    isAppleTouch({ userAgent, touchPoints }) && !/iPhone|iPod/.test(userAgent)
      ? "iPad"
      : named(SYSTEMS);
  const label = [named(BROWSERS), system].filter(Boolean).join(" · ");
  return label === "" ? null : label;
}

function labelOf(browser: PushBrowser) {
  const label = browser.label();
  return label === null ? {} : { label };
}

/**
 * Puts this browser and the API in agreement when the app loads, for the account that is signed
 * in. A browser that holds a subscription says so again, since a push service changes an
 * address now and then. One whose device was removed from another, or that another account
 * left subscribed, lets go. One that let go while the API was not told has its device removed.
 * It never makes a device: only a press on the switch does.
 */
export function settlePush(browser: PushBrowser, api: PushApi, account: string): Promise<PushHere> {
  if (browser.ability() !== "able") return Promise.resolve(OFF);
  return browser.alone(() => settle(browser, api, account));
}

async function settle(browser: PushBrowser, api: PushApi, account: string): Promise<PushHere> {
  let kept = browser.kept();
  if (kept !== null && kept.account !== account) {
    // What the browser keeps is another account's, and so what it holds is not the page's own.
    if (await isBehind(api, account)) return OFF;
    // That account left it here. It goes before anything else is asked: no one is sent another
    // account's alerts. Its device is that account's to list: the push service will say that
    // it is gone.
    await browser.drop();
    browser.keep(null);
    kept = null;
  }
  const hasLeave = browser.leave() === "granted";
  const held = hasLeave ? await browser.held() : null;
  // The service worker without a subscription, in a browser that was not switched off: the
  // browser dropped the subscription this device had.
  const dropped =
    hasLeave && !held && kept !== null && kept.gone === undefined && (await browser.hasWorker());

  if (!held && !dropped) {
    // Push is off here. A device this browser was, and that the API still lists, goes.
    if (kept !== null) await retire(browser, api, kept);
    return OFF;
  }

  // Whether a subscription was made here, which the API has then to confirm.
  let isNew = false;
  try {
    const key = await api.key();
    // The instance sends no push any more.
    if (key === null) return await off(browser, api, account);
    // Signing out does not wait for its turn. When it happened while the key was asked,
    // nothing is said again and nothing is made.
    if (!isSame(browser.kept(), kept)) return OFF;

    const isForKey = held !== null && (held.madeFor === null || held.madeFor === key);
    isNew = !isForKey;
    const { endpoint, keys } = isForKey ? held : await browser.subscribe(key);
    // By the id it kept. A browser that kept none is the device that has its address, if the
    // account has one: a device that was removed is not made again.
    const device = await api.renew(
      kept?.id ?? null,
      { endpoint, keys, ...labelOf(browser) },
      account,
    );
    if (device === "gone") {
      // Removed from another device, or the browser is another account's now.
      await browser.drop();
      browser.keep(null);
      return OFF;
    }
    browser.keep({ id: device.id, account });
    return { on: true, deviceId: device.id };
  } catch (error) {
    if (error instanceof PushRefused && error.isBehind) {
      // The page is behind: another account is signed in by now, or none. What the browser
      // holds is not this page's to change, but for what it has just made itself.
      if (isNew) await browser.drop().catch(nothing);
      if (isNew || kept === null || error.why === "other-account") return OFF;
      // No one is signed in any more: the device stays its account's, and is said again when
      // that account next opens the app.
      const still = await browser.held().catch(() => null);
      return { on: still !== null, deviceId: still === null ? null : kept.id };
    }
    if (error instanceof PushRefused) {
      // The API will not take what the browser holds: the device ends here.
      if (kept !== null) await retire(browser, api, kept);
      else await browser.drop().catch(nothing);
      return OFF;
    }
    // No answer. A browser that does not know whose device it is lets go: what it holds may
    // be another account's.
    if (kept === null) {
      await browser.drop().catch(nothing);
      return OFF;
    }
    // One that knows stays as it is, and says so again next time.
    const still = await browser.held().catch(() => null);
    return { on: still !== null, deviceId: still === null ? null : kept.id };
  }
}

/**
 * Whether the page is behind: another account than its own is signed in by now, or none, as
 * when someone signs in from another tab. It is asked when the browser keeps another account's
 * subscription, which is the sign of it: that subscription is then the other account's own, and
 * not something it left. When no one can say, the page is taken to be right, so that no one is
 * sent another account's alerts.
 */
async function isBehind(api: PushApi, account: string) {
  return (await api.signedIn().catch(() => account)) !== account;
}

const isSame = (one: PushKept | null, other: PushKept | null) =>
  one?.id === other?.id && one?.account === other?.account && one?.gone === other?.gone;

// Ends a device this browser was: the browser lets go, and the API removes it. What names the
// device is kept until the API has answered, so that the next load asks again.
async function retire(browser: PushBrowser, api: PushApi, kept: PushKept) {
  await browser.drop().catch(nothing);
  await told(api, kept, null, kept.account).then(() => browser.keep(null), nothing);
}

// Has the API forget the device this browser is: by its id, and by the address the browser
// holds or held. The two are one device, unless the address changed while the API could not be
// told, or the API never said which device the browser is.
async function told(
  api: PushApi,
  kept: PushKept | null,
  held: PushSubscriptionGiven | null,
  account: string,
) {
  if (kept?.id) await api.remove(kept.id, account);
  for (const address of new Set([held?.endpoint, kept?.gone])) {
    if (address !== undefined) await api.forget(address, account);
  }
}

// What names to the API a device that the browser let go of and the API was not told of.
function leftover(
  kept: PushKept | null,
  held: PushSubscriptionGiven | null,
  account: string,
): PushKept | null {
  const id = kept?.account === account ? kept.id : null;
  const gone = held?.endpoint ?? (kept?.account === account ? kept.gone : undefined);
  if (id === null && gone === undefined) return null;
  return { id, account, ...(gone === undefined ? {} : { gone }) };
}

/**
 * Switches push on in this browser: asks its user, subscribes with the instance's key, and
 * makes the browser a device of the account. Called from a press, and it asks for leave before
 * it waits for anything else.
 */
export async function switchPushOn(
  browser: PushBrowser,
  api: PushApi,
  publicKey: string,
  account: string,
): Promise<PushHere & { why?: PushRefusal }> {
  const leave = await browser.askLeave();
  if (leave !== "granted") return { ...OFF, why: leave === "denied" ? "refused" : "dismissed" };

  return browser.alone(async () => {
    const found = browser.kept();
    const failed = { ...OFF, why: "failed" as const };
    // The browser holds another account's subscription, which signed in from another tab since
    // this page was opened: it is not this page's to take.
    if (found !== null && found.account !== account && (await isBehind(api, account))) {
      return failed;
    }
    // What this browser was before, when it was this account's.
    const before = leftover(found, null, account);
    let given: PushSubscriptionGiven & { label?: string };
    try {
      const { endpoint, keys } = await browser.subscribe(publicKey);
      given = { endpoint, keys, ...labelOf(browser) };
    } catch {
      // Nothing is left half made.
      await browser.drop().catch(nothing);
      return failed;
    }

    let device: { id: string } | "full" | "gone";
    try {
      device = await api.subscribe(given, account);
    } catch (error) {
      // The API says that it made nothing.
      if (error instanceof PushRefused) {
        await browser.drop().catch(nothing);
        return failed;
      }
      // No answer came: the API may have made the device all the same. It is asked which
      // device has the address, and makes none by that.
      try {
        device = await api.renew(null, given, account);
      } catch (again) {
        if (again instanceof PushRefused && !again.isBehind) {
          // It answers, and will not say: it is asked to forget the address, and the browser
          // lets go.
          await api.forget(given.endpoint, account).catch(nothing);
          await browser.drop().catch(nothing);
        } else {
          // Still no answer: the browser keeps what it made, and for whom, so that the device
          // the API may have is not left with an address that is gone. The next press, or
          // the next load, settles it by the address.
          browser.keep({ ...before, id: before?.id ?? null, account });
        }
        return failed;
      }
    }
    if (device === "full" || device === "gone") {
      // A browser that subscribed and is no device would be sent nothing, and say it is on.
      await browser.drop().catch(nothing);
      return device === "full" ? { ...OFF, why: "full" as const } : failed;
    }
    browser.keep({ id: device.id, account });
    // What this browser was before, that the API was never told to forget.
    const stale: PushKept = {
      id: before?.id === device.id ? null : (before?.id ?? null),
      account,
      ...(before?.gone === undefined || before.gone === given.endpoint
        ? {}
        : { gone: before.gone }),
    };
    await told(api, stale, null, account).catch(nothing);
    return { on: true, deviceId: device.id };
  });
}

/**
 * Switches push off in this browser: the browser lets go first, since that is what stops the
 * notifications whatever the API answers, then the API forgets. When the API could not be told,
 * what names the device to it is kept, and the next load has it removed.
 */
export function switchPushOff(
  browser: PushBrowser,
  api: PushApi,
  account: string,
): Promise<PushHere> {
  if (browser.ability() !== "able") return Promise.resolve(OFF);
  return browser.alone(() => off(browser, api, account));
}

async function off(browser: PushBrowser, api: PushApi, account: string): Promise<PushHere> {
  const kept = browser.kept();
  // Another account's subscription, which signed in from another tab since this page was
  // opened: it is that account's to switch off.
  if (kept !== null && kept.account !== account && (await isBehind(api, account))) return OFF;
  const held = await browser.held().catch(() => null);
  await browser.drop();
  await told(api, kept, held, account).then(
    () => browser.keep(null),
    () => browser.keep(leftover(kept, held, account)),
  );
  return OFF;
}

/**
 * What a browser does once its account has signed out there. The API forgot the device with the
 * session it was kept with, so nothing is asked of it: the browser lets go at once, without
 * waiting for its turn, since nothing of that account may stay subscribed in any tab. It lets
 * go once more when its turn comes: a tab that was settling meanwhile may have subscribed again.
 */
export async function leftPush(browser: PushBrowser) {
  if (browser.ability() !== "able") return;
  await browser.drop().catch(nothing);
  browser.keep(null);
  void browser.alone(() => browser.drop()).catch(nothing);
}

const WORKER = "/sw.js";
/** Where the browser keeps the device it is. Another tab that changes it says so. */
export const PUSH_DEVICE_KEY = "tonnr:push-device";
// What the tabs of the browser take in turn, to read and change what they share of push.
const LOCK = "tonnr:push";
// An id as the API makes them: anything else in its place was not kept by this app.
const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// How long the service worker is given to start. One that never does must not leave the switch
// waiting.
const WORKER_WAIT_MS = 10_000;

// A key as the standard writes it for the web: base64 with `-` and `_`, and no padding.
function bytesOf(text: string) {
  const plain = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(plain, (character) => character.charCodeAt(0));
}
function textOf(bytes: ArrayBuffer) {
  const plain = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(plain).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function given(subscription: PushSubscription): PushSubscriptionGiven {
  const { keys } = subscription.toJSON();
  if (!keys?.p256dh || !keys.auth) throw new Error("The browser gave a subscription without keys");
  return { endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

// The registration of this app's service worker, when it has one.
const registered = () => navigator.serviceWorker.getRegistration("/");

/** What was kept, when it is what this app keeps: null for anything else. */
export function readKept(stored: string | null): PushKept | null {
  try {
    const kept: unknown = JSON.parse(stored ?? "null");
    if (typeof kept !== "object" || kept === null) return null;
    const { id, account, gone } = kept as Record<string, unknown>;
    if (id !== null && (typeof id !== "string" || !ID.test(id))) return null;
    if (typeof account !== "string" || account === "") return null;
    return { id, account, ...(typeof gone === "string" && gone !== "" ? { gone } : {}) };
  } catch {
    return null;
  }
}

/** This browser. */
export const thisBrowser: PushBrowser = {
  ability: () =>
    typeof window === "undefined"
      ? "unable"
      : abilityOf({
          hasWorker: "serviceWorker" in navigator,
          hasPush: "PushManager" in window,
          hasNotification: "Notification" in window,
          userAgent: navigator.userAgent,
          touchPoints: navigator.maxTouchPoints,
          isStandalone:
            (navigator as Navigator & { standalone?: boolean }).standalone === true ||
            window.matchMedia("(display-mode: standalone)").matches,
        }),
  leave: () => Notification.permission,
  askLeave: () =>
    new Promise<PushLeave>((resolve, reject) => {
      // An older Safari answers through the function it is given, and returns nothing.
      const asked = Notification.requestPermission(resolve) as Promise<PushLeave> | undefined;
      asked?.then(resolve, reject);
    }),
  held: async () => {
    const subscription = await (await registered())?.pushManager.getSubscription();
    if (!subscription) return null;
    const key = subscription.options.applicationServerKey;
    return { ...given(subscription), madeFor: key ? textOf(key) : null };
  },
  hasWorker: async () => (await registered()) !== undefined,
  subscribe: async (publicKey) => {
    const registration = await navigator.serviceWorker.register(WORKER, { scope: "/" });
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("The service worker did not start")), WORKER_WAIT_MS),
      ),
    ]);
    const before = await registration.pushManager.getSubscription();
    const madeFor = before?.options.applicationServerKey;
    // A browser refuses to subscribe with a key while it holds a subscription made for another.
    if (before && madeFor && textOf(madeFor) !== publicKey) await before.unsubscribe();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytesOf(publicKey),
    });
    return given(subscription);
  },
  drop: async () => {
    const registration = await registered();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
    await registration.unregister();
  },
  label: () => deviceLabel(navigator.userAgent, navigator.maxTouchPoints),
  kept: () => {
    try {
      return readKept(localStorage.getItem(PUSH_DEVICE_KEY));
    } catch {
      return null;
    }
  },
  keep: (kept) => {
    try {
      if (kept === null) localStorage.removeItem(PUSH_DEVICE_KEY);
      else localStorage.setItem(PUSH_DEVICE_KEY, JSON.stringify(kept));
    } catch {
      // A browser that keeps nothing is known again by its address at each load.
    }
  },
  // A browser without locks runs it at once: its tabs then take their chances.
  alone: (work) => ("locks" in navigator ? navigator.locks.request(LOCK, work) : work()),
};
