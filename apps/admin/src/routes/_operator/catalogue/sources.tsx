import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PrivateSourcesPage } from "@/components/catalogue/private-sources-page";
import { withoutSourceSearchControls } from "@/lib/private-source-values";

const word = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => withoutSourceSearchControls(value) === value)
    .optional()
    .catch(undefined);
const offset = z.number().int().min(0).max(100_000).optional().catch(undefined);

export const Route = createFileRoute("/_operator/catalogue/sources")({
  validateSearch: z.object({
    q: word(120),
    provider: word(512),
    country: word(200),
    record: word(512),
    snapshot: word(512),
    view: z.literal("resources").optional().catch(undefined),
    offset,
    resourceOffset: offset,
  }),
  component: PrivateSourcesRoute,
});

function PrivateSourcesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PrivateSourcesPage
      filters={{ q: search.q, provider: search.provider, country: search.country }}
      view={search.view ?? "records"}
      offset={search.offset ?? 0}
      resourceOffset={search.resourceOffset ?? 0}
      recordId={search.record}
      snapshotId={search.snapshot}
      onFiltersChange={(filters) =>
        void navigate({ search: { ...filters, view: search.view }, replace: true })
      }
      onViewChange={(view) =>
        void navigate({
          search: (before) => ({ ...before, view: view === "resources" ? view : undefined }),
        })
      }
      onPageChange={(next, resources) =>
        void navigate({
          search: (before) =>
            resources
              ? { ...before, resourceOffset: next || undefined }
              : { ...before, offset: next || undefined, record: undefined, snapshot: undefined },
        })
      }
      onOpen={(record) =>
        void navigate({
          search: (before) => ({ ...before, record, snapshot: undefined }),
          resetScroll: false,
        })
      }
      onSnapshotChange={(snapshot) =>
        void navigate({ search: (before) => ({ ...before, snapshot }), resetScroll: false })
      }
    />
  );
}
