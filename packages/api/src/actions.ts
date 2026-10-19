// What records what an operator did lives in packages/db, where the worker's commands read it
// too: decision 071.
export { recordAction } from "@repo/db/actions";
