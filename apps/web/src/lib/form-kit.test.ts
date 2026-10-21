import { useAppForm } from "@repo/ui/hooks/form/form";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// What every form of the apps does through the kit of decision 076: it says nothing before it is
// sent, says what is wrong once it is, gives the first wrong field the focus, and sends what the
// schema takes.

const schema = z.object({
  name: z.string().trim().min(1, "Give it a name."),
  note: z.string().min(3, "Write a little more."),
});

function Sample({ onSend }: { onSend: (value: z.input<typeof schema>) => void }) {
  const form = useAppForm({
    defaultValues: { name: "", note: "" },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => onSend(value),
  });
  return h(
    form.AppForm,
    null,
    h(
      form.Form,
      null,
      h(form.AppField, {
        name: "name",
        children: (field) => h(field.Input, { label: "Name", description: "What you call it." }),
      }),
      h(form.AppField, {
        name: "note",
        children: (field) => h(field.Textarea, { label: "Note" }),
      }),
      h(form.SubmitButton, null, "Save"),
    ),
  );
}

beforeAll(() => {
  // jsdom has no media queries: the kit asks whether the reader wants motion.
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

async function send() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("the form kit", () => {
  it("says nothing before the form is sent", () => {
    render(h(Sample, { onSend: () => {} }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByText("What you call it.")).toBeTruthy();
  });

  it("says what is wrong once sent, and focuses the first wrong field", async () => {
    const onSend = vi.fn();
    render(h(Sample, { onSend }));
    await send();

    const name = screen.getByLabelText("Name");
    expect(onSend).not.toHaveBeenCalled();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Give it a name.").id).toBe(
      name.getAttribute("aria-describedby")?.split(" ").at(-1),
    );
    expect(screen.getByText("Write a little more.")).toBeTruthy();
    expect(document.activeElement).toBe(name);
  });

  it("lets the error go once the field is right, and sends what the schema takes", async () => {
    const onSend = vi.fn();
    render(h(Sample, { onSend }));
    await send();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "La Torche" } });
    });
    expect(screen.queryByText("Give it a name.")).toBeNull();
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBeNull();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Low tide" } });
    });
    await send();
    expect(onSend).toHaveBeenCalledWith({ name: "La Torche", note: "Low tide" });
  });
});
