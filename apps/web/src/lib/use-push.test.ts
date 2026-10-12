import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PUSH_DEVICE_KEY, type PushApi, type PushBrowser } from "./push";
import { testBrowser, testPushApi } from "./push-testing";
import { type PushAsked, usePush } from "./use-push";

afterEach(cleanup);

const HELD = "https://push.example/held";
const ANA = "ana";
const MINE = { id: "mine", account: ANA };
// A browser of Ana's with push on, and an API that lists its device.
const on = () => ({
  ...testBrowser({ leave: "granted", held: { endpoint: HELD }, kept: MINE }),
  ...(({ api, devices, state, calls }) => ({ api, devices, answers: state, asked: calls }))(
    testPushApi({ devices: { mine: HELD } }),
  ),
});
const SHOWN = { account: ANA, isShown: true };

// The hook as the route mounts it, with the settings open unless a test says otherwise. A test
// that leaves the page and comes back gives the one client of the app.
function mount(
  browser: PushBrowser,
  api: PushApi,
  asked: PushAsked = SHOWN,
  client = new QueryClient(),
) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook((props: PushAsked) => usePush(props, browser, api), {
    initialProps: asked,
    wrapper,
  });
}
type Mounted = ReturnType<typeof mount>["result"];
const kindOf = (result: Mounted) => result.current.state.kind;
const listed = (result: Mounted) => result.current.devices.data?.map((device) => device.id);
const wait = (milliseconds: number) =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
// The user comes back to the tab.
const comeBack = () => act(() => void window.dispatchEvent(new Event("focus")));

