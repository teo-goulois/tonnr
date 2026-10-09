import type { AppRouterClient } from "@repo/api/routers/index";

type V1 = AppRouterClient["v1"];
type Answer<Procedure extends (...args: never[]) => unknown> = Awaited<ReturnType<Procedure>>;

// What the API gives, named for the screens that draw it.
export type Developer = Answer<V1["developers"]["list"]>["developers"][number];
export type Key = Answer<V1["keys"]["list"]>["keys"][number];
export type MadeKey = Answer<V1["keys"]["create"]>;
export type Account = Answer<V1["accounts"]["list"]>["accounts"][number];
export type BreakdownRow = Answer<V1["usage"]["breakdown"]>["rows"][number];
