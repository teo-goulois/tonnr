import { eq } from "drizzle-orm";

import type { Database } from "./index";
import { accountSuspension } from "./schema/access";

/** Whether an operator suspended this account: decision 025. */
export async function isSuspended(db: Pick<Database, "select">, userId: string) {
  const [found] = await db
    .select({ userId: accountSuspension.userId })
    .from(accountSuspension)
    .where(eq(accountSuspension.userId, userId));
  return found !== undefined;
}
