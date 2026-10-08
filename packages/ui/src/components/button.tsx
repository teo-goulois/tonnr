import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// Variants follow the Button assignments of the Tonnr theme, in gui/themes/tonnr-components.md.
const buttonVariants = cva(
  "group/button focus-ring inline-flex shrink-0 items-center justify-center gap-xs rounded-(--radius-s) font-medium whitespace-nowrap transition-[background-color,color,box-shadow,translate] duration-(--motion-duration) ease-theme outline-none select-none active:not-aria-[haspopup]:translate-y-(--motion-press-distance) disabled:pointer-events-none disabled:text-neutral-6 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "edge-inset bg-color-1 text-neutral-1 [--edge-color:var(--border-default-color)] hover:[--edge-elevation:var(--shadow-s)] disabled:bg-neutral-3",
        outline:
          "edge-inset text-neutral-10 [--edge-color:var(--neutral-4)] hover:bg-neutral-3-transparent focus-visible:[--edge-color:var(--color-1-transparent)] aria-expanded:bg-neutral-3-transparent disabled:[--edge-color:var(--neutral-4-transparent)]",
        secondary:
          "edge bg-neutral-3 text-neutral-10 [--edge-color:var(--border-default-color)] hover:bg-neutral-4-transparent",
        ghost:
          "text-neutral-10 hover:bg-neutral-3-transparent aria-expanded:bg-neutral-3-transparent",
        destructive:
          "edge-inset bg-error text-neutral-1 [--edge-color:var(--border-default-color)] hover:[--edge-elevation:var(--shadow-s)] disabled:bg-neutral-3",
        link: "text-neutral-10 underline-offset-4 hover:underline",
      },
      size: {
        default: "px-m py-xs text-m",
        sm: "px-s py-xxs text-s",
        icon: "aspect-square min-h-[calc(var(--line-m)+var(--space-xs)*2)] p-xs text-m",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
