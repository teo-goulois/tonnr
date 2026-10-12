import { readFileSync } from "node:fs";
import path from "node:path";

import { createPusher } from "@repo/push";
import { describe, expect, it } from "vitest";

import { pushKeys } from "./push-keys";

describe("the command that makes an instance's pair of keys", () => {
  // The shape the instance's settings ask of each key, as the schema that checks them at
  // startup writes it: a pair the command made must never stop a container.
  const schema = readFileSync(
    path.resolve(import.meta.dirname, "../../server/.env.schema"),
    "utf8",
  );
  const shapeOf = (name: string) => {
    const [, shape] = new RegExp(`matches=/(.+)/\\)\\n${name}=`).exec(schema) ?? [];
    if (!shape) throw new Error(`The settings give no shape to ${name}`);
    return new RegExp(shape);
  };
  const read = (lines: string[]) =>
    Object.fromEntries(lines.map((line) => line.split("=") as [string, string]));

  it("gives two lines of a settings file, of the shape the settings take, every time", () => {
    const shapes = {
      VAPID_PUBLIC_KEY: shapeOf("VAPID_PUBLIC_KEY"),
      VAPID_PRIVATE_KEY: shapeOf("VAPID_PRIVATE_KEY"),
    };
    // A private key that begins with a zero byte comes about once in 256.
    for (let made = 0; made < 2000; made += 1) {
      const { lines } = pushKeys(false);
      expect(lines).toHaveLength(2);
      const keys = read(lines);
      expect(Object.keys(keys)).toEqual(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]);
      expect(keys.VAPID_PUBLIC_KEY).toMatch(shapes.VAPID_PUBLIC_KEY);
      expect(keys.VAPID_PRIVATE_KEY).toMatch(shapes.VAPID_PRIVATE_KEY);
    }
  });

  it("gives a pair that an instance sends push with, and another each time", () => {
    const first = read(pushKeys(false).lines);
    const second = read(pushKeys(false).lines);

    expect(createPusher(first, "https://app.example.org")).not.toBeNull();
    expect(second.VAPID_PRIVATE_KEY).not.toBe(first.VAPID_PRIVATE_KEY);
  });

  it("says what a new pair ends on an instance that holds one, and keeps the keys out of its notes", () => {
    const fresh = pushKeys(false);
    const again = pushKeys(true);

    expect(fresh.notes.join(" ")).not.toContain("already");
    expect(again.notes.join(" ")).toContain("holds a pair already");
    for (const line of again.lines) {
      expect(again.notes.join(" ")).not.toContain(line.split("=")[1]);
    }
  });
});
