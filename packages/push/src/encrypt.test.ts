import { createECDH, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PUSH_BYTES, encryptPush } from "./encrypt";
import { base64url } from "./keys";
import { testReceiver } from "./testing";

const bytes = (text: string) => Buffer.from(text, "base64url");

describe("what a push holds, encrypted for a browser", () => {
  // The example of RFC 8291, section 5, with the values of its appendix A.
  const example = {
    said: "When I grow up, I want to be a watermelon",
    receiver: {
      p256dh:
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      auth: "BTBZMqHH6r4Tts7J_aSIgg",
    },
    chosen: {
      salt: bytes("DGv6ra1nlYgDCS1FRnbzlw"),
      privateKey: bytes("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
    },
    body:
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
      "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
      "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  };

  it("is the body the standard gives for its own example", () => {
    const body = encryptPush(Buffer.from(example.said), example.receiver, example.chosen);

    expect(base64url(body ?? Buffer.alloc(0))).toBe(example.body);
  });

  it("is read by the browser it was written for, and by no other", () => {
    const browser = testReceiver();
    const other = testReceiver();
    const said = JSON.stringify({ title: "La baie : c’est le moment", body: "Le banc 🌊" });

    const body = encryptPush(Buffer.from(said), browser.keys);

    if (!body) throw new Error("not encrypted");
    expect(browser.open(body)).toBe(said);
    expect(() => other.open(body)).toThrow();
    // Nothing of what it says is in what travels.
    expect(Buffer.from(body).toString("latin1")).not.toContain("baie");
  });

  it("is another body each time, for the same words to the same browser", () => {
    const browser = testReceiver();
    const said = Buffer.from("the same words");

    const first = encryptPush(said, browser.keys);
    const second = encryptPush(said, browser.keys);

    expect(first?.equals(second ?? Buffer.alloc(0))).toBe(false);
    expect(browser.open(first ?? Buffer.alloc(0))).toBe("the same words");
    expect(browser.open(second ?? Buffer.alloc(0))).toBe("the same words");
  });

  it("is not read once a byte of it has changed", () => {
    const browser = testReceiver();
    const body = encryptPush(Buffer.from("as it was written"), browser.keys);
    if (!body) throw new Error("not encrypted");

    const last = body.length - 1;
    body[last] = (body[last] ?? 0) ^ 1;

    expect(() => browser.open(body)).toThrow();
  });

  it("holds as much as one record does, and no more", () => {
    const browser = testReceiver();

    const full = encryptPush(Buffer.alloc(PUSH_BYTES, "a"), browser.keys);

    // A push service need not take more than 4096 bytes.
    expect(full).toHaveLength(4096);
    expect(browser.open(full ?? Buffer.alloc(0))).toHaveLength(PUSH_BYTES);
    expect(encryptPush(Buffer.alloc(PUSH_BYTES + 1, "a"), browser.keys)).toBeNull();
  });

  it("is not written for keys that are not a browser's", () => {
    const { keys } = testReceiver();
    const said = Buffer.from("words");
    // A point that is not on the curve: the right length, and the first byte of a whole point.
    const offCurve = base64url(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]));
    const compressed = createECDH("prime256v1").generateKeys("base64url", "compressed");

    for (const receiver of [
      { ...keys, p256dh: offCurve },
      { ...keys, p256dh: compressed },
      { ...keys, p256dh: `${keys.p256dh}=` },
      { ...keys, p256dh: "" },
      { ...keys, auth: base64url(randomBytes(15)) },
      { ...keys, auth: base64url(randomBytes(17)) },
      { ...keys, auth: `${keys.auth.slice(0, -1)}+` },
    ]) {
      expect(encryptPush(said, receiver), JSON.stringify(receiver)).toBeNull();
    }
  });
});
