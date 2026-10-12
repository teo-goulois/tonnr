import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUSH_DEVICE_KEY, thisBrowser } from "./push";

// `thisBrowser` against what a browser gives: a service worker, a push manager, notifications,
// its storage and its locks, each stood for here. What is asked of them is listed in `did`.

const KEY_BYTES = Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index));
const text = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const KEY = text(KEY_BYTES);
const OTHER_KEY = text(KEY_BYTES.map((byte) => (byte + 1) % 256));
const ID = "0b9c1f0e-6f1c-4c7e-9a43-2f1d6b7a8c90";

type Fake = ReturnType<typeof fakeBrowser>;
function fakeBrowser() {
  const did: string[] = [];
  const state = {
    // The key the subscription the browser holds was made for. Undefined when it holds none.
    madeFor: undefined as Uint8Array | null | undefined,
    isRegistered: false,
    endpoint: "https://push.example/held",
    cannotUnsubscribe: false,
    // A service worker that never starts.
    neverReady: false,
  };
  const subscription = () =>
    state.madeFor === undefined
      ? null
      : {
          endpoint: state.endpoint,
          options: { applicationServerKey: state.madeFor?.buffer ?? null },
          toJSON: () => ({
            endpoint: state.endpoint,
            keys: { p256dh: "the-p256dh", auth: "the-auth" },
          }),
          unsubscribe: async () => {
            did.push("unsubscribe");
            if (state.cannotUnsubscribe) throw new Error("the push service did not answer");
            state.madeFor = undefined;
            return true;
          },
        };
  const registration = {
    pushManager: {
      getSubscription: async () => subscription(),
      subscribe: async (options: {
        userVisibleOnly: boolean;
        applicationServerKey: Uint8Array;
      }) => {
        did.push(
          `subscribe visible=${options.userVisibleOnly} key=${text(options.applicationServerKey)}`,
        );
        if (state.madeFor && text(state.madeFor) !== text(options.applicationServerKey)) {
          throw new DOMException("made for another key", "InvalidStateError");
        }
        if (state.madeFor === undefined) state.endpoint = "https://push.example/new";
        state.madeFor = options.applicationServerKey;
        return subscription();
      },
    },
    unregister: async () => {
      did.push("unregister");
      state.isRegistered = false;
      return true;
    },
  };
  const serviceWorker = {
    getRegistration: async (scope: string) => {
      did.push(`getRegistration ${scope}`);
      return state.isRegistered ? registration : undefined;
    },
    register: async (script: string, options: { scope: string }) => {
      did.push(`register ${script} scope=${options.scope}`);
      state.isRegistered = true;
      return registration;
    },
    get ready() {
      return state.neverReady ? new Promise(() => undefined) : Promise.resolve(registration);
    },
  };
  return { did, state, serviceWorker };
}

let fake: Fake;
const asked = () => fake.did.filter((one) => !one.startsWith("getRegistration"));
const define = (target: object, name: string, value: unknown) =>
  Object.defineProperty(target, name, { value, configurable: true, writable: true });

beforeEach(() => {
  fake = fakeBrowser();
  define(navigator, "serviceWorker", fake.serviceWorker);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "default" });
  // A page in a tab, not an app opened from the Home Screen.
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(navigator, "locks");
});

