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

  it("takes the apps' clients as further audiences of an ID token, the web's first", () => {
    const web = { GOOGLE_CLIENT_ID: "web-client", GOOGLE_CLIENT_SECRET: "made-up" };
    expect(googleProvider(web).google?.clientId).toBe("web-client");
    expect(
      googleProvider({ ...web, GOOGLE_IOS_CLIENT_ID: "ios-client", GOOGLE_ANDROID_CLIENT_ID: "" })
        .google?.clientId,
    ).toEqual(["web-client", "ios-client"]);
    expect(
      googleProvider({
        ...web,
        GOOGLE_IOS_CLIENT_ID: "ios-client",
        GOOGLE_ANDROID_CLIENT_ID: "android-client",
      }).google?.clientId,
    ).toEqual(["web-client", "ios-client", "android-client"]);
  });

  it("refuses an app's client without the web's", () => {
    expect(() => googleProvider({ GOOGLE_IOS_CLIENT_ID: "ios-client" })).toThrow(
      "GOOGLE_IOS_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID need GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
    );
  });
});
