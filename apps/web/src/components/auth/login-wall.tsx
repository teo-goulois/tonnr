import { APP_NAME } from "@repo/config/app";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";

import { AuthForm, type AuthMode } from "./auth-form";

type LoginWallProps = {
  // Runs once the visitor is signed in, or has an account.
  onSignedIn: () => void;
};

/**
 * What the product shows in place of the map while the instance is closed to visitors: why, and
 * the form that signs in or creates an account. Decision 039.
 */
export function LoginWall({ onSignedIn }: LoginWallProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");

  return (
    <main className="mx-auto grid w-full max-w-(--container-sm) content-start gap-l px-m py-xl">
      <div className="grid gap-xs">
        <h1 className="text-l font-medium">{m.wall_title()}</h1>
        <p className="text-neutral-7">{m.wall_text({ name: APP_NAME })}</p>
      </div>
      <AuthForm mode={mode} onModeChange={setMode} onSuccess={onSignedIn} />
    </main>
  );
}
