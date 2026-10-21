import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Profiling } from "../viewer/types";
import { ProfileForm } from "./profile-questions";

// What the form of a surfer's answers sends: decisions 063 and 076.

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
});

afterEach(cleanup);

describe("the form of a surfer's answers", () => {
  it("names each question's choices by its title, and saves every answer at once", async () => {
    const onSave = vi.fn(async () => true);
    const onSaved = vi.fn();
    const profiling: Profiling = {
      profile: {
        level: "intermediate",
        smallestWave: "knee",
        biggestWave: "head",
        reading: "basics",
        boards: ["funboard"],
        waveFaceMeters: { least: 0.3, most: 2 },
        answeredAt: new Date("2026-10-16T20:00:00Z"),
        putOffAt: null,
      },
      isAsking: false,
      isSaving: false,
      onSave,
      onPutOff: () => {},
    };
    render(h(ProfileForm, { profiling, onSaved }));

    const level = screen.getByRole("group", { name: "Your level" });
    expect(level.getAttribute("aria-labelledby")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
      fireEvent.click(screen.getByRole("button", { name: "Funboard" }));
    });
    await act(async () => {
      fireEvent.submit(level.closest("form")!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onSave).toHaveBeenCalledWith({
      level: "advanced",
      smallestWave: "knee",
      biggestWave: "head",
      reading: "basics",
      // No board pressed is no answer.
      boards: null,
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
