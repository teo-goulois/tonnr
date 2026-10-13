import { useEffect, useState } from "react";

/** A value once it has stopped changing for a while: what is typed, once the keys have stopped. */
export function useDebounced<Value>(value: Value, waitMs: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), waitMs);
    return () => clearTimeout(timer);
  }, [value, waitMs]);
  return settled;
}
