import { ENV } from "../env.public";

// What the page where an account signs an agent in is asked: decision 047. An assistant
// sends the account's browser to the API, which sends it on to `/connect` with a query that
// the API signed, after a `#`: the browser keeps it, and no server reads it. The page gives
// that query back as it came: the API reads its signature.

const KEPT = "connect:asked";

/** What an assistant asked for, as the page needs it. */
export type Asked = {
  // The query as the API wrote it, without its question mark.
  query: string;
  clientId: string;
  // What the token would let do, in the API's words.
  scopes: string[];
  // Where the answer goes: the host the assistant is sent back to. Null when it has none,
  // as an app on the account's own machine.
  returnsTo: string | null;
};

/**
 * Reads a query of the API's. Null for one that is none: the page was opened by its address
 * alone, or the query lost its signature on the way.
 */
export function readAsked(search: string): Asked | null {
  const query = search.replace(/^\?/, "");
  const asked = new URLSearchParams(query);
  const clientId = asked.get("client_id");
  if (!clientId || !asked.get("sig")) return null;

  const back = asked.get("redirect_uri");
  const host = back && URL.canParse(back) ? new URL(back).host : "";
  return {
    query,
    clientId,
    scopes: (asked.get("scope") ?? "").split(" ").filter(Boolean),
    returnsTo: host || null,
  };
}

/**
 * What the app was opened with, read once as it starts: what follows `#` in the address. It
 * is kept for this tab, so that a sign-in that leaves the page and comes back without it, as
 * one by another service does, finds it.
 */
function atStart(): Asked | null {
  if (typeof window === "undefined") return null;
  if (!/^\/(fr\/)?connect\/?$/.test(window.location.pathname)) return null;
  const asked = readAsked(window.location.hash.replace(/^#/, ""));
  try {
    if (asked) window.sessionStorage.setItem(KEPT, asked.query);
    else return readAsked(window.sessionStorage.getItem(KEPT) ?? "");
  } catch {
    // A browser that keeps nothing: the page works without a sign-in that leaves it.
  }
  return asked;
}

const ASKED = atStart();

/** What the assistant asked for when the app was opened on the page. Null when nothing. */
export const askedAtStart = () => ASKED;

const api = () => ENV.VITE_SERVER_URL.replace(/\/$/, "");

/**
 * Where the browser goes once the account is signed in: back to the API, which asks again
 * with the session it now finds, and sends on to the page's question or to the assistant.
 */
export const continueAddress = (asked: Asked) =>
  `${api()}/api/auth/oauth2/authorize?${asked.query}`;

/** What an assistant says of itself: its own word, which nobody checked. */
export type AgentClient = { name: string | null; site: string | null };

/** Asks the API what the assistant named itself. It takes the account's session. */
export async function clientOf(asked: Asked): Promise<AgentClient> {
  const answered = await fetch(
    `${api()}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(asked.clientId)}`,
    { credentials: "include" },
  );
  if (!answered.ok) throw new Error(`The API answered ${answered.status}`);
  const said = (await answered.json()) as { client_name?: unknown; client_uri?: unknown };
  return {
    name: typeof said.client_name === "string" && said.client_name.trim() ? said.client_name : null,
    site:
      typeof said.client_uri === "string" && URL.canParse(said.client_uri) ? said.client_uri : null,
  };
}

/**
 * Tells the API what the account answered. The API says where the browser goes next: back to
 * the assistant, with what it trades for a token, or with the account's refusal.
 */
export async function answer(asked: Asked, accept: boolean): Promise<string> {
  const answered = await fetch(`${api()}/api/auth/oauth2/consent`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accept, oauth_query: asked.query }),
  });
  const said = (await answered.json().catch(() => null)) as { url?: unknown } | null;
  if (!answered.ok || typeof said?.url !== "string") {
    throw new Error(`The API answered ${answered.status}`);
  }
  return said.url;
}
