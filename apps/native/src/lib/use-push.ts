import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { feel } from "@/components/ui/haptics";
import { orpc } from "@/utils/orpc";

import { startsByPush } from "../../modules/live-activities";
import {
  activitiesSwitchedOn,
  setActivitiesSwitch,
  useActivitiesSwitch,
  useSystemActivities,
} from "./activity-start";
import { permission, pushDeviceId, pushIsOn, renewPush, switchPushOff, switchPushOn } from "./push";

/** What the row "On this device" says: what stands in the way of its switch, or the switch. */
export type PhonePushState =
  | { kind: "loading" }
  // The instance's answer could not be read: push may be on, and is not said to be off.
  | { kind: "unknown" }
  // The instance pushes to no app of this phone's kind (decision 072).
  | { kind: "none" }
  // The system was asked and said no: only its settings can change it now.
  | { kind: "refused" }
  | { kind: "on" | "off"; isBusy: boolean; failure?: "on" | "off" | "full" };

/**
 * What the row of the iPhone's Live Activities says, decision 074: none where the instance starts
 * none, the phone cannot be started one by a push or push is off here; the system's own switch
 * that is off; or the switch of its own, off until the account turns it on.
 */
export type ActivitiesState =
  | { kind: "none" }
  | { kind: "system-off" }
  | { kind: "on" | "off"; isBusy: boolean; failed: boolean };

type Device = { id: string; kind: "web" | "ios" | "android"; label: string | null; seenAt: Date };

/** What the row "On this device" and the devices under it read and ask for. */
export type PhonePush = ReturnType<typeof usePhonePush>;

// The refusal of a device past the account's ten, which names its limit (packages/api).
const isFull = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === "FORBIDDEN" &&
  typeof (error as { data?: { limit?: unknown } }).data?.limit === "number";

/**
 * Push on this phone, for the row "On this device" of the alerts' settings: whether the instance
 * pushes to this app and the system lets it notify, read again each time the app comes back,
 * the switch, and the account's devices with what removes one. Decision 072.
 */
export function usePhonePush(account: string | undefined) {
  const queryClient = useQueryClient();
  const key = useQuery({ ...orpc.v1.push.key.queryOptions(), enabled: account !== undefined });
  const devicesQuery = orpc.v1.push.devices.queryOptions();
  const devices = useQuery({ ...devicesQuery, enabled: account !== undefined });
  const [allowed, setAllowed] = useState<"granted" | "ask" | "refused" | null>(null);
  const [isOn, setOn] = useState(pushIsOn);
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"on" | "off" | "full">();
  const [removing, setRemoving] = useState<string[]>([]);
  const [here, setHere] = useState(pushDeviceId);
  const activitiesOn = useActivitiesSwitch();
  const systemActivities = useSystemActivities();
  const [activitiesBusy, setActivitiesBusy] = useState(false);
  const [activitiesFailed, setActivitiesFailed] = useState(false);

  // The system's answer changes in its settings, while the app is away.
  useEffect(() => {
    const read = () => {
      void permission().then(setAllowed, () => setAllowed(null));
    };
    read();
    const watching = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => watching.remove();
  }, []);

  // What the phone keeps of push, read again once something may have changed it: a switch, or a
  // renewal that let go of a device the API no longer keeps. When it was read last is kept too,
  // which a list of the devices is newer than or not.
  const readAt = useRef(0);
  const readHere = useCallback(() => {
    readAt.current = Date.now();
    setOn(pushIsOn());
    setHere(pushDeviceId());
  }, []);
  const settle = useCallback(() => {
    readHere();
    void queryClient.invalidateQueries({ queryKey: devicesQuery.queryKey });
  }, [queryClient, devicesQuery.queryKey, readHere]);

  const flip = useCallback(
    async (next: boolean) => {
      if (!account || isBusy) return;
      setBusy(true);
      setFailure(undefined);
      try {
        if (next) {
          const switched = await switchPushOn(account);
          if (!switched) setAllowed(await permission());
        } else {
          await switchPushOff(account);
        }
      } catch (error) {
        setFailure(isFull(error) ? "full" : next ? "on" : "off");
        feel("failed");
      } finally {
        setBusy(false);
        settle();
      }
    },
    [account, isBusy, settle],
  );

  const remove = useCallback(
    async (device: Device) => {
      // This phone is removed as it is switched off: it lets go of its keys too.
      if (device.id === here) return flip(false);
      if (!account || removing.includes(device.id)) return;
      setRemoving((ids) => [...ids, device.id]);
      try {
        await orpc.v1.push.remove.call({ id: device.id, account });
        queryClient.setQueryData(devicesQuery.queryKey, (listed) =>
          listed ? { devices: listed.devices.filter((one) => one.id !== device.id) } : listed,
        );
        return true;
      } catch {
        return false;
      } finally {
        setRemoving((ids) => ids.filter((id) => id !== device.id));
      }
    },
    [account, devicesQuery.queryKey, flip, here, queryClient, removing],
  );

  // The switch of the iPhone's Live Activities: the device says the token, or takes it back, as it
  // is said again at once. The switch goes back when the API did not take it.
  const flipActivities = useCallback(
    async (next: boolean) => {
      if (!account || activitiesBusy) return;
      const before = activitiesSwitchedOn();
      setActivitiesBusy(true);
      setActivitiesFailed(false);
      setActivitiesSwitch(next);
      try {
        await renewPush(account);
      } catch {
        setActivitiesSwitch(before);
        setActivitiesFailed(true);
        feel("failed");
      } finally {
        setActivitiesBusy(false);
        readHere();
      }
    },
    [account, activitiesBusy, readHere],
  );

  // A list newer than what this phone last read of push, and that has not its device: it was
  // removed from another one, and the phone says its token again, which lets go of it
  // (`renewPush`), as the web's browser asks again. Once for a list, whatever the answer, so that
  // a renewal that fails does not ask in a circle: the list is not asked for again after it.
  const isListed = devices.data?.devices.some((device) => device.id === here) ?? true;
  const isIdle = !isBusy && !activitiesBusy && !devices.isFetching;
  useEffect(() => {
    if (!account || !isOn || here === null || isListed || !isIdle) return;
    if (devices.dataUpdatedAt <= readAt.current) return;
    readAt.current = Date.now();
    void renewPush(account)
      .catch(() => undefined)
      .finally(readHere);
  }, [account, isOn, here, isListed, isIdle, devices.dataUpdatedAt, readHere]);

  const platform = Platform.OS === "ios" ? "ios" : "android";
  const state: PhonePushState =
    key.isPending || allowed === null
      ? { kind: "loading" }
      : key.isError
        ? { kind: "unknown" }
        : !key.data.apps[platform]
          ? { kind: "none" }
          : allowed === "refused"
            ? { kind: "refused" }
            : {
                kind: isOn && allowed === "granted" ? "on" : "off",
                isBusy,
                ...(failure && { failure }),
              };

  const activities: ActivitiesState =
    platform !== "ios" || state.kind !== "on" || !key.data?.apps.liveActivities || !startsByPush()
      ? { kind: "none" }
      : !systemActivities
        ? { kind: "system-off" }
        : {
            kind: activitiesOn ? "on" : "off",
            isBusy: activitiesBusy,
            failed: activitiesFailed,
          };

  return {
    state,
    activities,
    flipActivities,
    devices: devices.data?.devices ?? [],
    devicesFailed: devices.isError,
    here,
    removing,
    flip,
    remove,
    retry: () => void key.refetch(),
    // A pull of the settings asks again what the instance offers and which devices are told.
    refresh: () => {
      void key.refetch();
      void devices.refetch();
    },
  };
}
