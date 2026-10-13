import type { BreakdownRow } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

// The way a call came in, in words: by the API's routes, or by its MCP server, where an agent
// calls a tool.
const WAY_LABELS: Record<string, () => string> = {
  api: m.way_api,
  mcp: m.way_mcp,
};

/** What to write for a row of the calls by the way they came in. */
export const wayLabel = (row: BreakdownRow) => WAY_LABELS[row.id ?? ""]?.() ?? row.id;
