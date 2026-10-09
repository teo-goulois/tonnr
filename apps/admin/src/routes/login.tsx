import { APP_NAME } from "@repo/config/app";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SignInForm } from "@/components/auth/sign-in-form";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto grid w-full max-w-(--container-sm) content-start gap-l px-m py-xxl">
      <h1 className="text-l font-medium">{m.app_title({ name: APP_NAME })}</h1>
      <SignInForm onSuccess={() => void navigate({ to: "/" })} />
    </main>
  );
}
