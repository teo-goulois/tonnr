import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { formatDuration } from "@/lib/format";

import { dayWords, fromFields, SessionForm, toClockField, toDayField } from "./session-form";
import type { SessionMedia } from "./types";

describe("the moment a session's two fields hold", () => {
  it("is written on the device's clock, and read back as the same moment", () => {
    const moment = new Date(2026, 9, 3, 7, 5);
    expect(toDayField(moment)).toBe("2026-10-03");
    expect(toClockField(moment)).toBe("07:05");
    expect(fromFields("2026-10-03", "07:05")?.getTime()).toBe(moment.getTime());
  });

  it("is none while a field is empty or holds no moment", () => {
    expect(fromFields("", "07:05")).toBeNull();
    expect(fromFields("2026-10-03", "")).toBeNull();
    expect(fromFields("not a day", "07:05")).toBeNull();
  });
});

describe("the day of a session, beside its hour", () => {
  const now = new Date(2026, 9, 3, 11, 0).getTime();

  it("is today or yesterday by the calendar, whatever the hours", () => {
    expect(dayWords(new Date(2026, 9, 3, 0, 5), now)).toBe("Today");
    expect(dayWords(new Date(2026, 9, 2, 23, 55), now)).toBe("Yesterday");
  });

  it("is its date further back", () => {
    expect(dayWords(new Date(2026, 9, 1, 8, 0), now)).toMatch(/1/);
    expect(dayWords(new Date(2026, 9, 1, 8, 0), now)).not.toBe("Yesterday");
  });
});

describe("how long a session lasted", () => {
  it("is said in minutes, in hours, or in both", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(95)).toBe("1 h 35");
    expect(formatDuration(65)).toBe("1 h 05");
  });
});

// An instance that takes no photo: the form shows no line for them.
const NO_MEDIA: SessionMedia = {
  status: { offered: false, paused: false, keptBytes: 0, mostBytes: 0 },
  open: { data: [], isPending: false, isError: false },
  bySession: {},
  uploads: new Map(),
  onStart: () => [],
  onRetry: () => {},
  onDrop: () => {},
  onForget: () => {},
};

describe("the form a session is written in", () => {
  const now = new Date(2026, 9, 3, 11, 0).getTime();

  beforeAll(() => {
    // jsdom has no media queries: the form's kit asks whether the reader wants motion.
    window.matchMedia ??= vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as never;
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };
    // Nor animations of an element, which the tabs of the length wait for.
    Element.prototype.getAnimations ??= () => [];
  });

  afterEach(cleanup);

  function open(onSave = vi.fn()) {
    render(
      h(SessionForm, {
        now,
        wide: true,
        isSaving: false,
        onSave,
        media: NO_MEDIA,
        onOpenMedia() {},
      }),
    );
    return onSave;
  }

  async function save() {
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Add to the log" }).closest("form")!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("says under its line that a session needs its start, and saves nothing", async () => {
    const onSave = open();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Day"), { target: { value: "" } });
    });
    await save();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "Pick the day and the time you paddled out.",
    );
    expect(screen.getByLabelText("Day").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Day"));
  });

  it("says as soon as it is chosen that a start ahead of now is none", async () => {
    const onSave = open();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "13:30" } });
    });

    expect(screen.getByRole("alert").textContent).toBe("A session is written once it has begun.");
    await save();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the session as it is written", async () => {
    const onSave = open();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "08:15" } });
      fireEvent.change(screen.getByLabelText("A few words"), {
        target: { value: "  Glassy at dawn " },
      });
    });
    await save();

    expect(onSave).toHaveBeenCalledOnce();
    const [draft] = onSave.mock.calls[0] as [Record<string, unknown>];
    expect(draft).toMatchObject({
      startedAt: new Date(2026, 9, 3, 8, 15),
      note: "Glassy at dawn",
      rating: null,
      mediaIds: [],
    });
  });
});
