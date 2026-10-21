import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Upload } from "../sessions/types";
import { ReportSheet } from "./report-sheet";
import type { Reporting } from "./types";

// What the form of a report says and sends: decisions 067 and 076.

// The form links to the terms, which needs no router here.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: unknown }) =>
    h("a", { href: to }, children as never),
}));

const SENT: Upload = {
  key: "first",
  name: "IMG_2041.JPG",
  purpose: "report",
  kind: "photo",
  type: "image/jpeg",
  preview: "",
  progress: 1,
  state: "sent",
  error: null,
  id: "medium",
};

function reportingOf(change: Partial<Reporting>): Reporting {
  return {
    here: { data: [], isPending: false, isError: false },
    offered: true,
    status: { offered: true, paused: false, keptBytes: 0, mostBytes: 1024 },
    open: { breakId: "break", name: "La Torche" },
    onBegin: () => {},
    onClose: () => {},
    uploads: new Map([[SENT.key, SENT]]),
    onStart: () => [SENT.key],
    onRetry: () => {},
    onDrop: () => {},
    isSending: false,
    onSend: async () => true,
    onDelete: async () => true,
    onFlag: async () => true,
    ...change,
  };
}

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
  Element.prototype.getAnimations ??= () => [];
  // Nor what watches a size, which the drawer reads.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

async function send() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Send the report" }).closest("form")!);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("the form a report is sent from", () => {
  it("asks for a photo or a clip before it sends anything", async () => {
    const onSend = vi.fn(async () => true);
    render(
      h(ReportSheet, {
        wide: true,
        reporting: reportingOf({ onSend }),
        username: "maelle",
        onUsernameSave: async () => undefined,
      }),
    );
    await send();

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Add a photo or a clip of the waves.");
    expect(document.activeElement).toBe(screen.getByLabelText("Add photos or videos"));
  });

  it("sends the files that went up, with the words", async () => {
    const onSend = vi.fn(async () => true);
    const onDrop = vi.fn();
    const { unmount } = render(
      h(ReportSheet, {
        wide: true,
        reporting: reportingOf({ onSend, onDrop }),
        username: "maelle",
        onUsernameSave: async () => undefined,
      }),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Add photos or videos"), {
        target: { files: [new File(["wave"], "IMG_2041.JPG", { type: "image/jpeg" })] },
      });
    });
    await send();

    expect(onSend).toHaveBeenCalledWith({
      uploads: ["first"],
      waveSize: null,
      setSize: null,
      note: "",
    });
    // The report took the file: closing the form lets go of nothing.
    unmount();
    expect(onDrop).not.toHaveBeenCalled();
  });
});
