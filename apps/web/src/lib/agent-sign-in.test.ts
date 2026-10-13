import { describe, expect, it } from "vitest";

import { readAsked } from "./agent-sign-in";

describe("readAsked", () => {
  const query =
    "response_type=code&client_id=abc&redirect_uri=https%3A%2F%2Fagent.example%2Fcallback" +
    "&scope=read+offline_access&exp=1791919541&ba_param=client_id&ba_param=scope&sig=signed";

  it("reads what the API signed, and gives the query back as it came", () => {
    expect(readAsked(`?${query}`)).toEqual({
      query,
      clientId: "abc",
      scopes: ["read", "offline_access"],
      returnsTo: "agent.example",
    });
  });

  it("names no host for an app that is sent back to its own machine by a scheme", () => {
    const asked = readAsked("client_id=abc&redirect_uri=com.example.agent%3A%2Fcallback&sig=s");
    expect(asked?.returnsTo).toBeNull();
    expect(
      readAsked("client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fcb&sig=s"),
    ).toMatchObject({ returnsTo: "localhost:5000" });
  });

  it("reads nothing of an address that the API did not sign", () => {
    expect(readAsked("")).toBeNull();
    expect(readAsked("?client_id=abc")).toBeNull();
    expect(readAsked("?sig=signed")).toBeNull();
  });
});
