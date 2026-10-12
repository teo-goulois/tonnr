import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PushDevice } from "@/lib/push";
import type { PushState, Pushing } from "@/lib/use-push";

import { PushSetting } from "./push-setting";

afterEach(cleanup);

const NOW = Date.UTC(2026, 9, 12, 8);
const device = (id: string, label: string | null, daysAgo: number): PushDevice => ({
  id,
  label,
  createdAt: new Date(NOW - 30 * 24 * 60 * 60 * 1000),
  seenAt: new Date(NOW - daysAgo * 24 * 60 * 60 * 1000),
});
const PHONE = device("phone", "Safari · iPhone", 3);
const HERE = device("here", "Chrome · macOS", 0);
const UNNAMED = device("unnamed", null, 61);

const OFF: PushState = { kind: "off", isBusy: false, failure: null };
const ON: PushState = { kind: "on", isBusy: false, failure: null };

// The row as the settings show it, with what a press asks for.
function show(state: PushState, more: Partial<Pushing> = {}) {
  const asks = { onSwitch: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() };
  const props = {
    state,
    devices: { data: [], isPending: false, isError: false },
    deviceId: null,
    removing: [],
    now: NOW,
    ...asks,
    ...more,
  };
  const shown = render(createElement(PushSetting, props));
  return {
    ...asks,
    again: (next: PushState) =>
      shown.rerender(createElement(PushSetting, { ...props, state: next })),
  };
}
const theSwitch = () => screen.queryByRole("switch", { name: "On this device" });

describe("push on this device, as the settings show it", () => {
  it.each([
    ["unknown", "Could not check whether this instance sends notifications."],
    ["unsure", "Could not check whether notifications are on on this device."],
    ["none", "This instance sends no notification."],
    ["unable", "This browser cannot show the notifications of a web app."],
    [
      "home-screen",
      "On an iPhone or an iPad, add Tonnr to your Home Screen first: press Share, then “Add to Home Screen”, and open it from there.",
    ],
    [
      "refused",
      "Notifications are blocked for this site. Allow them in your browser's settings, then switch them on here.",
    ],
  ] as const)("says what stands in the way, and offers no switch: %s", (kind, words) => {
    show({ kind });

    expect(screen.getByText(words)).toBeTruthy();
    expect(theSwitch()).toBeNull();
  });

  it("shows nothing to press while the instance is asked", () => {
    show({ kind: "loading" });

    expect(theSwitch()).toBeNull();
    expect(screen.queryByText("On this device")).toBeNull();
  });

  it.each(["unknown", "unsure"] as const)(
    "offers to ask again what could not be had: %s",
    (kind) => {
      const { onRetry } = show({ kind });

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(onRetry).toHaveBeenCalledOnce();
    },
  );

  it("offers nothing to ask again where nothing failed", () => {
    show({ kind: "none" });

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("is a switch that says what push is, off and on", () => {
    const { onSwitch, again } = show(OFF);

    expect(theSwitch()?.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("A notification, even with the app closed.")).toBeTruthy();
    fireEvent.click(theSwitch()!);
    expect(onSwitch).toHaveBeenLastCalledWith(true, expect.anything());

    again(ON);
    expect(theSwitch()?.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(theSwitch()!);
    expect(onSwitch).toHaveBeenLastCalledWith(false, expect.anything());
  });

  describe("while a switch is on its way", () => {
    it.each([
      ["on", { ...OFF, isBusy: true }, "Switching notifications on…"],
      ["off", { ...ON, isBusy: true }, "Switching notifications off…"],
    ] as const)("says that push is being switched %s, and takes no press", (_way, state, words) => {
      const { onSwitch } = show(state);

      // Said to who listens as to who looks: the words are the switch's description, in a
      // part of the page that is read again when it changes.
      const said = screen.getByText(words);
      expect(said.getAttribute("aria-live")).toBe("polite");
      expect(theSwitch()?.getAttribute("aria-describedby")).toBe(said.id);
      expect(theSwitch()?.getAttribute("aria-busy")).toBe("true");
      fireEvent.click(theSwitch()!);
      expect(onSwitch).not.toHaveBeenCalled();
    });

    it("is a switch to press again once it has taken, or failed", () => {
      const { onSwitch, again } = show({ ...OFF, isBusy: true });

      again(ON);
      expect(screen.queryByText("Switching notifications on…")).toBeNull();
      expect(theSwitch()?.getAttribute("aria-busy")).toBe("false");
      fireEvent.click(theSwitch()!);
      expect(onSwitch).toHaveBeenCalledOnce();

      again({ ...OFF, failure: "on" });
      fireEvent.click(theSwitch()!);
      expect(onSwitch).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ["on", "Notifications could not be switched on. Try again."],
    ["off", "Notifications could not be switched off. Try again."],
    [
      "full",
      "Your account has as many devices as it can keep. Remove one below, then switch this one on.",
    ],
  ] as const)("says a failure aloud, under the switch: %s", (failure, words) => {
    show({ ...OFF, failure });

    expect(screen.getByRole("alert").textContent).toBe(words);
    expect(theSwitch()).not.toBeNull();
  });

  describe("the account's devices", () => {
    const listed = () =>
      within(screen.getByRole("list", { name: "Devices that are notified" })).getAllByRole(
        "listitem",
      );

    it("are not there for an account that has none", () => {
      show(OFF);

      expect(screen.queryByRole("list")).toBeNull();
    });

    it("are listed with this device first, each with when it was last seen", () => {
      show(ON, {
        devices: { data: [PHONE, UNNAMED, HERE], isPending: false, isError: false },
        deviceId: "here",
      });

      expect(listed().map((item) => item.textContent)).toEqual([
        "Chrome · macOSThis deviceSeen 0 min. ago",
        "Safari · iPhoneSeen 3 days ago",
        "A browserSeen 61 days ago",
      ]);
    });

    it("are listed in a browser that cannot be sent a push, to be removed from it", () => {
      const { onRemove } = show(
        { kind: "unable" },
        { devices: { data: [PHONE, UNNAMED], isPending: false, isError: false } },
      );

      fireEvent.click(screen.getByRole("button", { name: "Remove Safari · iPhone" }));
      expect(onRemove).toHaveBeenLastCalledWith(PHONE);
      fireEvent.click(screen.getByRole("button", { name: "Remove A browser" }));
      expect(onRemove).toHaveBeenLastCalledWith(UNNAMED);
    });

    it("cannot be removed twice, nor this one while its switch is on its way", () => {
      const { onRemove } = show(
        { ...ON, isBusy: true },
        {
          devices: { data: [HERE, PHONE, UNNAMED], isPending: false, isError: false },
          deviceId: "here",
          removing: ["phone"],
        },
      );

      for (const name of ["Remove Chrome · macOS", "Remove Safari · iPhone"]) {
        fireEvent.click(screen.getByRole("button", { name }));
      }
      expect(onRemove).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Remove A browser" }));
      expect(onRemove).toHaveBeenCalledOnce();
    });

    it("say that they could not be loaded", () => {
      show(OFF, { devices: { data: undefined, isPending: false, isError: true } });

      expect(screen.getByText("Your devices could not be loaded.")).toBeTruthy();
    });
  });
});
