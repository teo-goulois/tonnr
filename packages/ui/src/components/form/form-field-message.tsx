"use client";

// From the teogoulois registry (`form`), on the Tonnr theme: what a field says under its
// control, its description, or its error in its place with the description behind a tooltip.
// Decision 076.

import { Tooltip, TooltipPopup, TooltipTrigger } from "@repo/ui/components/ui/tooltip-popup";
import { InfoIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";

export type FormFieldMessageProps = {
  description?: ReactNode;
  descriptionId?: string | undefined;
  error?: string | undefined;
  errorId?: string | undefined;
};

export function FormFieldMessage({
  description,
  descriptionId,
  error,
  errorId,
}: FormFieldMessageProps) {
  if (error) {
    return (
      <div className="flex min-w-0 items-start gap-xxs">
        <p id={errorId} className="min-w-0 flex-1 text-s text-pretty text-error" role="alert">
          {error}
        </p>
        {description ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="focus-ring relative mt-0.5 inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-neutral-7 transition-colors duration-(--motion-duration) ease-theme after:absolute after:-inset-3.5 hover:text-neutral-10"
                >
                  <InfoIcon className="size-3.5" aria-hidden />
                  <span className="sr-only">{description}</span>
                </button>
              }
            />
            <TooltipPopup className="max-w-64">{description}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
    );
  }

  return description ? (
    <p id={descriptionId} className="text-s text-pretty text-neutral-7">
      {description}
    </p>
  ) : null;
}
