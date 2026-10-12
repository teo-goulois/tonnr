# 022. The state of an instance

Status: asked for by Téo on 2026-10-09. Amended on 2026-10-12, when he asked for a way to know from outside that a deployment took: see "What anyone is told" below. Not built: the history of a job's runs, and an alert when something stops.

## Context

The worker fetches the measurements on a schedule and checks the alerts. What it does goes to its log and nowhere else. Whoever runs an instance cannot tell from the outside whether the worker runs: on the day the admin app was deployed, its own deployment could not be checked.

The API has the same blind spot. Nothing says when it started or which settings it holds, so nothing says whether a deployment took, or whether `ADMIN_ORIGIN` is in the container that answers.

## Decision

### The worker says it is there

- Each worker process has a row of `worker_process`: when it started, when it was ready, and when it was last seen. It writes the row before anything else, the scheduler's own start included, and the last moment again every thirty seconds. Each time it writes the row whole, so a start that could not be written is written half a minute later.
- A worker that was seen in the last two minutes runs. A row that stops moving is a worker that stopped, and several rows that started minutes apart and never were ready are a worker that keeps failing to start.
- A row is deleted a week after it was last seen, by a worker that starts.

### The worker says what each job did

- Each job has one row of `job`: its name, its schedule, how long its schedule leaves between two runs, how long a run may take, and its last attempt.
- The row is written when an attempt starts, with a deadline, and again when it ends: whether it succeeded, the counts it returned, and what failed. An attempt that never ends is seen as such once its deadline has passed. Nothing has to mend the row.
- Each of the two writes brings the whole attempt, with the job's schedule. So an attempt whose start could not be written is written by its end, and a job that could not be listed gets its row the first time it runs.
- The attempts of a job are ordered by the moment the scheduler started each, which the scheduler reads on the database's clock and hands to the run. A write changes the row only when the row holds that attempt or one that started before it. So a run that the scheduler gave up on changes nothing once another has started, and neither does a write that was held up on its way and comes in late. Two attempts started in the same millisecond are not told apart, and a queue runs one at a time.
- A run may take fifteen minutes, which the scheduler already allowed without saying so. The limit is now written beside each queue. The scheduler stops a run that passes it: the run's requests to the providers are stopped, and the database the run was given takes nothing more from it. The jobs write in transactions. One that was waiting for a connection is undone as it begins. One that was under way is not stopped, so the database ends it: on the connections the jobs use, a statement or a transaction lasts five minutes at most, and is undone past that. That limit also ends the writing of a worker that died.
- An attempt ends in one of four ways: `succeeded`, `degraded` when the job ran to its end and some of its work failed, `failed`, and `expired` when the scheduler stopped it for taking too long, or when it ended past its deadline whatever it returned. A job is degraded when a provider's stations were refused by the database, or when alerts could not be checked for some spots.
- The row also keeps the last success and the last failure, and how many attempts failed in a row. So a job that fails now still says when it last worked, and one that works again still says what its last failure was. An attempt that never said how it ended is a failure too: the next one counts it as it takes the row, and the API counts it until then.
- The counts are named numbers, the ones the job already returns and logs. Nothing of the data is copied.
- A failure is kept as a kind and, for a provider that answered with an error, its status and its host. The kinds are: the provider did not answer or answered with an error, its answer had changed shape, the database refused the write, the run took too long, the worker stopped under the run, and anything else. The error's own text is not kept: it can hold a line of a provider's answer, an address with what it was asked, or a statement with its values.
- The worker adds its jobs to the table when it starts. It removes none. A job taken out of the code is removed by name, as a retired provider's queue is: another version of the worker may be running beside this one.
- A run started by hand with `job <name>` is not recorded. It says what it did where it was run.
- Writing these rows never fails a job. The worker writes them on two connections kept for that. A write waits five seconds at most for one of them, and the database ends a write that runs for five: the worker hears of it, and the write did not happen. A write that got no answer a second after that is given up with its connection. So a job is held eleven seconds at most at its start and eleven at its end.
- A worker that is told to stop gives the runs under way fifteen seconds to end, then stops them, and says so in their rows. It is gone in twenty-five seconds at most.
- The limits are the worker's to set, whatever the database's address carries: the address is read as the driver reads it, and the worker's settings are laid over it.

### What the API says

- `GET /v1/instance` gives the state, on `adminProcedure`:
  - the worker processes seen in the last day, fifty at most: those that run, then the latest of the others;
  - each job with its last attempt, its last success, its last failure, and its state;
  - the stations of each provider, how many have a reading under six hours old, and the latest reading;
  - the API process that answers: when it started, the web app's address and the admin's site as it holds them, when it last wrote its counts of calls and how many it lost since it started;
  - the size of the database.
