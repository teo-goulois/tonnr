import { Badge } from "@repo/ui/components/ui/badge";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";

import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/catalogue")({
  component: CatalogueLayout,
});

// The catalogue of breaks, which its operator keeps: the breaks it holds, and what the lists
// propose to it. Decision 049.
function CatalogueLayout() {
  const navigate = useNavigate();
  const part = useLocation({
    select: (location) =>
      location.pathname.endsWith("/sources")
        ? "sources"
        : location.pathname.endsWith("/import")
          ? "import"
          : "breaks",
  });
  const waiting = useQuery(
    orpc.v1.candidates.list.queryOptions({ input: { status: "waiting" }, meta: { quiet: true } }),
  );
  const count = waiting.data?.counts.waiting ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h1 className="text-l font-medium">{m.nav_catalogue()}</h1>
        <Tabs
          value={part}
          onValueChange={(value) =>
            void navigate({
              to:
                value === "sources"
                  ? "/catalogue/sources"
                  : value === "import"
                    ? "/catalogue/import"
                    : "/catalogue",
            })
          }
        >
          <TabsList aria-label={m.catalogue_parts()}>
            <TabsTab value="breaks">{m.catalogue_tab_breaks()}</TabsTab>
            <TabsTab value="import">
              {m.catalogue_tab_import()}
              {count > 0 && (
                <Badge variant="warning" className="ml-xs tabular-nums">
                  <span className="sr-only">{m.catalogue_waiting()}</span>
                  {formatCount(count)}
                </Badge>
              )}
            </TabsTab>
            <TabsTab value="sources">{m.catalogue_tab_sources()}</TabsTab>
          </TabsList>
        </Tabs>
      </div>
      <Outlet />
    </>
  );
}
