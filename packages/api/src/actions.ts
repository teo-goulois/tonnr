import type { Database } from "@repo/db";
import {
  type OPERATOR_ACTIONS,
  type OperatorChanges,
  operatorAction,
} from "@repo/db/schema/access";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Done = {
  // The operator who did it.
  operatorId: string;
  action: (typeof OPERATOR_ACTIONS)[number];
  // The developer account it was done to, or whose key it was. Null for a key that has none,
  // and for what was done to an account.
  developer: { id: string; name: string } | null;
  key?: { id: string; name: string };
  // The account it was done to, by its identifier alone: an account is a person, and the
  // record outlives it.
  account?: { id: string };
  changes?: OperatorChanges;
};

/**
 * Records what an operator did, in the transaction that does it: the two are kept together or
 * not at all. A key is named here and never held, and an account is named by its identifier.
 */
export async function recordAction(tx: Transaction, done: Done) {
  await tx.insert(operatorAction).values({
    id: crypto.randomUUID(),
    operatorId: done.operatorId,
    action: done.action,
    developerId: done.developer?.id ?? null,
    developerName: done.developer?.name ?? null,
    keyId: done.key?.id ?? null,
    keyName: done.key?.name ?? null,
    accountId: done.account?.id ?? null,
    changes: done.changes ?? null,
  });
}
