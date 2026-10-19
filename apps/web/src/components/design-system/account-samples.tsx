import { Button } from "@repo/ui/components/ui/button";
import { useState } from "react";

import { BlockDialog, BlockedAccounts, type Blocking } from "@/components/account/blocked-accounts";
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

const sampleBlocking = (given: Partial<Blocking>): Blocking => ({
  blocks: {
    data: [
      { id: "a", username: "kai_reef", since: new Date("2026-10-12T09:00:00Z") },
      { id: "b", username: "swell_seeker", since: new Date("2026-10-02T18:00:00Z") },
    ],
    isPending: false,
    isError: false,
  },
  onBlock: () => {},
  unblocking: undefined,
  onUnblock: () => {},
  asked: undefined,
  isBlocking: false,
  onConfirm: () => {},
  onCancel: () => {},
  ...given,
});

/** The accounts an account blocked, and the question asked before it blocks one. */
export function BlockSamples() {
  const [asked, setAsked] = useState<string>();
  return (
    <div className="grid gap-m lg:grid-cols-2">
      {/* Two blocked accounts, under the usernames they were blocked under, one being lifted. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <BlockedAccounts blocking={sampleBlocking({ unblocking: "a" })} />
      </div>
      {/* No account blocked. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <BlockedAccounts
          blocking={sampleBlocking({ blocks: { data: [], isPending: false, isError: false } })}
        />
      </div>
      {/* While the list comes. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <BlockedAccounts
          blocking={sampleBlocking({
            blocks: { data: undefined, isPending: true, isError: false },
          })}
        />
      </div>
      <div>
        <Button variant="outline" onClick={() => setAsked("kai_reef")}>
          Ask before blocking
        </Button>
        <BlockDialog
          blocking={sampleBlocking({
            asked,
            onConfirm: () => setAsked(undefined),
            onCancel: () => setAsked(undefined),
          })}
        />
      </div>
    </div>
  );
}
