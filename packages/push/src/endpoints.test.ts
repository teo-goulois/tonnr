import { describe, expect, it } from "vitest";

import { isPushEndpoint } from "./endpoints";

describe("isPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/invented-one",
    "https://updates.push.services.mozilla.com/wpush/v2/invented-two",
    "https://web.push.apple.com/invented-three",
    "https://wns2-par02p.notify.windows.com/w/?token=invented-four",
    "https://FCM.googleapis.com/fcm/send/invented-five",
  ])("takes an address of a browser's push service: %s", (address) => {
    expect(isPushEndpoint(address)).toBe(true);
  });

  it.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/invented"],
    ["another host", "https://push.example.org/invented"],
    ["a host that only begins like one", "https://fcm.googleapis.com.example.org/invented"],
    ["a host that only ends like one", "https://evilpush.apple.com/invented"],
    ["the bare name of Apple's push hosts", "https://push.apple.com/invented"],
    ["APNs's own host, which an app is pushed through", "https://api.push.apple.com/3/device/a"],
    ["APNs's host for development builds", "https://api.sandbox.push.apple.com/3/device/a"],
    ["another host of Apple's", "https://other.push.apple.com/invented"],
    ["the bare name a dot stands under", "https://notify.windows.com/invented"],
    ["this machine", "https://localhost/invented"],
    ["an address in figures", "https://127.0.0.1/invented"],
    ["another port", "https://fcm.googleapis.com:8443/fcm/send/invented"],
    ["a name and a password", "https://someone:secret@fcm.googleapis.com/fcm/send/invented"],
    ["a host with a dot after it", "https://fcm.googleapis.com./fcm/send/invented"],
    ["a fragment, which no service is sent", "https://fcm.googleapis.com/fcm/send/invented#two"],
    ["an empty fragment", "https://fcm.googleapis.com/fcm/send/invented#"],
    ["no address at all", "not an address"],
    ["nothing", ""],
  ])("refuses %s", (_what, address) => {
    expect(isPushEndpoint(address)).toBe(false);
  });
});
