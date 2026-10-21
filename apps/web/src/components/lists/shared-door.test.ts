import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { m } from "@/paraglide/messages.js";

import { SharedDoor } from "./shared-door";

// The password a shared list asks for, on the form kit of decision 076: what the API says of it
// stands under the field, at each try.

beforeAll(() => {
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

type Refusal = "wrong" | "closed" | undefined;

const door = (onPassword: (password: string) => void, refusal: Refusal, isChecking = false) =>
  h(SharedDoor, { state: "locked", refusal, isChecking, onPassword, onRetry: () => {} });

async function open() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: m.shared_open() }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function type(value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(m.shared_password()), { target: { value } });
  });
}

describe("the door of a shared list", () => {
  it("asks for the password before it asks the API", async () => {
    const onPassword = vi.fn();
    render(door(onPassword, undefined));
    await open();
    expect(onPassword).not.toHaveBeenCalled();
    expect(screen.getByText(m.shared_password_missing())).toBeTruthy();
  });

  it("says under the field that a password is wrong, at each try", async () => {
    const onPassword = vi.fn();
    const { rerender } = render(door(onPassword, undefined));
    await type("tide");
    await open();
    expect(onPassword).toHaveBeenLastCalledWith("tide");

    rerender(door(onPassword, undefined, true));
    rerender(door(onPassword, "wrong"));
    const field = screen.getByLabelText(m.shared_password());
    expect(screen.getByText(m.shared_password_wrong())).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field);

    // Typed again, the error goes; the same password sent again is refused again.
    await type("tid");
    expect(screen.queryByText(m.shared_password_wrong())).toBeNull();
    await type("tide");
    await open();
    expect(screen.getByText(m.shared_password_wrong())).toBeTruthy();
  });
});
