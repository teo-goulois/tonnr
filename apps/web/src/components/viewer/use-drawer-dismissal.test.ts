import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDrawerDismissal } from "./use-drawer-dismissal";

afterEach(cleanup);

describe("drawer dismissal", () => {
  it("closes immediately and navigates only after the exit, staying closed while navigation waits", () => {
    const navigate = vi.fn();
    const rest = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useDrawerDismissal(open, "station-a", navigate, rest),
      { initialProps: { open: true } },
    );
    act(() => result.current.onOpenChange(false));
    expect(result.current.open).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    act(() => result.current.onOpenChangeComplete(false));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(false);
    expect(rest).toHaveBeenCalledWith(false);
    rerender({ open: true });
    expect(result.current.open).toBe(false);
    act(() => result.current.onOpenChangeComplete(false));
    expect(navigate).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    rerender({ open: true });
    expect(result.current.open).toBe(true);
  });

  it("lets another selection interrupt the exit without closing the new selection", () => {
    const navigate = vi.fn();
    const { result, rerender } = renderHook(
      ({ identity }) => useDrawerDismissal(true, identity, navigate),
      { initialProps: { identity: "station-a" } },
    );
    act(() => result.current.onOpenChange(false));
    rerender({ identity: "station-b" });
    expect(result.current.open).toBe(true);
    act(() => result.current.onOpenChangeComplete(false));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("follows back/forward navigation without writing a second history entry", () => {
    const navigate = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useDrawerDismissal(open, "station-a", navigate),
      { initialProps: { open: true } },
    );
    rerender({ open: false });
    act(() => result.current.onOpenChangeComplete(false));
    expect(navigate).not.toHaveBeenCalled();
    rerender({ open: true });
    expect(result.current.open).toBe(true);
  });
});
