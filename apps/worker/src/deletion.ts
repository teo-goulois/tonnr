import type { AppleRevocation } from "@repo/auth/apple-revocation";
import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import type { Database } from "@repo/db";
import { holdAccounts } from "@repo/db/accounts";
import { deleteAccount, isOperator } from "@repo/db/deletion";

import { type Outcome, readArguments, refused } from "./command";
import { accountOf, noAccount } from "./operators";

/**
 * `job account-delete <account id> [--write]`: names an account and, with `--write`, deletes it
 * as it would delete itself, for someone who asked by mail and cannot sign in, as `/privacy`
 * says: a suspended account, or one that lost its way in. The operators' record says that a
 * command did it. An operator's account is refused: its rights go first, with
 * `job operator-remove`. Decision 071.
 */
export async function deleteAccountByCommand(
  db: Database,
  args: string[],
  // What revokes its tokens at Apple's, on an instance that offers Sign in with Apple.
  apple: AppleRevocation | undefined,
): Promise<Outcome> {
  const read = readArguments(args);
  if (!read) return refused("Usage: job account-delete <account id> [--write]");
  const id = read.value;

  const done = await db.transaction(async (tx) => {
    // The account first, as its own deletion holds it.
    await holdAccounts(tx, [id]);
    const who = await accountOf(tx, id);
    if (!who) return noAccount(id);
    if (await isOperator(tx, id)) {
      return refused(
        `account: ${who} is an operator. Take its rights away first, with job operator-remove.`,
      );
    }
    if (!read.write) {
      return {
        ok: true,
        lines: [
          `account: ${who} would be deleted, with its sessions, its spots, its lists, its alerts, its log, its reports and what it wrote that was never confirmed.`,
          `What it wrote that was confirmed stays in the guides, under no name, and its username is nobody's for ${DELETED_USERNAME_DAYS} days.`,
          "Nothing was changed. Run it again with --write to delete it.",
        ],
      };
    }
    const outcome = await deleteAccount(tx, id, {
      action: "account.delete_by_command",
      operatorId: null,
    });
    if (!outcome.deleted) return refused(`account: ${who} could not be deleted.`);
    return { ok: true, lines: [`account: ${who} is deleted.`], apple: outcome.apple };
  });
  if (!("apple" in done)) return done;
  if (done.apple.length === 0) return { ok: true, lines: done.lines };

  // Apple is asked once the account is gone, and its answer changes nothing: it was deleted.
  if (!apple) {
    return {
      ok: true,
      lines: [
        ...done.lines,
        "It signed in with Apple, and this worker reads no settings of Apple's: Apple was not asked to revoke its tokens.",
      ],
    };
  }
  const answers = [];
  for (const tokens of done.apple) answers.push(await apple.revoke(tokens));
  const revoked = answers.filter((answer) => answer === "revoked").length;
  const failed = answers.filter((answer) => answer === "failed").length;
  return {
    ok: true,
    lines: [
      ...done.lines,
      `Apple was asked to revoke its tokens: ${revoked} revoked, ${failed} failed.`,
    ],
  };
}
