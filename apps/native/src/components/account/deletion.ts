import {
  accountNamed,
  type DeletionMessages,
  type DeletionRefusal,
  refusalOf,
  refusalWords as wordsIn,
} from "@repo/client/account/deletion";

import { m } from "@/paraglide/messages";

// What the step that deletes the account reads of the API's refusal and of the account, as the
// web's `DeleteAccount` reads them, from `packages/client/src/account/deletion.ts`: decision 071.
// A module that imports nothing of React Native, so that a test reads it.

export { accountNamed, type DeletionRefusal, refusalOf };

const REFUSALS: DeletionMessages = {
  delete_account_wrong_password: m.delete_account_wrong_password,
  delete_account_stale: m.delete_account_stale,
  delete_account_many: m.delete_account_many,
  delete_account_operator: m.delete_account_operator,
  delete_account_failed: m.delete_account_failed,
};

/** A refusal in the reader's language. */
export const refusalWords = (refused: DeletionRefusal) => wordsIn(refused, REFUSALS);

/** What the button that deletes says: the account's name, since a new sign-in may be another. */
export function deleteLabel(account: { username: string | null } | undefined) {
  return account?.username
    ? m.delete_account_confirm_named({ username: account.username })
    : m.delete_account_confirm();
}

/**
 * What an account without a password signs in again with: what it signs in with that this phone
 * offers. Another provider could come back as another account.
 */
export function signsInAgainWith<Provider extends string>(
  signsInWith: readonly string[],
  offered: readonly Provider[],
) {
  return offered.filter((provider) => signsInWith.includes(provider));
}

/** What a press that deletes an account of Apple's came to. */
export type AppleDeletion =
  | { deleted: true }
  | { refused: DeletionRefusal }
  // Nothing was deleted: the sheet was closed, or it or the new sign-in failed, with what to say.
  | { kept: true; refusal?: string }
  // The sheet's token signed in another account, which is now the one of the phone.
  | { other: true };

/**
 * Deletes an account that signs in with Apple, after Apple's sheet, whose code goes with the
 * deletion: the API exchanges it to revoke what Apple gave the app, once the account is deleted,
 * so a refusal leaves it unused for the next press, within Apple's five minutes. An account
 * without a password whose session the API finds too old signs in again with the same sheet's
 * token, and the same code goes with the deletion that follows: one sheet does both. A token that
 * signs in another account deletes nothing. Decision 071.
 */
export async function deleteWithApple<
  Sheet extends { answered: true; authorizationCode: string | null },
>(
  password: string | undefined,
  accountId: string | undefined,
  steps: {
    ask: () => Promise<Sheet | { answered: false; refusal?: string | undefined }>;
    send: (
      password: string | undefined,
      code: string | undefined,
    ) => Promise<DeletionRefusal | undefined>;
    signIn: (
      sheet: Sheet,
    ) => Promise<{ signedIn: true } | { signedIn: false; refusal?: string | undefined }>;
    signedInAs: () => Promise<string | undefined>;
  },
): Promise<AppleDeletion> {
  const sheet = await steps.ask();
  if (!sheet.answered) return { kept: true, ...(sheet.refusal && { refusal: sheet.refusal }) };
  const code = sheet.authorizationCode ?? undefined;
  const refusal = await steps.send(password, code);
  if (refusal === undefined) return { deleted: true };
  if (refusal !== "session" || password !== undefined) return { refused: refusal };
  const signedIn = await steps.signIn(sheet);
  if (!signedIn.signedIn) {
    return { kept: true, ...(signedIn.refusal && { refusal: signedIn.refusal }) };
  }
  if ((await steps.signedInAs()) !== accountId) return { other: true };
  const again = await steps.send(undefined, code);
  return again === undefined ? { deleted: true } : { refused: again };
}
