import { Button } from "@repo/ui/components/ui/button";

import { useSignOut } from "@/components/shared/account-menu";
import { CopyButton } from "@/components/shared/copy-button";
import { m } from "@/paraglide/messages.js";

type NotOperatorProps = {
  account: { id: string; name: string; email: string };
};

/** What an account that does not run the instance sees: how to become one who does. */
export function NotOperator({ account }: NotOperatorProps) {
  const signOut = useSignOut();
  const command = `docker compose run --rm worker node dist/cli.mjs operator ${account.id}`;

  return (
    <main className="mx-auto grid w-full max-w-(--container-xl) content-start justify-items-start gap-m px-m py-xxl">
      <h1 className="text-l font-medium">{m.not_operator_title()}</h1>
      <p className="text-neutral-7">
        {m.not_operator_body({ name: account.name, email: account.email })}
      </p>
      <div className="flex w-full items-center gap-xs rounded-(--radius-xs) bg-neutral-2 py-xs pr-xs pl-s">
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-s whitespace-nowrap">
          {command}
        </code>
        <CopyButton text={command} label={m.copy_command()} />
      </div>
      <p className="text-s text-neutral-7">{m.not_operator_write()}</p>
      <Button variant="outline" onClick={signOut}>
        {m.auth_sign_out()}
      </Button>
    </main>
  );
}
