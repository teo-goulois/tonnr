import type { AppRouterClient } from "@repo/api/routers/index";

type V1 = AppRouterClient["v1"];
type Answer<Procedure extends (...args: never[]) => unknown> = Awaited<ReturnType<Procedure>>;

// What the API gives, named for the screens that draw it.
export type Developer = Answer<V1["developers"]["list"]>["developers"][number];
export type Key = Answer<V1["keys"]["list"]>["keys"][number];
export type MadeKey = Answer<V1["keys"]["create"]>;
export type Member = Answer<V1["developers"]["members"]>["members"][number];
// A developer account as one of its members reads it in the console, with its keys by name.
export type ConsoleDeveloper = Answer<V1["console"]["get"]>["developers"][number];
export type Account = Answer<V1["accounts"]["list"]>["accounts"][number];
export type AccountDetail = Answer<V1["accounts"]["get"]>;
export type BreakdownRow = Answer<V1["usage"]["breakdown"]>["rows"][number];
export type Publication = Answer<V1["publications"]["list"]>["publications"][number];
// A contribution to a break's guide, as an operator reads it.
export type Review = Answer<V1["reviews"]["list"]>["reviews"][number];
export type OperatorAction = Answer<V1["actions"]["list"]>["actions"][number];
export type InstanceState = Answer<V1["instance"]["state"]>;
export type Overview = Answer<V1["instance"]["overview"]>;
export type Job = InstanceState["jobs"][number];
export type JobFailure = NonNullable<Job["failure"]>;
// The catalogue of breaks, as its operator keeps it: decision 049.
export type MapBreak = Answer<V1["catalogue"]["map"]>["breaks"][number];
export type BreakPage = Answer<V1["catalogue"]["get"]>;
export type OperatorBreak = BreakPage["break"];
export type BreakCharacteristics = OperatorBreak["characteristics"];
export type BreakUses = BreakPage["uses"];
export type NearbyBreak = BreakPage["nearby"][number];
export type BreakValues = Parameters<V1["catalogue"]["update"]>[0]["values"];
export type CandidateList = Answer<V1["candidates"]["list"]>;
export type CandidateSummary = CandidateList["candidates"][number];
export type CandidateStatus = CandidateSummary["status"];
export type CandidatePage = Answer<V1["candidates"]["get"]>;
export type Candidate = CandidatePage["candidate"];