describe("this browser", () => {
  describe("says what it can do", () => {
    it("everything, with a service worker, push and notifications", () => {
      expect(thisBrowser.ability()).toBe("able");
    });

    it("nothing without one of them", () => {
      vi.stubGlobal("PushManager", undefined);
      Reflect.deleteProperty(window, "PushManager");

      expect(thisBrowser.ability()).toBe("unable");
    });
  });

  describe("asked for its user's leave", () => {
    it("gives the answer of a browser that answers by a promise", async () => {
      vi.stubGlobal("Notification", {
        permission: "default",
        requestPermission: async () => "granted",
      });

      expect(await thisBrowser.askLeave()).toBe("granted");
    });

    it("gives the answer of a browser that answers through the function it is given", async () => {
      vi.stubGlobal("Notification", {
        permission: "default",
        requestPermission: (answer: (leave: string) => void) => void answer("denied"),
      });

      expect(await thisBrowser.askLeave()).toBe("denied");
    });

    it("reads the leave it has", () => {
      vi.stubGlobal("Notification", { permission: "denied" });

      expect(thisBrowser.leave()).toBe("denied");
    });
  });

  describe("asked what it holds", () => {
    it("holds nothing without a service worker, or without a subscription", async () => {
      expect([await thisBrowser.held(), await thisBrowser.hasWorker()]).toEqual([null, false]);

      fake.state.isRegistered = true;
      expect([await thisBrowser.held(), await thisBrowser.hasWorker()]).toEqual([null, true]);
      // It asks for the registration of the whole app.
      expect(fake.did).toContain("getRegistration /");
    });

    it("gives its subscription as the API takes it, with the key it was made for", async () => {
      fake.state.isRegistered = true;
      fake.state.madeFor = KEY_BYTES;

      expect(await thisBrowser.held()).toEqual({
        endpoint: "https://push.example/held",
        keys: { p256dh: "the-p256dh", auth: "the-auth" },
        madeFor: KEY,
      });
    });

    it("says that it does not know the key, in a browser that does not say it", async () => {
      fake.state.isRegistered = true;
      fake.state.madeFor = null;

      expect((await thisBrowser.held())?.madeFor).toBeNull();
    });
  });

  describe("subscribing", () => {
    it("registers the service worker for the whole app, waits for it, and subscribes with the key", async () => {
      expect(await thisBrowser.subscribe(KEY)).toEqual({
        endpoint: "https://push.example/new",
        keys: { p256dh: "the-p256dh", auth: "the-auth" },
      });

      // A push that is always shown, signed for by the instance's key.
      expect(asked()).toEqual(["register /sw.js scope=/", `subscribe visible=true key=${KEY}`]);
    });

    it("keeps a subscription that was made for the same key", async () => {
      fake.state.isRegistered = true;
      fake.state.madeFor = KEY_BYTES;

      expect((await thisBrowser.subscribe(KEY)).endpoint).toBe("https://push.example/held");
      expect(asked()).not.toContain("unsubscribe");
    });

    it("lets go first of a subscription that was made for another key", async () => {
      fake.state.isRegistered = true;
      fake.state.madeFor = KEY_BYTES;

      expect((await thisBrowser.subscribe(OTHER_KEY)).endpoint).toBe("https://push.example/new");
      expect(asked()).toEqual([
        "register /sw.js scope=/",
        "unsubscribe",
        `subscribe visible=true key=${OTHER_KEY}`,
      ]);
    });

    it("gives up on a service worker that never starts", async () => {
      vi.useFakeTimers();
      fake.state.neverReady = true;

      const subscribing = thisBrowser.subscribe(KEY).then(
        () => "subscribed",
        (error: Error) => error.message,
      );
      await vi.advanceTimersByTimeAsync(10_000);

      expect(await subscribing).toBe("The service worker did not start");
      expect(asked()).toEqual(["register /sw.js scope=/"]);
    });
  });

  describe("letting go", () => {
    it("lets go of the subscription, then of the service worker", async () => {
      fake.state.isRegistered = true;
      fake.state.madeFor = KEY_BYTES;

      await thisBrowser.drop();

      expect(asked()).toEqual(["unsubscribe", "unregister"]);
      expect([await thisBrowser.held(), await thisBrowser.hasWorker()]).toEqual([null, false]);
    });

    it("lets go of a service worker that has no subscription", async () => {
      fake.state.isRegistered = true;

      await thisBrowser.drop();

      expect(asked()).toEqual(["unregister"]);
    });

    it("does nothing where there is nothing", async () => {
      await thisBrowser.drop();

      expect(asked()).toEqual([]);
    });

    it("fails when the subscription does not go, and keeps the service worker to try again", async () => {
      fake.state.isRegistered = true;
      fake.state.madeFor = KEY_BYTES;
      fake.state.cannotUnsubscribe = true;

      await expect(thisBrowser.drop()).rejects.toThrow("did not answer");

      expect(asked()).toEqual(["unsubscribe"]);
      expect(await thisBrowser.hasWorker()).toBe(true);
    });
  });

  describe("keeping which device it is", () => {
    it("keeps it between visits, and forgets it", () => {
      const kept = { id: ID, account: "ana" };

      thisBrowser.keep(kept);
      expect(JSON.parse(localStorage.getItem(PUSH_DEVICE_KEY) ?? "null")).toEqual(kept);
      expect(thisBrowser.kept()).toEqual(kept);

      thisBrowser.keep(null);
      expect([localStorage.getItem(PUSH_DEVICE_KEY), thisBrowser.kept()]).toEqual([null, null]);
    });

    it("takes for nothing what this app did not keep", () => {
      localStorage.setItem(PUSH_DEVICE_KEY, "a-device-of-another-shape");

      expect(thisBrowser.kept()).toBeNull();
    });

    it("goes on in a browser that keeps nothing", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new DOMException("no storage", "SecurityError");
        },
        setItem: () => {
          throw new DOMException("no storage", "SecurityError");
        },
        removeItem: () => {
          throw new DOMException("no storage", "SecurityError");
        },
      });

      expect(() => thisBrowser.keep({ id: ID, account: "ana" })).not.toThrow();
      expect(() => thisBrowser.keep(null)).not.toThrow();
      expect(thisBrowser.kept()).toBeNull();
    });
  });

  describe("taking its turn among the tabs", () => {
    it("asks the browser for the one lock of push, and gives back what was done under it", async () => {
      const taken: string[] = [];
      define(navigator, "locks", {
        request: async (name: string, work: () => Promise<unknown>) => {
          taken.push(name);
          return work();
        },
      });

      expect(await thisBrowser.alone(async () => "done")).toBe("done");
      expect(taken).toEqual(["tonnr:push"]);
    });

    it("acts at once in a browser that has no locks", async () => {
      expect("locks" in navigator).toBe(false);

      expect(await thisBrowser.alone(async () => "done")).toBe("done");
    });
  });

  it("says what it is called", () => {
    // jsdom names itself, which is neither a browser nor a system this app knows the name of.
    expect(thisBrowser.label()).toBeNull();
  });
});
