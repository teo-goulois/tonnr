import { USERNAME_MAX, USERNAME_MIN } from "@repo/config/username";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useId, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { typedUsername, usernameFault, useUsernameFree } from "./username";

type UsernameFormProps = {
  // The account's username. Null for an account that has none yet.
  current: string | null;
  // Answers why the username was refused, or nothing once it is kept.
  onSave: (username: string) => Promise<string | undefined>;
  onSaved: (username: string) => void;
  // Left out where the form cannot be left, as on the way to a first contribution.
  onCancel?: () => void;
};

/**
 * Chooses the name others read of an account: its first, or another. It says whether the name
 * is free before it is sent, and why not once it was.
 */
export function UsernameForm({ current, onSave, onSaved, onCancel }: UsernameFormProps) {
  const id = useId();
  const [typed, setTyped] = useState(current ?? "");
  const [refusal, setRefusal] = useState<{ of: string; why: string }>();
  const [isSaving, setSaving] = useState(false);
  const [wasSent, setWasSent] = useState(false);

  const username = typedUsername(typed);
  const isFree = useUsernameFree(username, current);
  // A name that is still being typed is not told that it is short.
  const fault = wasSent || username.length >= USERNAME_MIN ? usernameFault(username) : undefined;
  const wrong =
    (refusal?.of === username ? refusal.why : undefined) ??
    fault ??
    (isFree === false ? m.username_taken() : undefined);

  async function send() {
    setWasSent(true);
    if (isSaving || usernameFault(username) || username === current) return;
    setSaving(true);
    const why = await onSave(username);
    setSaving(false);
    if (why) setRefusal({ of: username, why });
    else onSaved(username);
  }

  return (
    <form
      noValidate
      className="grid w-full gap-s"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void send();
      }}
    >
      <Label className="grid gap-xxs">
        {m.auth_username()}
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          aria-invalid={wrong ? true : undefined}
          aria-describedby={`${id}-says`}
          disabled={isSaving}
          value={typed}
          onChange={(event) => setTyped(event.target.value.toLowerCase())}
        />
        <span
          id={`${id}-says`}
          role={wrong ? "alert" : undefined}
          className={wrong ? "text-s font-normal text-error" : "text-s font-normal text-neutral-7"}
        >
          {wrong ?? (isFree ? m.username_free() : m.username_hint())}
        </span>
      </Label>
      <div className="flex flex-wrap gap-xs">
        <Button type="submit" size="sm" isPending={isSaving} disabled={username === current}>
          {m.username_save()}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={onCancel}>
            {m.action_cancel()}
          </Button>
        )}
      </div>
    </form>
  );
}
