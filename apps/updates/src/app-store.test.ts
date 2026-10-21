import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { certificateHashOf, profileNameOf, storeProfiles, tokenOf } from "./app-store.ts";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KEY = {
  id: "A1B2C3D4E5",
  issuer: "00000000-0000-0000-0000-000000000000",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const NOW = new Date("2026-10-22T10:00:00.000Z");
const fromBase64url = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

// A certificate made for this test, signed by its own key, whose serial number starts with a zero.
const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIC7DCCAdSgAwIBAgIIASNFZ4mrze8wDQYJKoZIhvcNAQELBQAwHDEaMBgGA1UE
AwwRVGVzdCBkaXN0cmlidXRpb24wHhcNMjYxMDIxMjIzNzE5WhcNMzYxMDE4MjIz
NzE5WjAcMRowGAYDVQQDDBFUZXN0IGRpc3RyaWJ1dGlvbjCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBALcnBRwIRrs34iu0o1+Cgf+Zcs4fxyODzHd22zYo
43BKXoxLWeQMS6ty24UoEU29OAIYWgJRok3R+WYmVUoQdzZrqatVORilEaEUJvdy
YjtbAk18oEoWo1KGYSRE+sa8srPckR7pp8HRc9WatJp57wTeYw4h1pgMhwQ7KBWs
g3VCtipcrs7Y3MqWTkSYsLEQVRL1dCe+f5cGd5yK6YwQYNq+aYQhcOE2qDd1vrYh
YnhVLy6tdt1wuff6FsudEGAy3R52/0C4Pa4WXJ15niosvEdNjJMMRAyDv/kQ6Zmu
9nAkUminGy/Om+9P2hvxcNILOCLPpyi0LiXJSIl/HxZri5sCAwEAAaMyMDAwHQYD
VR0OBBYEFKA0dVcTJcCdvs4HdHdtWfGrbt0EMA8GA1UdEwEB/wQFMAMBAf8wDQYJ
KoZIhvcNAQELBQADggEBAAPHQTdA5SOikEhnrL0bn5sRNzd9/rZ0AcaQavTy+R5v
1YTkf578FYM03YSkSpluQ1dVbxI74o3+z2KnAAPlS5ySqlGtxG/wxwK3qXlD3ZLP
0mcH+A87eISsaOZs8cBF69yNn7o/149y79+OSP8BXimC1eqWT0TuNMM5HVL1Eyiu
DbN5pUVHXwB5k6C94t5ta2KA92eIt/jR5+ZYu7G+CuwsyT3TiPSC1n+wYLY508WQ
+nxgF48DcN6NH57RwTcRrv3CMnsOiDmd+wfPoJggwDTyGvnN2lto6o1tKJM8rp1L
5iQZNNNQthdeWlu2FO1Nl4Xmw7UxwP2DAO4j+Yf10ZY=
-----END CERTIFICATE-----`;
const API = "https://api.appstoreconnect.apple.com";

describe("the token of App Store Connect", () => {
  it("names the key and its issuer, for twenty minutes, signed by the key", () => {
    const token = tokenOf(KEY, NOW);
    const [header = "", claims = "", signature = ""] = token.split(".");
    expect(fromBase64url(header)).toEqual({ alg: "ES256", kid: "A1B2C3D4E5", typ: "JWT" });
    const issuedAt = NOW.getTime() / 1000;
    expect(fromBase64url(claims)).toEqual({
      iss: KEY.issuer,
      iat: issuedAt,
      exp: issuedAt + 1200,
      aud: "appstoreconnect-v1",
    });
    const signed = Buffer.from(`${header}.${claims}`);
    const raw = Buffer.from(signature, "base64url");
    expect(verify("sha256", signed, { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true);
  });
});

describe("the certificate that signs", () => {
  it("is named to xcodebuild by its SHA-1", () => {
    expect(certificateHashOf(CERTIFICATE)).toBe("D87A3CF98FDE9B76CC6E9B856A31BF2E3C67CD91");
  });
});

type Asked = { method: string; url: string; body?: unknown };

/** App Store Connect as a test reads it: a team, its certificates, identifiers and profiles. */
function standInAppStore({ refuse = "", distribution = "123456789ABCDEF" } = {}) {
  const asked: Asked[] = [];
  const answer = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    asked.push({ method, url, ...(init?.body && { body: JSON.parse(String(init.body)) }) });
    if (refuse && url.includes(refuse)) return answer(403, { errors: [{ code: "FORBIDDEN" }] });
    const route = url.slice(API.length);
    if (route.startsWith("/v1/certificates")) {
      return answer(200, {
        data: [
          { id: "dev", attributes: { certificateType: "DEVELOPMENT", serialNumber: "77" } },
          {
            id: "cert-1",
            attributes: { certificateType: "DISTRIBUTION", serialNumber: distribution },
          },
        ],
      });
    }
    if (route.startsWith("/v1/bundleIds")) {
      const identifier = new URL(url).searchParams.get("filter[identifier]");
      // Apple's filter takes the identifiers that start with the one asked for.
      const known = ["app.example", "app.example.widgets"].filter((one) =>
        one.startsWith(identifier ?? ""),
      );
      return answer(200, {
        data: known.map((one) => ({ id: `bundle-${one}`, attributes: { identifier: one } })),
      });
    }
    if (route.startsWith("/v1/profiles?")) {
      const name = new URL(url).searchParams.get("filter[name]");
      return answer(200, {
        data:
          name === profileNameOf("app.example")
            ? [{ id: "old-profile", attributes: { name } }]
            : [],
      });
    }
    if (method === "DELETE") return answer(204);
    if (method === "POST" && route === "/v1/profiles") {
      const made = JSON.parse(String(init?.body)) as {
        data: { attributes: { name: string } };
      };
      return answer(201, {
        data: {
          id: "new-profile",
          attributes: {
            uuid: `uuid-${made.data.attributes.name}`,
            profileContent: Buffer.from(made.data.attributes.name).toString("base64"),
          },
        },
      });
    }
    return answer(404);
  }) as typeof fetch;
  return { asked, fetcher };
}

const make = (fetcher: typeof fetch, identifiers = ["app.example", "app.example.widgets"]) =>
  storeProfiles({ key: KEY, certificate: CERTIFICATE, identifiers, fetcher, now: NOW });

describe("the profiles of a release", () => {
  it("name the certificate alone, one for each identifier, in place of the last release's", async () => {
    const { asked, fetcher } = standInAppStore();
    const profiles = await make(fetcher);

    expect(profiles).toEqual([
      {
        identifier: "app.example",
        uuid: "uuid-app.example release",
        content: Buffer.from("app.example release"),
      },
      {
        identifier: "app.example.widgets",
        uuid: "uuid-app.example.widgets release",
        content: Buffer.from("app.example.widgets release"),
      },
    ]);
    expect(asked.filter(({ method }) => method !== "GET")).toEqual([
      { method: "DELETE", url: `${API}/v1/profiles/old-profile` },
      expect.objectContaining({ method: "POST", url: `${API}/v1/profiles` }),
      expect.objectContaining({ method: "POST", url: `${API}/v1/profiles` }),
    ]);
    expect(asked.find(({ method }) => method === "POST")?.body).toEqual({
      data: {
        type: "profiles",
        attributes: { name: "app.example release", profileType: "IOS_APP_STORE" },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: "bundle-app.example" } },
          certificates: { data: [{ type: "certificates", id: "cert-1" }] },
        },
      },
    });
  });

  it("are refused for a certificate that is not one of the team's for distribution", async () => {
    const { asked, fetcher } = standInAppStore({ distribution: "FEDCBA9876543210" });
    await expect(make(fetcher)).rejects.toThrow(/123456789ABCDEF is not one of the team's/);
    expect(asked.some(({ method }) => method === "POST")).toBe(false);
  });

  it("are refused for an identifier the team has not registered", async () => {
    const { asked, fetcher } = standInAppStore();
    await expect(make(fetcher, ["app.example.notifications"])).rejects.toThrow(
      /app.example.notifications is not an identifier of the team/,
    );
    expect(asked.some(({ method }) => method === "POST")).toBe(false);
  });

  it("say what Apple answered when it refuses", async () => {
    const { fetcher } = standInAppStore({ refuse: "/v1/profiles?" });
    await expect(make(fetcher)).rejects.toThrow(
      /refused to list the profiles named app.example release: 403/,
    );
  });
});
