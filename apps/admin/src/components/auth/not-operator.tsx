import { Button } from "@repo/ui/components/ui/button";

import { useSignOut } from "@/components/shared/account-menu";
import { CopyButton } from "@/components/shared/copy-button";
import { m } from "@/paraglide/messages.js";

type NotOperatorProps = {
  account: { id: string; name: string; email: string };
};

function Copied({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex w-full items-center gap-xs rounded-(--radius-xs) bg-neutral-2 py-xs pr-xs pl-s">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-s whitespace-nowrap">
        {text}
      </code>
      <CopyButton text={text} label={label} />
    </div>
  );
}

/**
 * What an account sees that runs nothing here and is a member of no developer account: how it
 * comes to read one, and how whoever hosts the instance becomes an operator.
 */
export function NotOperator({ account }: NotOperatorProps) {
  const signOut = useSignOut();
  const command = `docker compose run --rm worker node dist/cli.mjs operator ${account.id}`;

  return (
    <main className="mx-auto grid w-full max-w-(--container-xl) content-start justify-items-start gap-m px-m py-xxl">
      <h1 className="text-l font-medium">{m.not_operator_title()}</h1>
      <p className="text-neutral-7">
        {m.not_operator_body({ name: account.name, email: account.email })}
      </p>
      <p className="text-neutral-7">{m.not_operator_member()}</p>
      <Copied text={account.id} label={m.copy_identifier()} />
      <p className="text-neutral-7">{m.not_operator_host()}</p>
      <Copied text={command} label={m.copy_command()} />
      <p className="text-s text-neutral-7">{m.not_operator_write()}</p>
      <Button variant="outline" onClick={signOut}>
        {m.auth_sign_out()}
      </Button>
    </main>
  );
}
