import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";

import {
  PUSH_DEVICE_KEY,
  type PushApi,
  type PushBrowser,
  type PushDevice,
  type PushHere,
  type PushLeave,
  type PushRefusal,
  settlePush,
  switchPushOff,
  switchPushOn,
} from "./push";

/** Why a switch of push did not take: it could not be switched, or the account is full. */
export type PushFailure = "on" | "off" | "full";

/**
 * Where push stands on this device: decision 031, "Push". Every state a person can be in has
 * its own words, and only the last two have a switch. `isBusy` is a switch on its way: off and
 * busy is push being switched on, on and busy is push being switched off.
 */
export type PushState =
  // Whether the instance sends push is being asked, or could not be.
  | { kind: "loading" }
  | { kind: "unknown" }
  // What this browser holds could not be read: push may be on here, or not.
  | { kind: "unsure" }
  // The instance holds no pair of keys.
  | { kind: "none" }
  // The browser cannot be sent a push, or could once the app is on the Home Screen.
  | { kind: "unable" }
  | { kind: "home-screen" }
  // The user, or the browser's settings, said no.
  | { kind: "refused" }
  | { kind: "off" | "on"; isBusy: boolean; failure: PushFailure | null };

/** What the screens of push read and ask for: this device's state, and the account's devices. */
export type Pushing = {
  state: PushState;
  devices: { data: PushDevice[] | undefined; isPending: boolean; isError: boolean };
  // The device this browser is, when push is on here.
  deviceId: string | null;
  // The devices that are being removed.
  removing: string[];
  onSwitch: (on: boolean) => void;
  onRemove: (device: PushDevice) => void;
  // Asks again what could not be had: whether the instance sends push, or what the browser
  // holds.
  onRetry: () => void;
};

const KEY_KEY = ["push", "key"];
// How long the instance's key is taken as read.
const KEY_FRESH_MS = 5 * 60 * 1000;

export type PushAsked = {
  // The account that is signed in. Undefined for a visitor.
  account: string | undefined;
  // True while the settings are open: the account's devices are read then.
  isShown: boolean;
};

/**
 * Push on this device, for the account that is signed in: decision 031, "Push". The browser
 * says its subscription again when the app loads, whatever is on screen. The route gives the
 * browser and the API, and a test what stands for them.
 */
