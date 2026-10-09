import { ORPCError } from "@orpc/client";
import { redirect } from "@tanstack/react-router";

import { pageOf } from "@/lib/page";
import { readBy, readByNoOne } from "@/lib/reader";
import type { RouterAppContext } from "@/routes/__root";

/**
 * The account that is signed in, as the API gives it. Without one, the reader goes to the
 * sign-in, which leads back to the page that was asked for. It is the API that keeps anyone
 * out: this only chooses what to show.
 *
 * It is also where the page learns whose answers it holds. They are dropped when the account
 * is another than the one that loaded them, and when there is none.
 */
export async function signedIn({ orpc, queryClient }: RouterAppContext, href: string) {
  const who = orpc.v1.account.get.queryOptions({ meta: { quiet: true } });
  // An answer under thirty seconds old is taken as it is, so that going from page to page
  // asks nothing. Not when asking again has failed since: a refusal is then the latest word,
  // and the answer before it says who was signed in.
  const failed = queryClient.getQueryState(who.queryKey)?.status === "error";
  try {
    const account = await queryClient.fetchQuery({ ...who, staleTime: failed ? 0 : 30 * 1000 });
    readBy(queryClient, account.id, { queryKey: orpc.v1.account.key() });
    return account;
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
      readByNoOne(queryClient);
      const asked = pageOf(href);
      throw redirect({ to: "/login", search: asked === "/" ? {} : { to: asked } });
    }
    throw error;
  }
}
