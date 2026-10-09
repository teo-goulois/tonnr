import { APP_NAME } from "@repo/config/app";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { SignInForm } from "@/components/auth/sign-in-form";
import { pageOf } from "@/lib/page";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/login")({
  // The page that sent the reader here, to go back to. An address is written by whoever made
  // the link, and the router hands down what no route has checked: only a page of this app
  // is kept.
  validateSearch: (search): { to?: string } => {
    const to = pageOf(search.to);
    return to === "/" ? {} : { to };
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  const to = pageOf(Route.useSearch().to);

  return (
    <main className="mx-auto grid w-full max-w-(--container-sm) content-start gap-l px-m py-xxl">
      <h1 className="text-l font-medium">{m.app_title({ name: APP_NAME })}</h1>
      <SignInForm
        onSuccess={() => {
          // A session that ended without a sign-out left what it loaded in memory. The account
          // that signs in now may be another: it starts from nothing.
          queryClient.clear();
          router.history.push(to);
        }}
      />
    </main>
  );
}
