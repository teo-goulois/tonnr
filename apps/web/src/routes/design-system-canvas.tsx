import { createFileRoute, notFound } from "@tanstack/react-router";
import { DesignSystemCanvas } from "@/components/design-system/design-system-canvas";

export const Route = createFileRoute("/design-system-canvas")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Design system canvas · Tonnr" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DesignSystemCanvas,
});
