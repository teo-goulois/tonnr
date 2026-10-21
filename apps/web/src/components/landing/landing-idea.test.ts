import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageForm } from "./landing-idea";

// What the form that sends an idea or a message says and sends: decisions 026 and 076.

const send = vi.fn();
vi.mock("@/utils/orpc", () => ({
  client: { v1: { ideas: { send: (input: unknown) => send(input) } } },
}));

const WORDS = {
  text: "Your message",
  placeholder: "",
  full: "Too many today.",
  failed: "Not sent.",
};
const TOPICS = [
  { id: "app", label: "The app", start: "About the app: " },
  { id: "data", label: "The data", start: "About the data: " },
];

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

beforeEach(() => send.mockReset());
afterEach(cleanup);

async function submit() {
  await act(async () => {
    fireEvent.submit(screen.getByLabelText("First name").closest("form")!);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // The form is done with what it sent once its button is no longer pending.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function type(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

describe("the form that sends a message", () => {
  it("says what is missing under each field, and sends nothing", async () => {
    render(h(MessageForm, { about: "message", words: WORDS, onSent: () => {} }));
    await submit();

    expect(send).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "Tell me your first name.",
      "Enter a valid email address.",
      "Write a few words first.",
    ]);
    expect(document.activeElement).toBe(screen.getByLabelText("First name"));
  });

  it("starts the text with the topic chosen, unless something of one's own is written", async () => {
    render(h(MessageForm, { about: "message", words: WORDS, topics: TOPICS, onSent: () => {} }));
    const text = screen.getByLabelText("Your message") as HTMLTextAreaElement;
    expect(text.value).toBe("About the app: ");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "The data" }));
    });
    expect(text.value).toBe("About the data: ");

    await type("Your message", "A buoy is missing in Brittany.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "The app" }));
    });
    expect(text.value).toBe("A buoy is missing in Brittany.");
  });

  it("sends what is written, and says when the API keeps it back", async () => {
    const onSent = vi.fn();
    send.mockResolvedValueOnce({ sent: false, why: "full" }).mockResolvedValueOnce({ sent: true });
    render(h(MessageForm, { about: "idea", words: WORDS, onSent }));
    await type("First name", " Maëlle ");
    await type("Email", "maelle@example.com");
    await type("Your message", "Tides at La Torche, please.");

    await submit();
    expect(screen.getByRole("alert").textContent).toContain("Too many today.");
    expect(onSent).not.toHaveBeenCalled();

    await submit();
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Maëlle",
        email: "maelle@example.com",
        idea: "Tides at La Torche, please.",
        about: "idea",
      }),
    );
    expect(onSent).toHaveBeenCalledWith("Maëlle");
  });
});
