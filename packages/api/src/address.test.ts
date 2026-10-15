import { describe, expect, it } from "vitest";

import { clientAddressOf } from "./address";

describe("the address a request comes from", () => {
  it("is what the proxy says in X-Real-IP first", () => {
    const headers = new Headers({ "x-real-ip": " 203.0.113.9 ", "x-forwarded-for": "10.0.0.1" });
    expect(clientAddressOf(headers, "127.0.0.1")).toBe("203.0.113.9");
  });

  it("is else the last address of X-Forwarded-For, the one the proxy added", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.2, 203.0.113.9 " });
    expect(clientAddressOf(headers, "127.0.0.1")).toBe("203.0.113.9");
    expect(clientAddressOf(new Headers({ "x-forwarded-for": " , " }), "127.0.0.1")).toBe(
      "127.0.0.1",
    );
  });

  it("is else the connection's, and none when nothing says it", () => {
    expect(clientAddressOf(new Headers(), "127.0.0.1")).toBe("127.0.0.1");
    expect(clientAddressOf(new Headers(), null)).toBeNull();
  });
});
