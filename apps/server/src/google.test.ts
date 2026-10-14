import { googleProvider } from "@repo/auth/google";
import { describe, expect, it } from "vitest";

describe("Google credentials", () => {
  it("leaves an instance without credentials on email sign-in", () => {
    expect(googleProvider({})).toEqual({});
    expect(googleProvider({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" })).toEqual({});
  });

  it("refuses incomplete credentials without printing their values", () => {
    expect(() => googleProvider({ GOOGLE_CLIENT_ID: "made-up" })).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    );
    expect(() => googleProvider({ GOOGLE_CLIENT_SECRET: "made-up" })).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    );
  });
});