export function usePush(
  { account, isShown }: PushAsked,
  browser: PushBrowser,
  given: PushApi,
): Pushing {
  const queryClient = useQueryClient();
  const ability = useMemo(() => browser.ability(), [browser]);
  const isAble = ability === "able";
  const signedIn = account !== undefined;

  // The instance's key is asked once for what shows it and for what settles the browser.
  const api = useMemo<PushApi>(
    () => ({
      ...given,
      key: () =>
        queryClient.fetchQuery({ queryKey: KEY_KEY, queryFn: given.key, staleTime: KEY_FRESH_MS }),
    }),
    [given, queryClient],
  );

  // Whether push is on in this browser, and which device it is: asked once while an account
  // is on the page, and again when something below says that the browser may hold something
  // else. It is the account's own, and is not kept once another account has its place: an
  // account that comes back is answered anew.
  const hereKey = useMemo(() => ["push", "here", account], [account]);
  const devicesKey = useMemo(() => ["push", "devices", account], [account]);
  const here = useQuery({
    queryKey: hereKey,
    queryFn: () => settlePush(browser, api, account ?? ""),
    enabled: signedIn && isAble,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    meta: { quiet: true },
  });
  const key = useQuery({
    queryKey: KEY_KEY,
    queryFn: given.key,
    enabled: signedIn && isShown,
    staleTime: KEY_FRESH_MS,
    // Asked once more, and then the row says that it could not be had, and offers to ask again.
    retry: 1,
    meta: { quiet: true },
  });
  const devices = useQuery({
    queryKey: devicesKey,
    queryFn: given.devices,
    enabled: signedIn && isShown,
    meta: { quiet: true },
  });

  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PushFailure | null>(null);
  const isOn = here.data?.on ?? false;
  const deviceId = isOn ? (here.data?.deviceId ?? null) : null;

  // Puts the browser and the API in agreement again. The list is not asked for after it: a
  // list is what may have asked for this.
  const settleHere = here.refetch;
  const settleAgain = useCallback(() => {
    if (signedIn && isAble) void settleHere();
  }, [signedIn, isAble, settleHere]);

  // What the user lets the browser do, and what the browser holds, are read when they may have
  // changed without this tab: when the user comes back to it, from the browser's settings or
  // from another tab, which shares the one subscription.
  const [leave, setLeave] = useState<PushLeave>(() => (isAble ? browser.leave() : "default"));
  const known = useRef({ leave, isOn, isBusy, deviceId, account, isMounted: true });
  known.current = { ...known.current, leave, isOn, isBusy, deviceId, account };
  useEffect(() => {
    known.current.isMounted = true;
    return () => {
      known.current.isMounted = false;
    };
  }, []);
  useEffect(() => {
    // A visitor has nothing of push to read.
    if (!isAble || !signedIn) return;
    let isMounted = true;
    const read = () => {
      const now = browser.leave();
      if (now !== known.current.leave) {
        setLeave(now);
        return settleAgain();
      }
      if (known.current.isBusy) return;
      void browser.held().then(
        (held) => {
          if (!isMounted || known.current.isBusy) return;
          // Not what this tab shows: a subscription where it shows none, or none where it
          // shows one, or one that is another device's or another account's now.
          const kept = browser.kept();
          const isOther =
            known.current.isOn &&
            (kept?.account !== known.current.account || kept?.id !== known.current.deviceId);
          if ((held !== null) !== known.current.isOn || isOther) settleAgain();
        },
        () => undefined,
      );
    };
    const told = (event: StorageEvent) => {
      if (event.key === PUSH_DEVICE_KEY) settleAgain();
    };
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    window.addEventListener("storage", told);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("storage", told);
    };
  }, [browser, isAble, signedIn, settleAgain]);

  const publicKey = key.data ?? null;
  const flip = useCallback(
    (on: boolean) => {
      if (isBusy || account === undefined || (on && publicKey === null)) return;
      // Asked at once, while the press is fresh: a browser asks its user only then.
      const asked: Promise<PushHere & { why?: PushRefusal }> =
        on && publicKey !== null
          ? switchPushOn(browser, api, publicKey, account)
          : switchPushOff(browser, api, account);
      setBusy(true);
      setFailure(null);
      void asked
        .then(
          ({ on: isNowOn, deviceId: id, why }) => {
            // An answer that comes once the screen is gone, or once another account has its
            // place, is kept nowhere: whoever reads that account's answer by then, a page
            // that was come back to, is answered anew, by what the browser holds now.
            if (!known.current.isMounted || known.current.account !== account) {
              void queryClient.invalidateQueries({ queryKey: hereKey });
              return;
            }
            queryClient.setQueryData<PushHere>(hereKey, { on: isNowOn, deviceId: id });
            // Someone who closes the browser's question, or answers no, is shown where things
            // stand: nothing went wrong.
            if (why === "full") setFailure("full");
            if (why === "failed") setFailure("on");
          },
          () => setFailure(on ? "on" : "off"),
        )
        .finally(() => {
          if (!known.current.isMounted) return;
          setLeave(browser.leave());
          setBusy(false);
          void queryClient.invalidateQueries({ queryKey: devicesKey });
        });
    },
    [account, api, browser, devicesKey, hereKey, isBusy, publicKey, queryClient],
  );

  const [removing, setRemoving] = useState<string[]>([]);
  const remove = (device: PushDevice) => {
    // This device is removed as it is switched off: the browser lets go too.
    if (device.id === deviceId) return flip(false);
    if (removing.includes(device.id)) return;
    setRemoving((ids) => [...ids, device.id]);
    void api
      .remove(device.id, account ?? "")
      .then(() =>
        queryClient.setQueryData<PushDevice[]>(devicesKey, (listed) =>
          listed?.filter((one) => one.id !== device.id),
        ),
      )
      .catch(() => void toast.error(m.push_remove_failed()))
      .finally(() => {
        setRemoving((ids) => ids.filter((id) => id !== device.id));
        void queryClient.invalidateQueries({ queryKey: devicesKey });
      });
  };

  // A list that is newer than what this browser was told, and that has not its device: it was
  // removed from another one, and the browser asks again. Once for a list: the answer is newer
  // than the list, whatever it is, so that a failure does not ask in a circle.
  const isListed = devices.data?.some((device) => device.id === deviceId) ?? true;
  const isNewer = devices.dataUpdatedAt > Math.max(here.dataUpdatedAt, here.errorUpdatedAt);
  const isIdle = !isBusy && !devices.isFetching && !here.isFetching;
  useEffect(() => {
    if (deviceId !== null && !isListed && isNewer && isIdle) settleAgain();
  }, [deviceId, isListed, isNewer, isIdle, settleAgain]);

  // The instance first: where it sends no push, nothing else matters. Then the browser. One
  // that could not be read is not said to be off: push may be on there.
  const isUnsure = isAble && here.isError && here.data === undefined;
  const state: PushState =
    key.isPending || (isAble && here.isPending && !here.isError)
      ? { kind: "loading" }
      : key.isError
        ? { kind: "unknown" }
        : key.data === null
          ? { kind: "none" }
          : ability !== "able"
            ? { kind: ability }
            : leave === "denied"
              ? { kind: "refused" }
              : isUnsure
                ? { kind: "unsure" }
                : { kind: isOn ? "on" : "off", isBusy, failure };

  return {
    state,
    devices: { data: devices.data, isPending: devices.isLoading, isError: devices.isError },
    deviceId,
    removing,
    onSwitch: flip,
    onRemove: remove,
    onRetry: () => {
      if (key.isError) void key.refetch();
      if (isUnsure) settleAgain();
    },
  };
}
