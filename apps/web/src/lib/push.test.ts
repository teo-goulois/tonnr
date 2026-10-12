import { describe, expect, it } from "vitest";

import {
  PushRefused,
  abilityOf,
  deviceLabel,
  leftPush,
  readKept,
  settlePush,
  switchPushOff,
  switchPushOn,
} from "./push";
import { TEST_PUSH_KEY as KEY, testBrowser, testPushApi } from "./push-testing";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

const OFF = { on: false, deviceId: null };
const HELD = "https://push.example/held";
// The account that is signed in, and the device its browser is.
const ANA = "ana";
const MINE = { id: "mine", account: ANA };
// A browser of Ana's with push on.
const on = (more: Parameters<typeof testBrowser>[0] = {}) =>
  testBrowser({ leave: "granted", held: { endpoint: HELD }, kept: MINE, ...more });

describe("what a browser can do about push", () => {
  const facts = {
    hasWorker: true,
    hasPush: true,
    hasNotification: true,
    userAgent: MAC_SAFARI,
    touchPoints: 0,
    isStandalone: false,
  };
  const without = { hasWorker: true, hasPush: false, hasNotification: false };

  it("is everything when it has a service worker, push and notifications", () => {
    expect(abilityOf(facts)).toBe("able");
    expect(abilityOf({ ...facts, userAgent: IPHONE, isStandalone: true })).toBe("able");
  });

  it("waits for the Home Screen on an iPhone, and on an iPad that says it is a Mac", () => {
    expect(abilityOf({ ...facts, ...without, userAgent: IPHONE })).toBe("home-screen");
    expect(abilityOf({ ...facts, ...without, touchPoints: 5 })).toBe("home-screen");
  });

  it("is nothing on an iPhone too old for it, opened from the Home Screen", () => {
    expect(abilityOf({ ...facts, ...without, userAgent: IPHONE, isStandalone: true })).toBe(
      "unable",
    );
  });

  it.each([
    ["no service worker", { hasWorker: false }],
    ["no push", { hasPush: false }],
    ["no notifications", { hasNotification: false }],
  ])("is nothing on a computer with %s", (_what, missing) => {
    expect(abilityOf({ ...facts, ...missing })).toBe("unable");
  });
});

describe("what a browser is called", () => {
  it.each([
    [
      "Chrome · macOS",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    ],
    ["Safari · macOS", MAC_SAFARI],
    ["Safari · iPhone", IPHONE],
    [
      "Chrome · iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
    ],
    ["Firefox · Linux", "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0"],
    ["Firefox · Android", "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0"],
    [
      "Edge · Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
    ],
    [
      "Samsung Internet · Android",
      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Chrome · ChromeOS",
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    ],
  ])("%s", (label, userAgent) => {
    expect(deviceLabel(userAgent)).toBe(label);
  });

  it("is an iPad for a Mac with a touch screen, and nothing for what says nothing", () => {
    expect(deviceLabel(MAC_SAFARI, 5)).toBe("Safari · iPad");
    expect(deviceLabel("something else")).toBeNull();
  });
});

describe("what a browser keeps of its device", () => {
  const ID = "0b9c1f0e-6f1c-4c7e-9a43-2f1d6b7a8c90";

  it("is read back as it was kept, with or without the id the API gave", () => {
    expect(readKept(JSON.stringify({ id: ID, account: ANA }))).toEqual({ id: ID, account: ANA });
    expect(readKept(JSON.stringify({ id: null, account: ANA }))).toEqual({
      id: null,
      account: ANA,
    });
  });

  it.each([
    ["nothing", null],
    ["what is no JSON", "not json"],
    ["a text alone", JSON.stringify(ID)],
    ["an id the API never made", JSON.stringify({ id: "https://push.example/x", account: ANA })],
    ["no account", JSON.stringify({ id: ID })],
    ["an empty account", JSON.stringify({ id: ID, account: "" })],
  ])("is nothing for %s", (_what, stored) => {
    expect(readKept(stored)).toBeNull();
  });

  it("is read back with the address the browser had when it let go, when it kept one", () => {
    const kept = { id: null, account: ANA, gone: "https://push.example/gone" };

    expect(readKept(JSON.stringify(kept))).toEqual(kept);
    expect(readKept(JSON.stringify({ ...kept, gone: 3 }))).toEqual({ id: null, account: ANA });
  });
});

