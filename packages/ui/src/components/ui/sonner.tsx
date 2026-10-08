"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "@repo/ui/icon";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      // Follows the Toast assignments of the Tonnr theme.
      style={
        {
          "--normal-bg": "var(--neutral-1)",
          "--normal-text": "var(--neutral-10)",
          "--normal-border": "var(--neutral-4-transparent)",
          "--border-radius": "var(--radius-m)",
          "--width": "22rem",
          fontFamily: "var(--font-ui)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast p-m! text-m! shadow-(--shadow-m)!",
          title: "font-medium!",
          description: "text-neutral-7!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
