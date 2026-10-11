/**
 * Writes that are made one after the other, in the order they were asked: the answer to an
 * older one never comes after the answer to a newer one. `settled` is called when the last
 * write that was asked for has answered, and told whether any since the last time had failed.
 */
export function writesInTurn<Change>(
  write: (change: Change) => Promise<void>,
  settled: (failed: boolean) => void,
) {
  let turn = Promise.resolve();
  let asked = 0;
  let failed = false;
  return (change: Change) => {
    asked += 1;
    const mine = asked;
    turn = turn
      .then(() => write(change))
      .catch(() => {
        failed = true;
      })
      .then(() => {
        // Another write was asked meanwhile: it is the one that says when all is settled.
        if (mine !== asked) return;
        const hadFailed = failed;
        failed = false;
        settled(hadFailed);
      });
  };
}