describe("switching push on", () => {
  it("asks the user before anything else, subscribes, and makes the browser a device", async () => {
    const { browser, state, calls } = testBrowser();
    const { api, devices, calls: asked } = testPushApi();

    expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({
      on: true,
      deviceId: "device-1",
    });

    // The question comes first, while the press is fresh, and the rest while no other tab acts.
    expect(calls).toEqual(["ask", "alone", `subscribe ${KEY}`]);
    expect(asked).toEqual(["subscribe https://push.example/new-1 as Firefox · Linux"]);
    expect([...devices]).toEqual([["device-1", "https://push.example/new-1"]]);
    expect(state.kept).toEqual({ id: "device-1", account: ANA });
  });

  it.each([
    ["refused", "denied"],
    ["dismissed", "default"],
  ] as const)(
    "stays off, and asks nothing more, when the user's answer is %s",
    async (why, answer) => {
      const { browser, calls } = testBrowser({ answer });
      const { api, calls: asked } = testPushApi();

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why });

      expect(calls).toEqual(["ask"]);
      expect(asked).toEqual([]);
    },
  );

  it("lets go of what it made when the account can keep no more devices", async () => {
    const { browser, state } = testBrowser();
    const { api, state: answers } = testPushApi();
    answers.full = true;

    expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "full" });

    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  it("lets go of what it made when the API answers that it takes none", async () => {
    const { browser, state } = testBrowser();
    const { api, state: answers, calls: asked } = testPushApi();
    answers.refusing = true;

    expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

    // The API said that it wrote nothing: it is not asked which device has the address.
    expect(asked).toHaveLength(1);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  it("says that it failed when the browser cannot subscribe, and tells the API nothing", async () => {
    const { browser, state } = testBrowser();
    state.cannotSubscribe = true;
    const { api, calls: asked } = testPushApi();

    expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

    expect(asked).toEqual([]);
  });

  describe("when the API's answer is lost", () => {
    it("is on all the same, as the device the API made of it", async () => {
      const { browser, state } = testBrowser();
      const { api, devices, calls: asked } = testPushApi();
      // The device is made, and what the API says of it never arrives.
      const made = api.subscribe;
      api.subscribe = async (given, account) => {
        await made(given, account);
        throw new Error("the answer was lost");
      };

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({
        on: true,
        deviceId: "device-1",
      });

      // It asked which device has its address, and made no second one.
      expect(asked.at(-1)).toBe("renew null https://push.example/new-1");
      expect([...devices.keys()]).toEqual(["device-1"]);
      expect(state.kept).toEqual({ id: "device-1", account: ANA });
    });

    it("lets go when the API then says that it made no device", async () => {
      const { browser, state } = testBrowser();
      const { api, devices, calls: asked } = testPushApi();
      api.subscribe = async () => {
        throw new Error("the request never arrived");
      };

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

      expect(asked).toEqual(["renew null https://push.example/new-1"]);
      expect([...devices]).toEqual([]);
      expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
    });

    it("keeps what it made, and for whom, while the API says nothing at all", async () => {
      const { browser, state } = testBrowser();
      const { api, devices, state: answers } = testPushApi();
      answers.deaf = true;

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

      // The API has the device, and the browser the address it is sent to: neither is left
      // alone. The next load knows the browser again by that address.
      expect([...devices]).toEqual([["device-1", "https://push.example/new-1"]]);
      expect(state.held?.endpoint).toBe("https://push.example/new-1");
      expect(state.kept).toEqual({ id: null, account: ANA });
      answers.deaf = false;
      expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "device-1" });
    });

    it("keeps what it made too when the API then answers that no one is signed in", async () => {
      const { browser, state } = testBrowser();
      const { api, devices } = testPushApi();
      const made = api.subscribe;
      api.subscribe = async (given, account) => {
        await made(given, account);
        throw new Error("the answer was lost");
      };
      api.renew = async () => {
        throw new PushRefused("signed-out");
      };

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

      // The device the API made is not left with an address that is gone.
      expect([...devices.values()]).toEqual([state.held?.endpoint]);
      expect(state.kept).toEqual({ id: null, account: ANA });
    });

    it("has the address forgotten, and lets go, when the API then refuses to say", async () => {
      const { browser, state } = testBrowser();
      const { api, devices, calls: asked } = testPushApi();
      const made = api.subscribe;
      api.subscribe = async (given, account) => {
        await made(given, account);
        throw new Error("the answer was lost");
      };
      api.renew = async () => {
        throw new PushRefused();
      };

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

      expect(asked.at(-1)).toBe("forget https://push.example/new-1");
      expect([[...devices], state.held, state.kept]).toEqual([[], null, null]);
    });

    it("is on at the next press, as the same device", async () => {
      const { browser } = testBrowser();
      const { api, devices, state: answers } = testPushApi();
      answers.deaf = true;
      await switchPushOn(browser, api, KEY, ANA);
      answers.deaf = false;

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({
        on: true,
        deviceId: "device-1",
      });
      expect([...devices.keys()]).toEqual(["device-1"]);
    });
  });

  it("makes no device of the account that signed in from another tab while the user was asked", async () => {
    const { browser, state } = testBrowser();
    const { api, devices, state: answers } = testPushApi();
    const ask = browser.askLeave;
    browser.askLeave = async () => {
      // While the browser's question is on screen, Ben signs in in another tab.
      answers.account = "ben";
      return ask();
    };

    // Ana's page goes on with what she pressed, and the API holds Ben's session.
    expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

    expect([...devices]).toEqual([]);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  it("removes the device this browser was before, when the API was never told to forget it", async () => {
    const { browser, state } = testBrowser({ kept: { id: "device-old", account: ANA } });
    const { api, devices } = testPushApi({
      devices: { "device-old": "https://push.example/dead" },
    });

    await switchPushOn(browser, api, KEY, ANA);

    expect([...devices.keys()]).toEqual(["device-1"]);
    expect(state.kept).toEqual({ id: "device-1", account: ANA });
  });

  it("has the address forgotten that the browser had when it let go and the API was not told", async () => {
    const { browser } = testBrowser({ kept: { id: null, account: ANA, gone: HELD } });
    const { api, devices } = testPushApi({ devices: { unnamed: HELD } });

    await switchPushOn(browser, api, KEY, ANA);

    expect([...devices.keys()]).toEqual(["device-1"]);
  });

  it("leaves alone a device that another account's browser was", async () => {
    const { browser } = testBrowser({ kept: { id: "bens", account: "ben" } });
    const { api, calls: asked } = testPushApi();

    await switchPushOn(browser, api, KEY, ANA);

    // Asked who is signed in, since the browser kept another account's: it is this page's.
    expect(asked).toEqual(["signedIn", "subscribe https://push.example/new-1 as Firefox · Linux"]);
  });
});

