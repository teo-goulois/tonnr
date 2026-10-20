import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// A chart draws once the sheet it stands in has come to rest, then waits for its turn: one
// chart a frame, in the order they ask, so that drawing them never holds up a sheet that moves.
// The web's `useChartTurn` (`chart-turns.ts`) does the same with its drawer.

type Turns = {
  atRest: boolean;
  // Asks for a turn. Answers what gives it back.
  ask: (given: () => void) => () => void;
};

const TurnsContext = createContext<Turns | null>(null);

/** Gives the charts it holds their turns, once `atRest` says the sheet is still. */
export function ChartsAtRest({ atRest, children }: { atRest: boolean; children: ReactNode }) {
  const queue = useRef<(() => void)[]>([]);
  const running = useRef(false);

  const turns = useMemo<Turns>(() => {
    function next() {
      const given = queue.current.shift();
      if (!given) {
        running.current = false;
        return;
      }
      running.current = true;
      given();
      requestAnimationFrame(next);
    }
    return {
      atRest,
      ask: (given) => {
        queue.current.push(given);
        if (!running.current) {
          running.current = true;
          // What the sheet was doing as it came to rest is done first: a frame for it, then one
          // chart a frame.
          requestAnimationFrame(() => requestAnimationFrame(next));
        }
        return () => {
          queue.current = queue.current.filter((one) => one !== given);
        };
      },
    };
  }, [atRest]);

  return <TurnsContext.Provider value={turns}>{children}</TurnsContext.Provider>;
}

/**
 * Whether a chart may draw: its sheet is at rest and its turn has come. Once given, the turn is
 * kept, so a chart that drew stays drawn while its sheet moves again. A chart outside any sheet
 * draws at once.
 */
export function useChartTurn() {
  const turns = useContext(TurnsContext);
  const [given, setGiven] = useState(turns === null);
  const atRest = turns?.atRest ?? true;
  useEffect(() => {
    if (given || !turns || !atRest) return;
    return turns.ask(() => setGiven(true));
  }, [given, turns, atRest]);
  return given;
}
