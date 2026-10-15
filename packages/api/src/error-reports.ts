import type { Database } from "@repo/db";
import { errorReportPause } from "@repo/db/schema/access";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Since when an operator has the web app send no error report. Null while none has. */
export async function errorReportsPausedAt(db: Database | Transaction) {
  const [pause] = await db.select({ at: errorReportPause.at }).from(errorReportPause);
  return pause?.at ?? null;
}