describe("switching push off", () => {
  it("lets go in the browser first, then has the API forget the device", async () => {
    const { browser, state, calls } = on();
    const { api, devices, calls: asked } = testPushApi({ devices: { mine: HELD } });

    expect(await switchPushOff(browser, api, ANA)).toEqual(OFF);

    expect(calls).toEqual(["alone", "drop"]);
    // By its id and by its address.
    expect(asked).toEqual(["remove mine", `forget ${HELD}`]);
    expect([...devices]).toEqual([]);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  it("is off in the browser whatever the API answers, and keeps what names the device for the next load", async () => {
    const { browser, state } = on();
    const { api, devices, state: answers } = testPushApi({ devices: { mine: HELD } });
    answers.down = true;

    expect(await switchPushOff(browser, api, ANA)).toEqual(OFF);

    // Its id, and the address it had.
    expect([state.held, state.hasWorker]).toEqual([null, false]);
    expect(state.kept).toEqual({ ...MINE, gone: HELD });
    // The app loads again, and the API answers: the device goes.
    answers.down = false;
    expect(await settlePush(browser, api, ANA)).toEqual(OFF);
    expect([[...devices], state.kept]).toEqual([[], null]);
  });

  it("has a device forgotten at the next load that the API never said the id of", async () => {
    // The API made the device and its answers were lost: the browser kept for whom, and no id.
    const { browser, state } = on({ kept: { id: null, account: ANA } });
    const { api, devices, state: answers } = testPushApi({ devices: { unnamed: HELD } });
    answers.down = true;

    await switchPushOff(browser, api, ANA);
    expect(state.kept).toEqual({ id: null, account: ANA, gone: HELD });

    answers.down = false;
    expect(await settlePush(browser, api, ANA)).toEqual(OFF);
    expect([[...devices], state.kept]).toEqual([[], null]);
  });

  it("forgets the device whose address changed while the API could not be told", async () => {
    // The API still has the address from before, under the id the browser kept.
    const { browser, state } = on();
    const { api, devices } = testPushApi({ devices: { mine: "https://push.example/before" } });

    await switchPushOff(browser, api, ANA);

    expect([...devices]).toEqual([]);
    expect(state.kept).toBeNull();
  });

  it("forgets by its address the device of a browser that kept no id", async () => {
    const { browser } = on({ kept: null });
    const { api, devices, calls: asked } = testPushApi({ devices: { mine: HELD } });

    await switchPushOff(browser, api, ANA);

    expect(asked).toEqual([`forget ${HELD}`]);
    expect([...devices]).toEqual([]);
  });

  it("removes by its id the device of a browser that holds nothing any more", async () => {
    const { browser, state } = testBrowser({ kept: MINE });
    const { api, devices, calls: asked } = testPushApi({ devices: { mine: HELD } });

    await switchPushOff(browser, api, ANA);

    expect(asked).toEqual(["remove mine"]);
    expect([...devices]).toEqual([]);
    expect(state.kept).toBeNull();
  });

  it("says that it failed when the browser does not let go, and asks the API nothing", async () => {
    const { browser, state } = on();
    state.cannotDrop = true;
    const { api, calls: asked } = testPushApi({ devices: { mine: HELD } });

    await expect(switchPushOff(browser, api, ANA)).rejects.toThrow("did not let go");

    expect(asked).toEqual([]);
  });
});

describe("when the app loads", () => {
  it("asks the API nothing for a browser that never had push on", async () => {
    for (const leave of ["default", "granted", "denied"] as const) {
      const { api, calls: asked } = testPushApi();

      expect(await settlePush(testBrowser({ leave }).browser, api, ANA)).toEqual(OFF);
      expect(asked).toEqual([]);
    }
  });

  it("says again what the browser holds, for the device it is", async () => {
    const { browser, calls } = on();
    const { api, calls: asked } = testPushApi({ devices: { mine: "https://push.example/before" } });

    expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "mine" });

    // The address the push service gave since is the device's now, and the browser was asked
    // for nothing.
    expect(asked).toEqual(["key", `renew mine ${HELD}`]);
    expect(calls).toEqual(["alone"]);
  });

  it("lets go when the device was removed from another one, and makes none", async () => {
    const { browser, state } = on();
    const { api, devices, calls: asked } = testPushApi();

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);

    expect(asked).toEqual(["key", `renew mine ${HELD}`]);
    expect([...devices]).toEqual([]);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  describe("in a browser another account left subscribed", () => {
    const BENS = { id: "bens", account: "ben" };

    it("lets go once the API says who is signed in, and takes nothing of the other account's", async () => {
      const { browser, state, calls } = on({ kept: BENS });
      const { api, devices, calls: asked } = testPushApi({ devices: { bens: HELD } });

      expect(await settlePush(browser, api, ANA)).toEqual(OFF);

      expect(calls).toEqual(["alone", "drop"]);
      // Asked who is signed in, and nothing of push.
      expect(asked).toEqual(["signedIn"]);
      // The other account's device is its own to list: the push service says that it is gone.
      expect([...devices.keys()]).toEqual(["bens"]);
      expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
    });

    it("lets go while the API does not answer", async () => {
      const { browser, state } = on({ kept: BENS });
      const { api, state: answers } = testPushApi();
      answers.down = true;

      expect(await settlePush(browser, api, ANA)).toEqual(OFF);

      expect([state.held, state.hasWorker]).toEqual([null, false]);
    });

    it("keeps whose it was while the browser does not let go, to try again", async () => {
      const { browser, state } = on({ kept: BENS });
      state.cannotDrop = true;

      await expect(settlePush(browser, testPushApi().api, ANA)).rejects.toThrow();

      expect(state.kept).toEqual(BENS);
    });
  });

  describe("on a page that is behind, in a browser where another account signed in since", () => {
    // Ben signed in from another tab, and switched push on: the browser holds his subscription.
    const BENS = { id: "bens", account: "ben" };
    const bens = () => {
      const browser = on({ kept: BENS });
      const api = testPushApi();
      api.state.account = "ben";
      return { ...browser, api: api.api, asked: api.calls };
    };

    it("leaves his subscription as it is when her page settles, and asks only who is signed in", async () => {
      const { browser, state, calls, api, asked } = bens();

      expect(await settlePush(browser, api, ANA)).toEqual(OFF);

      expect([calls, asked]).toEqual([["alone"], ["signedIn"]]);
      expect([state.held?.endpoint, state.hasWorker, state.kept]).toEqual([HELD, true, BENS]);
    });

    it("leaves it as it is when her page switches push off", async () => {
      const { browser, state, calls, api, asked } = bens();

      expect(await switchPushOff(browser, api, ANA)).toEqual(OFF);

      expect([calls, asked]).toEqual([["alone"], ["signedIn"]]);
      expect([state.held?.endpoint, state.kept]).toEqual([HELD, BENS]);
    });

    it("leaves it as it is when her page switches push on", async () => {
      const { browser, state, calls, api, asked } = bens();

      expect(await switchPushOn(browser, api, KEY, ANA)).toEqual({ ...OFF, why: "failed" });

      expect([calls, asked]).toEqual([["ask", "alone"], ["signedIn"]]);
      expect([state.held?.endpoint, state.kept]).toEqual([HELD, BENS]);
    });

    it("leaves alone a subscription that the browser holds without knowing whose, when the API says that another account is signed in", async () => {
      const { browser, state } = on({ kept: null });
      const { api, state: answers } = testPushApi({ devices: { mine: HELD } });
      // Between the page's first question and what it says again, Ben signs in.
      const key = api.key;
      api.key = async () => {
        answers.account = "ben";
        return key();
      };

      expect(await settlePush(browser, api, ANA)).toEqual(OFF);

      expect([state.held?.endpoint, state.hasWorker]).toEqual([HELD, true]);
    });

    it("is switched off by his own page", async () => {
      const { browser, state, api, asked } = bens();

      expect(await switchPushOff(browser, api, "ben")).toEqual(OFF);

      expect(asked).toEqual(["remove bens", `forget ${HELD}`]);
      expect([state.held, state.kept]).toEqual([null, null]);
    });
  });

  it("subscribes again with the instance's key when the browser's subscription was made for another", async () => {
    const { browser, calls } = on({ held: { endpoint: HELD, madeFor: "the-key-before" } });
    const { api, devices } = testPushApi({ devices: { mine: HELD } });

    expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "mine" });

    expect(calls).toEqual(["alone", `subscribe ${KEY}`]);
    expect([...devices]).toEqual([["mine", "https://push.example/new-1"]]);
  });

  it("keeps a subscription of a browser that does not say which key it was made for", async () => {
    const { browser, calls } = on({ held: { endpoint: HELD, madeFor: null } });

    expect(await settlePush(browser, testPushApi({ devices: { mine: HELD } }).api, ANA)).toEqual({
      on: true,
      deviceId: "mine",
    });
    expect(calls).toEqual(["alone"]);
  });

  it("subscribes again for a device whose subscription the browser dropped", async () => {
    const { browser } = testBrowser({ leave: "granted", hasWorker: true, kept: MINE });
    const { api, devices } = testPushApi({ devices: { mine: "https://push.example/dropped" } });

    expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "mine" });

    expect([...devices]).toEqual([["mine", "https://push.example/new-1"]]);
  });

  it("knows again by its address a browser that kept no id, and keeps the id from then on", async () => {
    const { browser, state } = on({ kept: null });
    const { api, calls: asked } = testPushApi({ devices: { mine: HELD } });

    expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "mine" });

    expect(asked).toEqual(["key", `renew null ${HELD}`]);
    expect(state.kept).toEqual(MINE);
  });

  it("keeps the id the API answers, when the one it kept names no device of the account", async () => {
    const { browser, state } = on({ kept: { id: "stale", account: ANA } });

    expect(await settlePush(browser, testPushApi({ devices: { mine: HELD } }).api, ANA)).toEqual({
      on: true,
      deviceId: "mine",
    });
    expect(state.kept).toEqual(MINE);
  });

  it("lets go of a subscription that is no device of the account, and makes none of it", async () => {
    // A device that was removed while the browser kept no id.
    const { browser, state } = on({ kept: null });
    const { api, devices, calls: asked } = testPushApi();

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);

    expect(asked).toEqual(["key", `renew null ${HELD}`]);
    expect([...devices]).toEqual([]);
    expect([state.held, state.hasWorker]).toEqual([null, false]);
  });

  it.each([
    ["the user took the browser's leave back", { leave: "denied" as const, hasWorker: true }],
    ["push was switched off while the API did not answer", { leave: "granted" as const }],
  ])("removes the device this browser was when %s", async (_what, start) => {
    const { browser, state } = testBrowser({ ...start, kept: MINE });
    const { api, devices, calls: asked } = testPushApi({ devices: { mine: HELD } });

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);

    expect(asked).toEqual(["remove mine"]);
    expect([...devices]).toEqual([]);
    expect([state.hasWorker, state.kept]).toEqual([false, null]);
  });

  it("keeps the id of such a device while the API cannot be told, to ask again", async () => {
    const { browser, state } = testBrowser({ leave: "granted", kept: MINE });
    const { api, state: answers } = testPushApi({ devices: { mine: HELD } });
    answers.down = true;

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);

    expect(state.kept).toEqual(MINE);
  });

  it("lets go when the instance sends no push any more", async () => {
    const { browser, state } = on();
    const { api, devices } = testPushApi({ key: null, devices: { mine: HELD } });

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);

    expect([...devices]).toEqual([]);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  describe("while the API gives no answer", () => {
    it("stays as it is in a browser that knows whose device it is, to say so again", async () => {
      const { browser, state } = on();
      const { api, state: answers } = testPushApi();
      answers.down = true;

      expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "mine" });

      expect([state.held?.endpoint, state.kept]).toEqual([HELD, MINE]);
    });

    it("lets go in a browser that does not know whose subscription it holds", async () => {
      const { browser, state } = on({ kept: null });
      const { api, state: answers } = testPushApi();
      answers.down = true;

      expect(await settlePush(browser, api, ANA)).toEqual(OFF);

      expect([state.held, state.hasWorker]).toEqual([null, false]);
    });
  });

  it("ends the device when the API answers that it will not take what the browser holds", async () => {
    const { browser, state } = on();
    const { api, devices, calls: asked } = testPushApi({ devices: { mine: HELD } });
    api.renew = async () => {
      throw new PushRefused();
    };

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);

    expect(asked).toEqual(["key", "remove mine"]);
    expect([...devices]).toEqual([]);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  it("stays as it is when the API answers that no one is signed in any more", async () => {
    const { browser, state } = on();
    const { api } = testPushApi({ devices: { mine: HELD } });
    api.key = async () => {
      throw new PushRefused("signed-out");
    };

    expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "mine" });

    expect(state.held?.endpoint).toBe(HELD);
  });

  describe("while the account signs out in another tab", () => {
    // The browser dropped the subscription this device had: the app would subscribe again.
    const dropped = () => testBrowser({ leave: "granted", hasWorker: true, kept: MINE });

    it("makes nothing when the sign-out happened while the key was asked", async () => {
      const { browser, state, calls } = dropped();
      const { api, calls: asked } = testPushApi({ devices: { mine: HELD } });
      api.key = async () => {
        // The other tab: the account is out, and the browser let go without waiting its turn.
        state.hasWorker = false;
        state.kept = null;
        return KEY;
      };

      expect(await settlePush(browser, api, ANA)).toEqual(OFF);

      expect(calls).toEqual(["alone"]);
      expect(asked).toEqual([]);
    });

    it("lets go of what it has just made when the API answers that no one is signed in", async () => {
      const { browser, state } = dropped();
      const { api } = testPushApi({ devices: { mine: HELD } });
      api.renew = async () => {
        throw new PushRefused("signed-out");
      };

      expect(await settlePush(browser, api, ANA)).toEqual(OFF);

      expect([state.held, state.hasWorker]).toEqual([null, false]);
    });
  });

  it("leaves what it holds to the page of the account that signed in from another tab since", async () => {
    const { browser, state } = on();
    const { api, devices, state: answers } = testPushApi({ devices: { mine: HELD } });
    answers.account = "ben";

    // Ana's page settles for her, and the API holds Ben's session: her page is behind.
    expect(await settlePush(browser, api, ANA)).toEqual(OFF);
    expect([state.held?.endpoint, state.kept]).toEqual([HELD, MINE]);
    // Her device is hers to list: nothing of it was changed with his session.
    expect([...devices]).toEqual([["mine", HELD]]);

    // The page learns who is signed in, and settles for him: what she left there goes.
    expect(await settlePush(browser, api, "ben")).toEqual(OFF);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
  });

  it("does not take for a dropped subscription what the browser let go of itself", async () => {
    // Switched off while the API gave no answer, and the service worker stayed for some reason.
    const { browser, calls } = testBrowser({
      leave: "granted",
      hasWorker: true,
      kept: { ...MINE, gone: HELD },
    });
    const { api, devices } = testPushApi({ devices: { mine: HELD } });

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);

    expect(calls).not.toContain(`subscribe ${KEY}`);
    expect([...devices]).toEqual([]);
  });

  it("does nothing in a browser that cannot be sent a push", async () => {
    const { browser, calls } = on();
    browser.ability = () => "unable";
    const { api, calls: asked } = testPushApi();

    expect(await settlePush(browser, api, ANA)).toEqual(OFF);
    expect(await switchPushOff(browser, api, ANA)).toEqual(OFF);
    await leftPush(browser);
    expect([calls, asked]).toEqual([[], []]);
  });

  it("waits its turn among the tabs of the browser, and reads what it keeps only then", async () => {
    const { browser, state } = on();
    const { api, calls: asked } = testPushApi({ devices: { other: HELD } });
    // Another tab acts first: it switches push off, and on again as another device.
    browser.alone = async (work) => {
      state.kept = { id: "other", account: ANA };
      return work();
    };

    expect(await settlePush(browser, api, ANA)).toEqual({ on: true, deviceId: "other" });
    expect(asked).toEqual(["key", `renew other ${HELD}`]);
  });
});

