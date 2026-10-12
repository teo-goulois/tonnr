import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { closeCreateMenu, openCreateMenu, useCreateMenu } from "./create-menu";

afterEach(cleanup);

describe("the sheet that asks what to add", () => {
  it("opens and closes for what draws it", () => {
    const { result } = renderHook(() => useCreateMenu());
    expect(result.current).toBe(false);
    act(() => openCreateMenu());
    expect(result.current).toBe(true);
    act(() => closeCreateMenu());
    expect(result.current).toBe(false);
  });

  it("stays closed when it is asked for before anything draws it", () => {
    // The bar is there before the map: its button then opens nothing, now or later.
    openCreateMenu();
    const { result } = renderHook(() => useCreateMenu());
    expect(result.current).toBe(false);
  });

  it("does not open by itself when what drew it comes back", () => {
    const first = renderHook(() => useCreateMenu());
    act(() => openCreateMenu());
    expect(first.result.current).toBe(true);
    first.unmount();
    const second = renderHook(() => useCreateMenu());
    expect(second.result.current).toBe(false);
  });
});
