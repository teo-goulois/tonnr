import { m } from "@/paraglide/messages";

// What the step that deletes the account reads of the API's refusal and of the account, as the
// web's `DeleteAccount` reads them: decision 071. A module that imports nothing of React Native,
// so that a test reads it.

/** Why the API did not delete the account, as the step says it. */
export type DeletionRefusal = "password" | "session" | "many" | "operator" | "failed";

/** Why the API did not delete the account, as its refusal says. */
export function refusalOf(error: unknown): DeletionRefusal {
  const refused = error as { code?: string; data?: { refused?: string } } | null;
  if (refused?.code === "FORBIDDEN") {
    return refused.data?.refused === "session" ? "session" : "password";
  }
  if (refused?.code === "TOO_MANY_REQUESTS") return "many";
  if (refused?.code === "CONFLICT") return "operator";
  return "failed";
}

const REFUSALS: Record<DeletionRefusal, () => string> = {
  password: m.delete_account_wrong_password,
  session: m.delete_account_stale,
  many: m.delete_account_many,
  operator: m.delete_account_operator,
  failed: m.delete_account_failed,
};

/** A refusal in the reader's language. */
export const refusalWords = (refused: DeletionRefusal) => REFUSALS[refused]();

/** The account the step deletes, by the name others read, or its address before it has one. */
export function accountNamed(account: { username: string | null; email: string }) {
  return account.username ? `@${account.username}` : account.email;
}

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