describe("once its account has signed out", () => {
  it("lets go at once, without waiting for its turn, and once more when its turn comes", async () => {
    const { browser, state, calls } = on();
    // Another tab holds the turn, for as long as the test says.
    let release!: () => void;
    const other = browser.alone(() => new Promise<void>((resolve) => (release = resolve)));
    await Promise.resolve();

    await leftPush(browser);
    // While the other tab still holds it: an account that is out is kept in by no tab.
    expect(calls).toEqual(["alone", "drop"]);
    expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);

    release();
    await other;
    await browser.alone(async () => undefined);
    expect(calls).toEqual(["alone", "drop", "alone", "drop", "alone"]);
  });

  it("lets go again of what another tab made while it was settling", async () => {
    const { browser, state } = on();
    // The other tab holds the turn: it subscribes again before it gives it back.
    const settling = browser.alone(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await browser.subscribe(KEY);
    });

    await leftPush(browser);
    await settling;
    await browser.alone(async () => undefined);

    expect([state.held, state.hasWorker]).toEqual([null, false]);
  });

  it("forgets what it kept even when the browser does not let go, for the next load to try again", async () => {
    const { browser, state } = on();
    state.cannotDrop = true;

    await leftPush(browser);

    // The API forgot the device with the session: there is nothing left to name to it.
    expect(state.kept).toBeNull();
    // Whoever signs in next finds a subscription that is no device of theirs, and lets go.
    state.cannotDrop = false;
    expect(await settlePush(browser, testPushApi().api, ANA)).toEqual(OFF);
    expect(state.held).toBeNull();
  });
});
