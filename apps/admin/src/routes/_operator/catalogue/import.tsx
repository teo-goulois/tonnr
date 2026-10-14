import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CANDIDATE_STATES, ImportPage } from "@/components/catalogue/import-page";

export const Route = createFileRoute("/_operator/catalogue/import")({
  validateSearch: z.object({
    // The candidate in view.
    candidate: z.string().max(200).optional().catch(undefined),
    // The candidates that wait, unless the address asks for others.
    status: z.enum(CANDIDATE_STATES).optional().catch(undefined),
    // The widest place they lie in, as their list names it.
    region: z.string().max(200).optional().catch(undefined),
  }),
  component: ImportRoute,
});

function ImportRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ImportPage
      candidateId={search.candidate}
      status={search.status ?? "waiting"}
      region={search.region}
      onOpen={(id, replace) =>
        void navigate({ search: (before) => ({ ...before, candidate: id }), replace })
      }
      onStatusChange={(status) =>
        void navigate({
          search: (before) => ({
            region: before.region,
            status: status === "waiting" ? undefined : status,
          }),
        })
      }
      onRegionChange={(region) =>
        void navigate({ search: (before) => ({ status: before.status, region }) })
      }
    />
  );
}
