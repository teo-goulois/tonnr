import { type ExecFileSyncOptions, execFileSync, spawnSync } from "node:child_process";
import { createECDH, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { encryptPush } from "./encrypt";
import { base64url } from "./keys";

// What the apps for phones open a push with is the app's own code, in Swift for the iPhone's
// extension and in Kotlin for the Android app's service: each is compiled here, off the phone,
// and given the example of RFC 8291 that `encrypt.test.ts` checks `encryptPush` against, then
// pushes that `encryptPush` wrote, so that the three agree. A machine without the compilers, as
// CI is, skips them: a Mac with Xcode for Swift, and `kotlinc` with a JDK for Kotlin. Decision 072.

const app = path.resolve(import.meta.dirname, "../../../apps/native");
const sources = {
  swift: [
    path.join(app, "targets/notifications/NotificationService.swift"),
    path.join(app, "modules/push-keys/test/ios/main.swift"),
  ],
  kotlin: [
    path.join(app, "modules/push-keys/android/src/main/java/app/tonnr/pushkeys/WebPush.kt"),
    path.join(app, "modules/push-keys/android/src/main/java/app/tonnr/pushkeys/PushKeys.kt"),
    path.join(app, "modules/push-keys/test/android/OpenPush.kt"),
  ],
};

const runs = (command: string, ...args: string[]) =>
  spawnSync(command, args, { stdio: "ignore" }).status === 0;
const hasSwift = process.platform === "darwin" && runs("xcrun", "--find", "swiftc");
const hasKotlin = runs("kotlinc", "-version") && runs("java", "-version");

// Compiled once for each version of its sources, and kept where the system keeps what is temporary.
function built(kind: "swift" | "kotlin") {
  const hash = createHash("sha256");
  for (const file of sources[kind]) hash.update(readFileSync(file));
  const folder = path.join(tmpdir(), `tonnr-open-push-${kind}-${hash.digest("hex").slice(0, 16)}`);
  const program = path.join(folder, kind === "swift" ? "open-push" : "open-push.jar");
  if (!existsSync(program)) {
    mkdirSync(folder, { recursive: true });
    if (kind === "swift") {
      execFileSync("xcrun", ["swiftc", "-O", ...sources.swift, "-o", program], { stdio: "pipe" });
    } else {
      execFileSync("kotlinc", [...sources.kotlin, "-include-runtime", "-d", program], {
        stdio: "pipe",
      });
    }
  }
  return program;
}

const quietly: ExecFileSyncOptions = { stdio: ["ignore", "pipe", "pipe"] };

type Receiver = { privateKey: string; publicKey: string; auth: string };

function opened(kind: "swift" | "kotlin", receiver: Receiver, body: string) {
  const program = built(kind);
  const said =
    kind === "swift"
      ? execFileSync(program, [receiver.privateKey, receiver.auth, body], quietly)
      : execFileSync(
          "java",
          [
            "-cp",
            program,
            "OpenPushKt",
            receiver.privateKey,
            receiver.publicKey,
            receiver.auth,
            body,
          ],
          quietly,
        );
  return said.toString("utf8");
}

// The example of RFC 8291, section 5, with the values of its appendix A: the receiver's keys.
const example = {
  receiver: {
    privateKey: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
    publicKey:
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
  },
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  said: "When I grow up, I want to be a watermelon",
};

function aPhone(): Receiver {
  const curve = createECDH("prime256v1");
  curve.generateKeys();
  return {
    privateKey: base64url(curve.getPrivateKey()),
    publicKey: base64url(curve.getPublicKey()),
    auth: base64url(randomBytes(16)),
  };
}

describe.each([
  { kind: "swift" as const, phone: "the iPhone's extension", present: hasSwift },
  { kind: "kotlin" as const, phone: "the Android app's service", present: hasKotlin },
])("a push opened by $phone", ({ kind, present }) => {
  it.skipIf(!present)("says what the standard's own example says", { timeout: 300_000 }, () => {
    expect(opened(kind, example.receiver, example.body)).toBe(example.said);
  });

  it.skipIf(!present)(
    "says what the instance encrypted for the phone",
    { timeout: 300_000 },
    () => {
      const phone = aPhone();
      const said = JSON.stringify({
        title: "Leucate · 1,2 m à 9 s",
        body: "Demain 8 h–11 h 🌊",
        url: "https://tonnr.app/app?break=b1",
        tag: "alert:a1",
        category: "today",
      });
      const body = encryptPush(Buffer.from(said), { p256dh: phone.publicKey, auth: phone.auth });
      if (!body) throw new Error("not encrypted");

      expect(opened(kind, phone, base64url(body))).toBe(said);
    },
  );

  it.skipIf(!present)("does not open a push for another phone", { timeout: 300_000 }, () => {
    const phone = aPhone();
    const other = aPhone();
    const body = encryptPush(Buffer.from("for one phone"), {
      p256dh: phone.publicKey,
      auth: phone.auth,
    });
    if (!body) throw new Error("not encrypted");

    expect(() => opened(kind, other, base64url(body))).toThrow();
  });
});
