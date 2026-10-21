"use client";

// From the teogoulois registry (`form`): the `<form>` of every form. It sends the form through
// TanStack Form, then focuses the first invalid control, scrolls to it only when it is out of
// view, and shakes it again when it was already the first. Decision 076.
//
// Two things differ from the registry. The form does not let the browser check it, since the
// schema does: `noValidate` is the default. And a group of toggles that is invalid gives its
// first toggle the focus, as no control of its own takes it.

import type { ComponentProps } from "react";

import { shakeInvalidElement, useFormContext } from "../../hooks/form/form-context";

export type FormFormProps = Omit<ComponentProps<"form">, "onSubmit">;

const INVALID_CONTROL_SELECTOR = [
  'input[aria-invalid="true"]:not(:disabled)',
  'textarea[aria-invalid="true"]:not(:disabled)',
  'select[aria-invalid="true"]:not(:disabled)',
  'button[aria-invalid="true"]:not(:disabled)',
  '[contenteditable="true"][aria-invalid="true"]',
  '[tabindex]:not([tabindex="-1"])[aria-invalid="true"]',
  '[role="group"][aria-invalid="true"] button:not(:disabled)',
  '[role="radiogroup"][aria-invalid="true"] button:not(:disabled)',
].join(",");

function isFullyVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );
}

function getControlKey(control: HTMLElement | null) {
  return control?.getAttribute("name") ?? control?.id;
}

function focusFirstInvalidControl(form: HTMLFormElement, previousInvalidControlKey?: string) {
  const control = form.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR);
  if (!control) return;

  if (previousInvalidControlKey && getControlKey(control) === previousInvalidControlKey) {
    const controlContainer = control.closest<HTMLElement>('[data-slot="form-control"]') ?? control;
    shakeInvalidElement(controlContainer);
  }

  const field = control.closest<HTMLElement>('[data-slot="form-field"]') ?? control;

  if (!isFullyVisible(field)) {
    field.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }

  control.focus({ preventScroll: true });
}

export function FormForm({ noValidate = true, ...props }: FormFormProps) {
  const form = useFormContext();

  return (
    <form
      noValidate={noValidate}
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const formElement = event.currentTarget;
        const previousInvalidControlKey = getControlKey(
          formElement.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR),
        );

        void form.handleSubmit().then(() => {
          window.requestAnimationFrame(() => {
            if (formElement.isConnected) {
              focusFirstInvalidControl(formElement, previousInvalidControlKey);
            }
          });
        });
      }}
    />
  );
}
