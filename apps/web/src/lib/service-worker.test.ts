// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The service worker is served as it is written, from `public/`: the test reads that file and
// runs it in a scope of its own making.
const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://app.example.org";

type Shown = {
  title: string;
  options: { body: string; icon: string; tag?: string; renotify?: boolean; data: { url: string } };
};
type Window = {
  url: string;
  focused: boolean;
  visibilityState: "visible" | "hidden";
  // A window the worker does not control refuses to be led anywhere, until the worker takes it.
  controlled?: boolean;
  // A window that cannot be led, whoever asks.
  stuck?: boolean;
};

function worker(open: Window[] = [], language = "en-GB") {
  const listeners = new Map<string, (event: never) => void>();
  const shown: Shown[] = [];
  const did: string[] = [];
  let refusesFirst = false;
  let cannotClaim = false;
  const windows = open.map((one) => {
    const client = {
      ...one,
      navigate: async (url: string) => {
        if (client.controlled === false || one.stuck) {
          throw new TypeError("not this worker's window");
        }
        did.push(`navigate ${one.url} to ${url}`);
        client.url = url;
        return client;
      },
      focus: async () => {
        did.push(`focus ${client.url}`);
        return client;
      },
    };
    return client;
  });
  const scope = {
    location: { origin: ORIGIN },
    navigator: { language },
    addEventListener: (type: string, listener: (event: never) => void) =>
      listeners.set(type, listener),
    skipWaiting: () => did.push("skipWaiting"),
    registration: {
      showNotification: async (title: string, options: Shown["options"]) => {
        if (refusesFirst) {
          refusesFirst = false;
          throw new TypeError("the browser refused these options");
        }
        shown.push({ title, options });
      },
    },
    clients: {
      // The worker takes the windows that are open.
      claim: async () => {
        did.push("claim");
        if (cannotClaim) throw new DOMException("not the active worker", "InvalidStateError");
        for (const one of windows) one.controlled = true;
      },
      matchAll: async () => windows,
      openWindow: async (url: string) => void did.push(`open ${url}`),
    },
  };
  // The worker's file is a script, not a module: it is run as one, with this scope as `self`.
  new Function("self", source)(scope);

  // An event as the browser gives it: what the worker waits for is awaited here.
  const dispatch = async (type: string, event: object) => {
    const waited: Promise<unknown>[] = [];
    listeners.get(type)?.({
      ...event,
      waitUntil: (work: Promise<unknown>) => waited.push(work),
    } as never);
    await Promise.all(waited);
  };
  return {
    shown,
    did,
    listens: () => [...listeners.keys()].sort(),
    refuseOnce: () => {
      refusesFirst = true;
    },
    // The browser does not let the worker take the open windows.
    refuseClaim: () => {
      cannotClaim = true;
    },
    // What the browser does with a worker it has just fetched.
    start: async () => {
      await dispatch("install", {});
      await dispatch("activate", {});
    },
    // A push whose body is this text, or that has no body at all.
    push: (text?: string) =>
      dispatch("push", {
        data:
          text === undefined ? null : { json: () => JSON.parse(text) as unknown, text: () => text },
      }),
    press: async (data: unknown) => {
      let closed = false;
      await dispatch("notificationclick", {
        notification: { data, close: () => (closed = true) },
      });
      return closed;
    },
    // What a press did once the worker had taken the windows that are open.
    led: () => did.slice(did.indexOf("claim") + 1),
  };
}

const ALERT = {
  title: "The bay",
  body: "North: Sat 08:00 to 11:00",
  url: `${ORIGIN}/app?spot=north`,
  tag: "alert-1",
};
const PLAIN = {
  title: "One of your alerts has news",
  options: {
    body: "",
    icon: "/web-app-manifest-192x192.png",
    tag: "alert",
    renotify: true,
    data: { url: "/app" },
  },
};

