import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Author } from "../guides/rank";
import { BlockDialog, BlockedAccounts, type Blocking } from "./blocked-accounts";

// What the web app draws of a block: the list of the accounts blocked, the question asked first,
// and the name of a guide's author that opens it. Decision 071.

afterEach(cleanup);

const blockingOf = (given: Partial<Blocking>): Blocking => ({
  blocks: {
    data: [
      { id: "block-1", username: "kai_reef", since: new Date("2026-10-12T09:00:00Z") },
      { id: "block-2", username: "swell_seeker", since: new Date("2026-10-02T18:00:00Z") },
    ],
    isPending: false,
    isError: false,
  },
  onBlock: vi.fn(),
  unblocking: undefined,
  onUnblock: vi.fn(),
  asked: undefined,
  isBlocking: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  ...given,
});

describe("the blocked accounts", () => {
  it("lists each by the username it was blocked under, and lifts a block by its own id", () => {
    const blocking = blockingOf({});
    render(createElement(BlockedAccounts, { blocking }));
    expect(screen.getByText("@kai_reef")).toBeTruthy();
    expect(screen.getByText("@swell_seeker")).toBeTruthy();
    const [first] = screen.getAllByRole("button", { name: "Unblock" });
    fireEvent.click(first!);
    expect(blocking.onUnblock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "block-1", username: "kai_reef" }),
    );
  });

  it("says so when there is none", () => {
    render(
      createElement(BlockedAccounts, {
        blocking: blockingOf({ blocks: { data: [], isPending: false, isError: false } }),
      }),
    );
    expect(screen.getByText("You haven't blocked anyone.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the question asked before a block", () => {
  it("names the account, and blocks it at the reader's word alone", async () => {
    const blocking = blockingOf({ asked: "kai_reef" });
    render(createElement(BlockDialog, { blocking }));
    await waitFor(() => expect(screen.getByText("Block @kai_reef?")).toBeTruthy());
    expect(screen.getByText(/They won't be told/)).toBeTruthy();
    expect(blocking.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(blocking.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(blocking.onCancel).toHaveBeenCalled();
  });

  it("is closed while nothing is asked", () => {
    render(createElement(BlockDialog, { blocking: blockingOf({}) }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the author of a guide's line", () => {
  it("opens a menu that blocks it, when the line is another's", async () => {
    const onBlock = vi.fn();
    render(createElement(Author, { by: { username: "kai_reef", rank: null }, onBlock }));
    fireEvent.click(screen.getByRole("button", { name: "Options for @kai_reef" }));
    const item = await screen.findByRole("menuitem", { name: "Block @kai_reef" });
    fireEvent.click(item);
    expect(onBlock).toHaveBeenCalledWith("kai_reef");
  });

  it("is a name and nothing more otherwise, and a contributor's with no author", () => {
    render(createElement(Author, { by: { username: "kai_reef", rank: null } }));
    expect(screen.getByText("@kai_reef")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    render(createElement(Author, { by: null, onBlock: vi.fn() }));
    expect(screen.getByText("A contributor")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
