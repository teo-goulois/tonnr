import { createContext, useContext, useEffect, useState } from "react";

// A chart takes long to draw, and nothing else moves while it is drawn. Several of them drawn at
// once, while a drawer opens, stop the drawer and the map. So a panel's charts wait until its
// drawer has come to rest, then are drawn one after the other, a frame apart.

/** Whether the drawer that holds the charts has come to rest. True where no drawer holds them. */
export const ChartsAtRest = createContext(true);

const waiting: Array<() => void> = [];
let drawing = false;

// The turn's chart is drawn in the frames that follow: the next one waits for them to pass.
function giveNextTurn() {
  const turn = waiting.shift();
  drawing = turn !== undefined;
  if (!turn) return;
  turn();
  requestAnimationFrame(() => requestAnimationFrame(giveNextTurn));
}

/** True once it is this chart's turn to be drawn. Until then, its place holds a skeleton. */
export function useChartTurn() {
  const atRest = useContext(ChartsAtRest);
  const [isMine, setIsMine] = useState(false);

  useEffect(() => {
    if (!atRest || isMine) return;
    const take = () => setIsMine(true);
    waiting.push(take);
    if (!drawing) giveNextTurn();
    return () => {
      const at = waiting.indexOf(take);
      if (at >= 0) waiting.splice(at, 1);
    };
  }, [atRest, isMine]);

  return isMine;
}
