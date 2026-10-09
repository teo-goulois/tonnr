import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// The shape is the registry's. Its seven statuses bring colors of their own, which the Tonnr
// theme does not have: the variants here are the theme's four, a neutral and its three signals.
// The label says the state. The tint only helps the eye find it.
const badgeVariants = cva(
  [
    // structure & layout
    "inline-flex h-5 shrink-0 items-center justify-center gap-xxs rounded-(--radius-xs)",
    // sizing & spacing
    "px-xs",
    // typography
    "text-xs font-medium whitespace-nowrap text-neutral-10",
    // nested icon svg
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
  ],
  {
    variants: {
      variant: {
        neutral: "bg-neutral-3",
        success: "bg-success-transparent",
        warning: "bg-warning-transparent",
        error: "bg-error-transparent",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"];
}

function Badge({ className, variant, render, ...props }: BadgeProps) {
  const defaultProps = {
    className: cn(badgeVariants({ className, variant })),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}

export { Badge, badgeVariants };
