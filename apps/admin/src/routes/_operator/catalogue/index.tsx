import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BREAK_FILTERS, BreaksPage } from "@/components/catalogue/breaks-page";

export const Route = createFileRoute("/_operator/catalogue/")({
  validateSearch: z.object({
    // The break in view.
    break: z.string().max(200).optional().catch(undefined),
    // Which breaks the map draws: all of them, unless the address asks for others.
    filter: z.enum(BREAK_FILTERS).optional().catch(undefined),
  }),
  component: BreaksRoute,
});

function BreaksRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BreaksPage
      selectedId={search.break}
      filter={search.filter ?? "all"}
      onSelect={(id) => void navigate({ search: (before) => ({ ...before, break: id }) })}
      onFilterChange={(filter) =>
        void navigate({
          search: (before) => ({ ...before, filter: filter === "all" ? undefined : filter }),
        })
      }
    />
  );
}
