import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { XIcon } from "@repo/ui/icon";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { AuthForm, type AuthMode } from "./auth-form";

type AuthRequest = {
  mode?: AuthMode;
  // Why an account is needed here, such as "Sign in to save Les Pierres Noires."
  reason?: string;
  // What the visitor was doing, picked up once they are signed in.
  onSignedIn?: () => void;
};

const AuthPromptContext = createContext<(request?: AuthRequest) => void>(() => {});

/** Opens the sign-in dialog. An action that needs an account calls it instead of failing. */
export function useAuthPrompt() {
  return useContext(AuthPromptContext);
}

export function AuthPromptProvider({
  children,
  onSignedIn,
}: {
  children: ReactNode;
  // Runs after every sign-in, before the request's own follow-up.
  onSignedIn?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Kept after the dialog closes, so its text does not change while it fades out.
  const [request, setRequest] = useState<AuthRequest>({});
  const [mode, setMode] = useState<AuthMode>("sign-in");

  const prompt = useCallback((next: AuthRequest = {}) => {
    setRequest(next);
    setMode(next.mode ?? "sign-in");
    setOpen(true);
  }, []);
  const value = useMemo(() => prompt, [prompt]);

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="w-[min(26rem,calc(100vw-2rem))] gap-m p-l">
          <div className="flex items-start justify-between gap-s">
            <div className="grid gap-xxs">
              <DialogTitle>
                {mode === "sign-up" ? m.auth_create_account() : m.auth_sign_in()}
              </DialogTitle>
              {request.reason && <DialogDescription>{request.reason}</DialogDescription>}
            </div>
            <DialogClose
              aria-label={m.action_close()}
              render={<Button variant="ghost" size="icon" className="-mt-xs -mr-xs" />}
            >
              <XIcon data-slot="icon" aria-hidden />
            </DialogClose>
          </div>
          <AuthForm
            mode={mode}
            onModeChange={setMode}
            onSuccess={() => {
              setOpen(false);
              onSignedIn?.();
              request.onSignedIn?.();
            }}
          />
        </DialogPopup>
      </Dialog>
    </AuthPromptContext.Provider>
  );
}