describe("the service worker", () => {
  it("does two things and no more: it answers no request, and keeps nothing", () => {
    expect(worker().listens()).toEqual(["activate", "install", "notificationclick", "push"]);
    expect(source).not.toMatch(/caches|indexedDB|fetch/);
  });

  it("takes the place of the one before at once, with the pages that are open", async () => {
    const { did, start } = worker();

    await start();

    expect(did).toEqual(["skipWaiting", "claim"]);
  });

  describe("sent a push", () => {
    it("shows its title and its line, with the app's icon and its tag", async () => {
      const { shown, push } = worker();

      await push(JSON.stringify(ALERT));

      expect(shown).toEqual([
        {
          title: "The bay",
          options: {
            body: "North: Sat 08:00 to 11:00",
            icon: "/web-app-manifest-192x192.png",
            tag: "alert-1",
            // A newer word on the same thing takes the older one's place, as news.
            renotify: true,
            data: { url: `${ORIGIN}/app?spot=north` },
          },
        },
      ]);
    });

    it.each([
      ["nothing", undefined],
      ["what is no JSON", "the bay is on"],
      ["a text alone", '"the bay is on"'],
      ["nothing at all, as JSON", "null"],
      ["a list", "[1, 2]"],
      ["no title", JSON.stringify({ ...ALERT, title: undefined })],
      ["an empty title", JSON.stringify({ ...ALERT, title: "  " })],
      ["a title that is no text", JSON.stringify({ ...ALERT, title: 3 })],
      ["no line", JSON.stringify({ ...ALERT, body: undefined })],
      ["no page", JSON.stringify({ ...ALERT, url: undefined })],
      ["no tag", JSON.stringify({ ...ALERT, tag: null })],
    ])("shows a plain line for %s, and never drops it", async (_what, text) => {
      const { shown, push } = worker();

      await push(text);

      expect(shown).toEqual([PLAIN]);
    });

    it("says its plain line in French to a browser in French", async () => {
      const { shown, push } = worker([], "fr-FR");

      await push("not an alert");

      expect(shown.map((one) => one.title)).toEqual(["Une de tes alertes a du nouveau"]);
    });

    it("says it in Spanish or Portuguese to a browser in one of them", async () => {
      const spanish = worker([], "es-ES");
      const portuguese = worker([], "pt-PT");

      await spanish.push("not an alert");
      await portuguese.push("not an alert");

      expect(spanish.shown.map((one) => one.title)).toEqual(["Una de tus alertas tiene novedades"]);
      expect(portuguese.shown.map((one) => one.title)).toEqual([
        "Um dos teus alertas tem novidades",
      ]);
    });

    it("shows the plain line when the browser refuses what the push asked for", async () => {
      const { shown, push, refuseOnce } = worker();
      refuseOnce();

      await push(JSON.stringify(ALERT));

      expect(shown).toEqual([PLAIN]);
    });

    it("shows a push with no tag beside the others", async () => {
      const { shown, push } = worker();

      await push(JSON.stringify({ ...ALERT, tag: "" }));

      expect(shown[0]?.options).not.toHaveProperty("tag");
      expect(shown[0]?.options).not.toHaveProperty("renotify");
    });
  });

  describe("when a notification is pressed", () => {
    const page = `${ORIGIN}/app?spot=north`;
    const behind: Window = { url: `${ORIGIN}/app`, focused: false, visibilityState: "hidden" };

    it("closes it, and opens its page when no window of the app is open", async () => {
      const { led, press } = worker();

      expect(await press({ url: page })).toBe(true);

      expect(led()).toEqual([`open ${page}`]);
    });

    it("leads a window of the app that is open to the page, then brings it forward", async () => {
      const { led, press } = worker([behind]);

      await press({ url: page });

      expect(led()).toEqual([`navigate ${ORIGIN}/app to ${page}`, `focus ${page}`]);
    });

    it("takes the window in front, and leaves the others where they are", async () => {
      const front: Window = { url: `${ORIGIN}/fr/app`, focused: true, visibilityState: "visible" };
      const { led, press } = worker([behind, front]);

      await press({ url: page });

      expect(led()).toEqual([`navigate ${ORIGIN}/fr/app to ${page}`, `focus ${page}`]);
    });

    it("only brings forward a window that is at the page already", async () => {
      const { led, press } = worker([{ ...behind, url: page }]);

      await press({ url: page });

      expect(led()).toEqual([`focus ${page}`]);
    });

    it("takes first a window that was opened while the worker was let go of, then leads it", async () => {
      const { did, press } = worker([{ ...behind, controlled: false }]);

      await press({ url: page });

      expect(did).toEqual(["claim", `navigate ${ORIGIN}/app to ${page}`, `focus ${page}`]);
    });

    it("opens the page all the same when it cannot take the windows that are open", async () => {
      const { led, press, refuseClaim } = worker([{ ...behind, controlled: false }]);
      refuseClaim();

      await press({ url: page });

      expect(led()).toEqual([`open ${page}`]);
    });

    it("opens a window when the one that is open cannot be led", async () => {
      const { led, press } = worker([{ ...behind, stuck: true }]);

      await press({ url: page });

      expect(led()).toEqual([`open ${page}`]);
    });

    it("leaves alone a window of another site", async () => {
      const { led, press } = worker([{ ...behind, url: "https://elsewhere.example/app" }]);

      await press({ url: page });

      expect(led()).toEqual([`open ${page}`]);
    });

    it("takes a page given from the root of the web app", async () => {
      const { led, press } = worker();

      await press({ url: "/fr/app?spot=north" });

      expect(led()).toEqual([`open ${ORIGIN}/fr/app?spot=north`]);
    });

    it.each([
      ["another site", "https://elsewhere.example/app"],
      ["another site, written without its scheme", "//elsewhere.example/app"],
      ["another site, written with a backslash", "/\\elsewhere.example/app"],
      ["a script", "javascript:alert(1)"],
      ["no address", "http://"],
      ["nothing", undefined],
      ["an empty text", " "],
      ["what is no text", { href: "https://elsewhere.example" }],
    ])("opens the app's own page for %s", async (_what, url) => {
      const { led, press } = worker();

      await press({ url });

      expect(led()).toEqual([`open ${ORIGIN}/app`]);
    });

    it("opens the app's own page for a notification that names none", async () => {
      const { led, press } = worker();

      await press(null);

      expect(led()).toEqual([`open ${ORIGIN}/app`]);
    });
  });
});
