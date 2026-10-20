import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

import type { PlacesNowInput } from "@/components/saved/sea-now";
import { type SeaReader, useAccountReader } from "@/components/saved/use-sea-now";

import { codeOf } from "./items";
import { isListToken } from "./links";
import { holdLink, keepPass, keptPass } from "./shared-link";

// The list a link opens, `/l/<token>` on the web and `/shared/<token>` in the app, as the web's
// `useSharedList` opens it (apps/web/src/routes/app/-shared.ts): an account with its session, a
// visitor with the link itself. The first answer says whether a password is asked, and the phone
// keeps what stands for it once it was given, so that the list opens again without it. Decision
// 035.

async function open(token: string, password: string | undefined) {
  // What stood for the password before, on this phone, whoever is signed in now.
  const kept = password === undefined ? await keptPass(token) : undefined;
  const opened = await orpc.v1.shared.open.call({
    token,
    ...(password !== undefined && { password }),
    ...(kept && { pass: kept }),
  });
  if (!opened.locked) await keepPass(token, opened.pass);
  // The password changed since, or the link did: it is asked again.
  else if (kept) await keepPass(token, null);
  return opened;
}

/** Where the reader stands before the list: on the way, at its password, or at a link that opens none. */
export type DoorState = "opening" | "locked" | "missing" | "failed" | "open";

export function useSharedList(token: string) {
  const { signedIn, pending } = useAccount();
  const [password, setPassword] = useState<string>();
  const valid = isListToken(token);
  const opened = useQuery({
    queryKey: ["shared-list", token, signedIn, password],
    queryFn: () => open(token, password),
    enabled: valid && !pending,
    retry: false,
    // Read again when the reader comes back to it, not on every render.
    staleTime: 60 * 1000,
  });
  // Who shares it, as the last answer said: a password tried since, while it is checked and once
  // it is refused, has no answer of its own, and the door goes on saying whose list it is.
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    if (opened.data) setOwner(opened.data.owner);
  }, [opened.data]);
  const answer = opened.data && !opened.data.locked ? opened.data : undefined;
  const list = answer?.list;
  const pass = answer?.pass ?? null;
  const code = codeOf(opened.error);

  // A visitor reads the list's places, the map and a place's sheet by the link while the list
  // is shown. An account reads with its session.
  const byLink = !signedIn && list !== undefined && list.access === "link";
  useEffect(() => (byLink ? holdLink(token, pass) : undefined), [byLink, token, pass]);

  const state: DoorState = !valid
    ? "missing"
    : opened.data
      ? opened.data.locked
        ? "locked"
        : "open"
      : opened.isPending
        ? password === undefined
          ? "opening"
          : "locked"
        : code === "NOT_FOUND"
          ? "missing"
          : code === "FORBIDDEN" || code === "TOO_MANY_REQUESTS"
            ? "locked"
            : "failed";

  return {
    list,
    pass,
    /** The username of whoever shares the list, which a locked one says too. */
    owner: opened.data ? opened.data.owner : owner,
    /** The password that opened it, which keeping the list asks for again. */
    password,
    byLink,
    state,
    isChecking: opened.isFetching && password !== undefined,
    /** Why the password was not taken: a wrong one, or too many of them. */
    refusal:
      !opened.isFetching && code === "FORBIDDEN"
        ? ("wrong" as const)
        : !opened.isFetching && code === "TOO_MANY_REQUESTS"
          ? ("closed" as const)
          : undefined,
    /** Tries a password: the same one again, after a refusal, is asked again too. */
    onPassword: (given: string) => {
      if (given === password) void opened.refetch();
      else setPassword(given);
    },
    refetch: () => opened.refetch(),
    isFetching: opened.isFetching,
  };
}

/**
 * Who asks the sea at a shared list's places: a visitor by the link, which answers its spots
 * too, and an account by its session, which answers its spots once it kept the list.
 */
export function useSharedReader(token: string, pass: string | null, byLink: boolean): SeaReader {
  const account = useAccountReader();
  return useMemo(
    () =>
      byLink
        ? {
            key: `link:${token}:${pass ?? ""}`,
            // The link is held for the call itself, whatever the screen holds by then.
            ask: async (input: PlacesNowInput) => {
              const release = holdLink(token, pass);
              try {
                return await orpc.v1.places.now.call(input);
              } finally {
                release();
              }
            },
          }
        : account,
    [byLink, token, pass, account],
  );
}
