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
  try {
    const account = await queryClient.fetchQuery(
      orpc.v1.account.get.queryOptions({ staleTime: 30 * 1000, meta: { quiet: true } }),
    );
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
