import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Whether a username is free, as the API would answer it.
const { isUsernameAvailable } = vi.hoisted(() => ({ isUsernameAvailable: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { isUsernameAvailable } }));

import { UsernameForm } from "./username-form";

// The form a username is chosen in: what it says as the name is typed, once it is sent, and
// once the API refused it. Decisions 041 and 076.

beforeAll(() => {
  // jsdom has no media queries: a field that turns wrong asks whether the reader wants motion.
  window.matchMedia ??= vi.fn().mockReturnValue({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as never;
});

beforeEach(() => isUsernameAvailable.mockResolvedValue({ data: { available: true } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const show = (current: string | null, onSave = vi.fn().mockResolvedValue(undefined)) => {
  const onSaved = vi.fn();
  render(createElement(UsernameForm, { current, onSave, onSaved }));
  return { onSave, onSaved, field: screen.getByLabelText("Username") as HTMLInputElement };
};

async function type(field: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(field, { target: { value } });
  });
}

/** Lets the time pass that the form waits before it asks the API whether a name is free. */
async function waitForTheAnswer() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("the username form", () => {
  it("keeps the name in small letters, and says it is short once it is sent", async () => {
    const { onSave, field } = show(null);
    await type(field, "Ka");
    expect(field.value).toBe("ka");
    expect(screen.queryByRole("alert")).toBeNull();

    await save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Use at least 3 characters.");
    expect(document.activeElement).toBe(field);
  });

  it("says a name is taken as it is typed, and that one is free", async () => {
    isUsernameAvailable.mockResolvedValue({ data: { available: false } });
    const { field } = show(null);
    await type(field, "kai_reef");
    await waitForTheAnswer();
    expect(screen.getByRole("alert").textContent).toBe("This username is taken.");
    expect(field.getAttribute("aria-invalid")).toBe("true");

    isUsernameAvailable.mockResolvedValue({ data: { available: true } });
    await type(field, "kai_reef_2");
    expect(screen.queryByRole("alert")).toBeNull();
    await waitForTheAnswer();
    expect(screen.getByText("This username is free.")).toBeTruthy();
    expect(isUsernameAvailable).toHaveBeenCalledTimes(2);
  });

  it("says under the field why the API refused the name, and keeps one it took", async () => {
    const { onSave, onSaved, field } = show(
      null,
      vi.fn().mockResolvedValueOnce("The username was not saved. Try again."),
    );
    await type(field, "kai_reef");
    await save();
    expect(onSave).toHaveBeenCalledWith("kai_reef");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("The username was not saved. Try again.");

    await type(field, "kai_reef");
    await save();
    expect(onSaved).toHaveBeenCalledWith("kai_reef");
  });

  it("sends nothing while the name is the account's own", async () => {
    const { field } = show("kai_reef");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    await type(field, "kai_reef_2");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
