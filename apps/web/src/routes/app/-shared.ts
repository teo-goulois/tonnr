import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { forgetPass, keepPass, keptPass, readWithLink, readWithoutLink } from "@/lib/shared-link";
import { client } from "@/utils/orpc";

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

/**
 * Opens the list a link names. An account opens it with its session. A visitor opens it with the
 * link itself, which the API is then told on every call: the first answer says whether a
 * password is asked, and the browser keeps what stands for it once it was given.
 */
async function open(token: string, password: string | undefined, signedIn: boolean) {
  const kept = keptPass(token);
  if (signedIn) {
    readWithoutLink();
    // What stood for the password before the reader signed in still does.
    const opened = await client.v1.shared.open({
      token,
      ...(password !== undefined && { password }),
      ...(kept && { pass: kept }),
    });
    if (!opened.locked) keepPass(token, opened.pass);
    return opened;
  }

  if (kept !== undefined && password === undefined) {
    readWithLink(token, kept || null);
    try {
      return await client.v1.shared.open({ token });
    } catch (error) {
      // The password changed since: it is asked again.
      if (codeOf(error) !== "UNAUTHORIZED") throw error;
      forgetPass(token);
    }
  }

  readWithoutLink();
  const opened = await client.v1.shared.open({
    token,
    ...(password !== undefined && { password }),
  });
  if (!opened.locked) {
    keepPass(token, opened.pass);
    readWithLink(token, opened.pass);
  }
  return opened;
}

/** The list a link opens, and what stands in its way: a password, or a link that is no more. */
export function useSharedList(token: string, signedIn: boolean) {
  const [password, setPassword] = useState<string>();
  const opened = useQuery({
    queryKey: ["shared-list", token, signedIn, password],
    queryFn: () => open(token, password, signedIn),
    retry: false,
    // The list is read again when the reader comes back to it, not on every render.
    staleTime: 60 * 1000,
    // The door says itself what it could not open.
    meta: { quiet: true },
  });
  const code = codeOf(opened.error);

  return {
    list: opened.data && !opened.data.locked ? opened.data.list : undefined,
    pass: opened.data && !opened.data.locked ? opened.data.pass : null,
    // The password that opened it, which keeping the list asks for again.
    password,
    state: opened.data
      ? opened.data.locked
        ? ("locked" as const)
        : ("open" as const)
      : opened.isPending
        ? password === undefined
          ? ("opening" as const)
          : ("locked" as const)
        : code === "NOT_FOUND"
          ? ("missing" as const)
          : code === "FORBIDDEN" || code === "TOO_MANY_REQUESTS"
            ? ("locked" as const)
            : ("failed" as const),
    isChecking: opened.isFetching && password !== undefined,
    // Why the password was not taken: a wrong one, or too many of them.
    refusal:
      !opened.isFetching && code === "FORBIDDEN"
        ? ("wrong" as const)
        : !opened.isFetching && code === "TOO_MANY_REQUESTS"
          ? ("closed" as const)
          : undefined,
    onPassword: setPassword,
    onRetry: () => void opened.refetch(),
  };
}
