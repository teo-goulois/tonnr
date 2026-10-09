import type { AppRouterClient } from "@repo/api/routers/index";

type V1 = AppRouterClient["v1"];
type Answer<Procedure extends (...args: never[]) => unknown> = Awaited<ReturnType<Procedure>>;

// What the API gives, named for the screens that draw it.
export type Developer = Answer<V1["developers"]["list"]>["developers"][number];
export type Key = Answer<V1["keys"]["list"]>["keys"][number];
export type MadeKey = Answer<V1["keys"]["create"]>;
export type Account = Answer<V1["accounts"]["list"]>["accounts"][number];
export type AccountDetail = Answer<V1["accounts"]["get"]>;
export type BreakdownRow = Answer<V1["usage"]["breakdown"]>["rows"][number];
export type OperatorAction = Answer<V1["actions"]["list"]>["actions"][number];
export type InstanceState = Answer<V1["instance"]["state"]>;
export type Job = InstanceState["jobs"][number];
export type JobFailure = NonNullable<Job["failure"]>;
