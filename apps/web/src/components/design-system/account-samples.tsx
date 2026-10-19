import { type AccountDeletion, DeleteAccount } from "@/components/account/delete-account";

// The steps of the account's panel that decision 071 adds, with invented accounts.

const sampleDeletion = (given: Partial<AccountDeletion>): AccountDeletion => ({
  hasPassword: true,
  isFresh: false,
  offersGoogle: true,
  isDeleting: false,
  isSigningIn: false,
  refused: undefined,
  onDelete: () => {},
  onSignInAgain: () => {},
  ...given,
});

/** The step that deletes the account, in each state a person finds it in. */
export function DeletionSamples() {
  return (
    <div className="grid gap-m lg:grid-cols-2">
      {/* An account with a password, given wrong once. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <DeleteAccount deletion={sampleDeletion({ refused: "password" })} />
      </div>
      {/* An account that signs in with Google, whose session is old: it signs in again. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <DeleteAccount deletion={sampleDeletion({ hasPassword: false })} />
      </div>
      {/* The same, just signed in again. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <DeleteAccount deletion={sampleDeletion({ hasPassword: false, isFresh: true })} />
      </div>
      {/* While the API has not said whether the account has a password. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <DeleteAccount deletion={sampleDeletion({ hasPassword: undefined })} />
      </div>
    </div>
  );
}