describe("push on this device", () => {
  it("is being asked, then off, in a browser that never had it on", async () => {
    const { browser } = testBrowser();
    const { api, calls: asked } = testPushApi();

    const { result } = mount(browser, api);
    expect(kindOf(result)).toBe("loading");

    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "off",
        isBusy: false,
        failure: null,
      }),
    );
    expect([listed(result), result.current.deviceId]).toEqual([[], null]);
    // The instance and the list were asked, and nothing was said of a device.
    expect(asked.sort()).toEqual(["devices", "key"]);
  });

  it("says its subscription again as the app loads, with the settings closed", async () => {
    const { browser, api, asked } = on();

    mount(browser, api, { account: ANA, isShown: false });

    await waitFor(() => expect(asked).toEqual(["key", `renew mine ${HELD}`]));
  });

  it("asks the instance's key once, for the settings and for what the browser says again", async () => {
    const { browser, api, asked } = on();

    const { result } = mount(browser, api);

    await waitFor(() => expect(kindOf(result)).toBe("on"));
    expect(asked.filter((one) => one === "key")).toHaveLength(1);
    expect([result.current.deviceId, listed(result)]).toEqual(["mine", ["mine"]]);
  });

  it("does nothing for a visitor, and reads nothing of the browser when they come back", async () => {
    const { browser, api, asked } = on();
    let reads = 0;
    browser.held = async () => {
      reads += 1;
      return null;
    };

    mount(browser, api, { account: undefined, isShown: true });
    await wait(30);
    comeBack();
    await wait(30);

    expect([asked, reads]).toEqual([[], 0]);
  });

  describe("says what stands in the way", () => {
    it("an instance that sends no push, before anything of the browser", async () => {
      const { browser } = testBrowser({ leave: "denied" });

      const { result } = mount(browser, testPushApi({ key: null }).api);

      await waitFor(() => expect(kindOf(result)).toBe("none"));
    });

    it.each(["unable", "home-screen"] as const)("a browser that is %s", async (ability) => {
      const { browser } = testBrowser();
      browser.ability = () => ability;
      const { api, calls: asked } = testPushApi({ devices: { phone: HELD } });

      const { result } = mount(browser, api);

      await waitFor(() => expect(kindOf(result)).toBe(ability));
      // The account's other devices are listed all the same: they are removed from any one.
      expect(listed(result)).toEqual(["phone"]);
      expect(asked).not.toContain(`renew null ${HELD}`);
    });

    it("a browser whose user said no", async () => {
      const { result } = mount(testBrowser({ leave: "denied" }).browser, testPushApi().api);

      await waitFor(() => expect(kindOf(result)).toBe("refused"));
    });

    it("a browser that could not be read, which is not said to be off, until it is read again", async () => {
      const { browser, api } = on();
      const held = browser.held;
      let isFailing = true;
      browser.held = async () => {
        if (isFailing) throw new Error("the browser did not answer");
        return held();
      };

      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("unsure"));

      isFailing = false;
      act(() => result.current.onRetry());
      await waitFor(() => expect(kindOf(result)).toBe("on"));
    });

    it("an instance that could not be asked, until it is asked again", async () => {
      const { api, state: answers } = testPushApi();
      answers.down = true;

      const { result } = mount(testBrowser().browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("unknown"), { timeout: 4000 });

      answers.down = false;
      act(() => result.current.onRetry());
      await waitFor(() => expect(kindOf(result)).toBe("off"));
    });
  });

  describe("switched on", () => {
    it("is on its way at once, then on, as a device that is listed", async () => {
      const { browser } = testBrowser();
      const { api, calls: asked } = testPushApi();
      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("off"));

      act(() => result.current.onSwitch(true));
      expect(result.current.state).toEqual({ kind: "off", isBusy: true, failure: null });

      await waitFor(() =>
        expect(result.current.state).toEqual({ kind: "on", isBusy: false, failure: null }),
      );
      await waitFor(() => expect(listed(result)).toEqual(["device-1"]));
      expect(result.current.deviceId).toBe("device-1");
      // The list that was read before the switch does not make the browser ask again.
      await wait(50);
      expect(asked.filter((one) => one.startsWith("renew"))).toEqual([]);
    });

    it("keeps no answer of a switch that ends once the page is left, so that coming back asks anew", async () => {
      const { browser, state } = testBrowser();
      const { api, devices, calls: asked } = testPushApi();
      // An API that is slow to answer.
      const subscribe = api.subscribe;
      api.subscribe = async (given, account) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return subscribe(given, account);
      };
      const client = new QueryClient();
      const first = mount(browser, api, SHOWN, client);
      await waitFor(() => expect(kindOf(first.result)).toBe("off"));

      act(() => first.result.current.onSwitch(true));
      first.unmount();
      await wait(100);
      // The switch took, with no screen to show it. And the device is removed from another one.
      expect([...devices.keys()]).toEqual(["device-1"]);
      devices.clear();
      asked.length = 0;

      // The page is come back to, with the settings closed.
      mount(browser, api, { account: ANA, isShown: false }, client);

      await waitFor(() => expect(asked).toContain("renew device-1 https://push.example/new-1"));
      await waitFor(() => expect([state.held, state.kept]).toEqual([null, null]));
    });

    it("is shown as on by a page that was come back to while the browser's question was open", async () => {
      const { browser } = testBrowser();
      const { api } = testPushApi();
      // The browser's question stays on screen until the test answers it.
      const ask = browser.askLeave;
      let answer!: () => void;
      const answered = new Promise<void>((resolve) => (answer = resolve));
      browser.askLeave = async () => {
        await answered;
        return ask();
      };
      const client = new QueryClient();
      const first = mount(browser, api, SHOWN, client);
      await waitFor(() => expect(kindOf(first.result)).toBe("off"));

      act(() => first.result.current.onSwitch(true));
      // The page is left, and come back to: push is off, as the browser has it.
      first.unmount();
      const second = mount(browser, api, SHOWN, client);
      await waitFor(() => expect(kindOf(second.result)).toBe("off"));

      // The user says yes: the switch of the page that was left takes.
      await act(async () => answer());

      await waitFor(() => expect(kindOf(second.result)).toBe("on"));
      expect(second.result.current.deviceId).toBe("device-1");
    });

    it("takes one press at a time", async () => {
      const { browser, calls } = testBrowser();
      const { result } = mount(browser, testPushApi().api);
      await waitFor(() => expect(kindOf(result)).toBe("off"));

      act(() => {
        result.current.onSwitch(true);
      });
      act(() => result.current.onSwitch(true));
      await waitFor(() => expect(kindOf(result)).toBe("on"));

      expect(calls.filter((one) => one === "ask")).toHaveLength(1);
    });

    it("says that the account can keep no more devices", async () => {
      const { api, state: answers } = testPushApi();
      answers.full = true;
      const { result } = mount(testBrowser().browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("off"));

      act(() => result.current.onSwitch(true));

      await waitFor(() =>
        expect(result.current.state).toEqual({ kind: "off", isBusy: false, failure: "full" }),
      );
    });

    it("says that it failed, and is ready for another press", async () => {
      const { api, state: answers } = testPushApi();
      const { result } = mount(testBrowser().browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("off"));
      answers.down = true;

      act(() => result.current.onSwitch(true));
      await waitFor(() =>
        expect(result.current.state).toEqual({ kind: "off", isBusy: false, failure: "on" }),
      );

      answers.down = false;
      act(() => result.current.onSwitch(true));
      await waitFor(() =>
        expect(result.current.state).toEqual({ kind: "on", isBusy: false, failure: null }),
      );
    });

    it("shows the refusal of a user who says no, as no failure", async () => {
      const { result } = mount(testBrowser({ answer: "denied" }).browser, testPushApi().api);
      await waitFor(() => expect(kindOf(result)).toBe("off"));

      act(() => result.current.onSwitch(true));

      await waitFor(() => expect(kindOf(result)).toBe("refused"));
    });
  });

  describe("switched off", () => {
    it("is on its way, then off, and its device is no longer listed", async () => {
      const { browser, state, api, devices } = on();
      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("on"));

      act(() => result.current.onSwitch(false));
      expect(result.current.state).toEqual({ kind: "on", isBusy: true, failure: null });

      await waitFor(() =>
        expect(result.current.state).toEqual({ kind: "off", isBusy: false, failure: null }),
      );
      await waitFor(() => expect(listed(result)).toEqual([]));
      expect([state.held, [...devices]]).toEqual([null, []]);
    });

    it("says that it failed when the browser does not let go, and stays on", async () => {
      const { browser, state, api } = on();
      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("on"));
      state.cannotDrop = true;

      act(() => result.current.onSwitch(false));

      await waitFor(() =>
        expect(result.current.state).toEqual({ kind: "on", isBusy: false, failure: "off" }),
      );
    });
  });

  describe("the account's devices", () => {
    it("removes another device from this one, which stays on", async () => {
      const { browser, api, devices } = on();
      devices.set("phone", "https://push.example/phone");
      const { result } = mount(browser, api);
      await waitFor(() => expect(listed(result)).toEqual(["mine", "phone"]));
      const phone = result.current.devices.data!.find((device) => device.id === "phone")!;

      act(() => result.current.onRemove(phone));
      expect(result.current.removing).toEqual(["phone"]);

      await waitFor(() => expect(listed(result)).toEqual(["mine"]));
      await waitFor(() => expect(result.current.removing).toEqual([]));
      expect(kindOf(result)).toBe("on");
    });

    it("switches this device off when it is removed from its own list", async () => {
      const { browser, state, api, devices, asked } = on();
      const { result } = mount(browser, api);
      await waitFor(() => expect(listed(result)).toEqual(["mine"]));
      asked.length = 0;

      act(() => result.current.onRemove(result.current.devices.data![0]!));
      // As a switch: on its way, and not as a device that is being removed.
      expect(result.current.state).toEqual({ kind: "on", isBusy: true, failure: null });
      expect(result.current.removing).toEqual([]);

      await waitFor(() => expect(kindOf(result)).toBe("off"));
      expect([state.held, state.hasWorker, [...devices]]).toEqual([null, false, []]);
      // The browser let go, and the API was told as a switch tells it.
      expect(asked.slice(0, 2)).toEqual(["remove mine", `forget ${HELD}`]);
    });
  });

  describe("when a list no longer has this device", () => {
    // The settings are closed and opened again: the list is read anew.
    const reopen = async ({ rerender }: ReturnType<typeof mount>) => {
      rerender({ account: ANA, isShown: false });
      rerender(SHOWN);
    };

    it("learns that it was removed from another one, and lets go", async () => {
      const { browser, state, api, devices } = on();
      const mounted = mount(browser, api);
      await waitFor(() => expect(kindOf(mounted.result)).toBe("on"));

      // From another device, meanwhile.
      devices.delete("mine");
      await reopen(mounted);

      await waitFor(() => expect(kindOf(mounted.result)).toBe("off"));
      expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
    });

    it("asks once for a list, and no more while the API does not say what became of it", async () => {
      const { browser, api, devices, asked } = on();
      // What the browser says again gets no answer, from the moment the test says so.
      const renew = api.renew;
      let isUnanswered = false;
      api.renew = async (id, given, account) => {
        if (!isUnanswered) return renew(id, given, account);
        asked.push("renew, unanswered");
        // After a moment, as a request that fails does: the screen is drawn meanwhile.
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("the API did not answer");
      };
      const mounted = mount(browser, api);
      await waitFor(() => expect(kindOf(mounted.result)).toBe("on"));
      // The list answers without the device.
      devices.delete("mine");
      isUnanswered = true;

      await reopen(mounted);
      await wait(150);

      expect(asked.filter((one) => one === "renew, unanswered")).toHaveLength(1);
      // Push stays as the browser has it, and the next list asks again.
      expect(kindOf(mounted.result)).toBe("on");
      await reopen(mounted);
      await wait(150);
      expect(asked.filter((one) => one === "renew, unanswered")).toHaveLength(2);
    });
  });

  it("asks once for a list too when the browser itself fails to answer", async () => {
    const { browser, api, devices } = on();
    const held = browser.held;
    let failures = 0;
    let isFailing = false;
    browser.held = async () => {
      if (!isFailing) return held();
      failures += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("the browser did not answer");
    };
    const mounted = mount(browser, api);
    await waitFor(() => expect(kindOf(mounted.result)).toBe("on"));
    devices.delete("mine");
    isFailing = true;

    mounted.rerender({ account: ANA, isShown: false });
    mounted.rerender(SHOWN);
    await wait(150);

    expect(failures).toBe(1);
  });

  describe("when the user comes back to the tab", () => {
    it("is off once another tab has switched it off, whatever that tab could tell", async () => {
      const { browser, state, api, answers } = on();
      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("on"));

      // Another tab let go while the API gave no answer: it kept the device's id, and nothing
      // in what the browser keeps says that anything changed.
      state.held = null;
      state.hasWorker = false;
      answers.down = true;
      comeBack();

      await waitFor(() => expect(kindOf(result)).toBe("off"));
    });

    it("is refused once the user has taken the browser's leave back, and its device goes", async () => {
      const { browser, state, api, devices } = on();
      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("on"));

      // A browser that loses its leave loses its subscription with it.
      state.leave = "denied";
      state.held = null;
      comeBack();

      await waitFor(() => expect(kindOf(result)).toBe("refused"));
      await waitFor(() => expect([...devices]).toEqual([]));
      expect(result.current.deviceId).toBeNull();
    });

    it("asks again when the browser is another device than the one this tab shows", async () => {
      const { browser, state, api, devices } = on();
      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("on"));

      // Another tab switched push off and on again: the browser holds a subscription as
      // before, and is another device of the account.
      devices.delete("mine");
      devices.set("other", HELD);
      state.kept = { id: "other", account: ANA };
      comeBack();

      await waitFor(() => expect(result.current.deviceId).toBe("other"));
    });

    it("asks nothing when nothing changed", async () => {
      const { browser, api, asked } = on();
      const { result } = mount(browser, api);
      await waitFor(() => expect(kindOf(result)).toBe("on"));
      asked.length = 0;

      comeBack();
      await wait(50);

      expect(asked).toEqual([]);
    });
  });

  it("is on once another tab has switched it on, which the browser says", async () => {
    const { browser, state } = testBrowser({ leave: "granted" });
    const { api, devices } = testPushApi();
    const { result } = mount(browser, api);
    await waitFor(() => expect(kindOf(result)).toBe("off"));

    // The other tab subscribed, and kept which device the browser is.
    devices.set("mine", HELD);
    state.held = { endpoint: HELD, keys: { p256dh: "a", auth: "b" }, madeFor: null };
    state.kept = MINE;
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: PUSH_DEVICE_KEY })));

    await waitFor(() => expect(kindOf(result)).toBe("on"));
    expect(result.current.deviceId).toBe("mine");
  });

  describe("when another account takes the place of the first without a reload", () => {
    it("lets go of what the first left, and removes nothing of its devices", async () => {
      const { browser, state, api, devices, answers } = on();
      const mounted = mount(browser, api);
      await waitFor(() => expect(kindOf(mounted.result)).toBe("on"));

      // Ben signs in where Ana was: the browser still holds what it held for her.
      answers.account = "ben";
      mounted.rerender({ account: "ben", isShown: true });

      await waitFor(() => expect(kindOf(mounted.result)).toBe("off"));
      expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
      expect(mounted.result.current.deviceId).toBeNull();
      // Her device is hers to list: Ben's browser removed nothing of it.
      expect([...devices.keys()]).toEqual(["mine"]);
    });

    it("answers the first anew when it comes back, and not as it was answered before", async () => {
      const { browser, state, api, answers } = on();
      const mounted = mount(browser, api);
      await waitFor(() => expect(kindOf(mounted.result)).toBe("on"));

      // Ben takes Ana's place, and switches push on for himself.
      answers.account = "ben";
      mounted.rerender({ account: "ben", isShown: true });
      await waitFor(() => expect(kindOf(mounted.result)).toBe("off"));
      act(() => mounted.result.current.onSwitch(true));
      await waitFor(() => expect(kindOf(mounted.result)).toBe("on"));
      expect(state.kept?.account).toBe("ben");

      // Ana comes back: the browser holds Ben's subscription, and she is not shown as on.
      answers.account = "ana";
      mounted.rerender(SHOWN);

      await waitFor(() => expect(kindOf(mounted.result)).toBe("off"));
      expect(mounted.result.current.deviceId).toBeNull();
      expect([state.held, state.hasWorker, state.kept]).toEqual([null, false, null]);
    });

    it("touches nothing of the other account's while the page is behind, and settles once it is not", async () => {
      // Ben signed in from another tab, and switched push on there.
      const { browser, state } = testBrowser({ leave: "granted" });
      const { api, state: answers } = testPushApi();
      answers.account = "ben";
      const { endpoint, keys } = await browser.subscribe("the-instance-key");
      const made = await api.subscribe({ endpoint, keys }, "ben");
      if (made === "full") throw new Error("the account is full");
      state.kept = { id: made.id, account: "ben" };

      // A page of Ana's that was open before, and still thinks that she is signed in.
      const mounted = mount(browser, api);
      await waitFor(() => expect(kindOf(mounted.result)).toBe("off"));
      act(() => mounted.result.current.onSwitch(false));
      await wait(30);
      expect([state.held?.endpoint, state.kept?.account]).toEqual([endpoint, "ben"]);

      // The page learns who is signed in: push is on, as he switched it.
      mounted.rerender({ account: "ben", isShown: true });
      await waitFor(() => expect(kindOf(mounted.result)).toBe("on"));
      expect(mounted.result.current.deviceId).toBe(made.id);
    });

    it("reads the list of devices again for each account", async () => {
      const { browser, api, asked } = on();
      const mounted = mount(browser, api);
      await waitFor(() => expect(listed(mounted.result)).toEqual(["mine"]));
      asked.length = 0;

      mounted.rerender({ account: "ben", isShown: true });

      // Not the list that was read for the other account, while this one's is on its way.
      expect(mounted.result.current.devices.data).toBeUndefined();
      await waitFor(() => expect(asked).toContain("devices"));
    });
  });
});
