import { createFileRoute, notFound } from "@tanstack/react-router";

import { DesignSystemPage } from "@/components/design-system/design-system-page";

export const Route = createFileRoute("/design-system")({
  // The page never ships: a production build answers 404.
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DesignSystemPage,
});
