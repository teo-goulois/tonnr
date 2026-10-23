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