- A job's state is `late` when no attempt started for the time its schedule leaves between two runs, and a tenth of it more, ten minutes at least. Otherwise it is the state of its last attempt: `running`, `succeeded`, `degraded`, `failed` or `expired`. A job that never ran is `waiting` until it is late.
- The API reads the worker's tables and writes neither.

### What anyone is told

Asked by Téo on 2026-10-12, after a deployment whose worker nobody but an operator could see start: "add a way to know that it is deployed".

- `GET /v1/health` answers anyone, on `publicProcedure`, and is not counted. It says when the API process that answers started, and of the worker process that started last: when it started, when it was ready, when it was last seen, and whether that was in the last two minutes. Nothing else of the state leaves the admin.
- A deployment took once a start is later than the moment it was asked for. `pnpm run deploy:api` and `pnpm run deploy:worker` read the health before they ask Easypanel, then wait ten minutes at most for a later start: the API's, or a worker's that is ready and runs. A wait that ends without one fails the command, since a build that fails leaves the container before answering. `pnpm run deploy:status` reads the health and asks nothing.
- The commands read the health at the address `DEPLOYED_API_URL` names in the root `.env`. Without it they ask and do not wait, as they did.
- An answer is kept five seconds for each process, so that a route that asks no one who they are does not query the database at every call.
- A start says that a new container runs, not which code it runs. So each process also says the commit its image was built from, in `revision`: the API in its health and in the state, the worker in its row of `worker_process`, which both of them answer. The admin's page of the instance shows it, and the two deploy commands say whether what started is `main`'s head.
- The commit is read when the image is built, by `scripts/revision.mjs`. Of the repository's history the build is given what names the commit that is checked out, and nothing else: `.git/HEAD`, the heads of the branches and `.git/packed-refs`. The image keeps the commit in a file, `revision`, and none of the history. A build that is given no history, as one made from a worktree or from an archive, may be told the commit in the build argument `GIT_SHA`. A process that was told nothing says null, as one that runs from its sources does.

### The admin

- The admin has a page for it, "Instance", and the command palette leads to it. A job that is late, failed or expired is marked, with what failed.

## Rejected

- **Taking the list of jobs for a sign that the worker runs.** A worker that writes its jobs and dies writes them again at each start, and looks as if it had just started well.
- **Removing the jobs that a starting worker does not know.** During a deployment the old worker and the new one run side by side, and each would remove the other's.
- **One row when a run ends.** It cannot tell a run under way from one that is stuck, and a run that ends late would write over the one that replaced it.
- **A row for each run, kept two weeks.** It is a history, and a table to prune. A weekly job's last run would leave it the day the job became late. The state is one row for each job.
- **Keeping the error's message, cleaned and cut short.** Cleaning takes the control characters out and leaves the rest.
- **Giving up a write after five seconds in the worker, and leaving it to the database.** The write would still come in, late, over the attempt that followed.
- **Ordering the attempts by the moment their writes arrive.** A start held up on its way would look like the latest one.
- **A database client for each run, closed when the run is stopped.** It would undo at once what a stopped run is writing. Eleven jobs start together when the worker does, and as many clients would take most of the connections a Postgres gives.
- **Reading the scheduler's own tables.** pg-boss keeps the state of its jobs in a schema of its own, which it creates and changes from one version to the next.
- **A health route that anyone can call.** The state names the providers and what failed. It is the operator's.

## Consequences

- Two programs now agree on two tables. The worker writes them, the API reads them, and a change to one is made with the other in mind.
- The page is to be looked at. It sends no alert when the worker stops.
- A run that passed fifteen minutes used to go on beside the next one. It is stopped now, and the transaction it was in when it was stopped ends within five minutes: for that long that one transaction can still be written beside the next run. No job comes near either time today: the longest takes about fifteen seconds.
- A statement or a transaction of a job that needs more than five minutes fails, and the page says so. Nothing was measured on a large instance: the jobs to watch are the nightly ones, which read days of readings. The limit is `WRITE_SECONDS` in `apps/worker/src/runs.ts`.
- The limit on a transaction is a setting of Postgres 17 and later. The worker does not start on an older one.
- A run that a deployment stops is a failure of the kind "the worker stopped", and counts among the failures in a row. One that the worker had no time to write is counted the same way by the run that follows it.
- The six hours are when a reading leaves the map, not a provider's rhythm: one that publishes a day late has no station under six hours and works as it should. The page gives the count for what it is, beside the job's own state.
- With several API processes, the page shows the one that answered. Nothing says which revision of the code a process runs.
- A run by hand that brings new readings shows in the stations and not in the job.
