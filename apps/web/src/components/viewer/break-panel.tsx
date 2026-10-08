import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { PointConditions } from "./point-conditions";

export function BreakPanel({ breakId }: { breakId: string }) {
  const found = useQuery(orpc.v1.breaks.get.queryOptions({ input: { id: breakId }, retry: false }));

  if (found.isPending) return <p className="text-muted-foreground p-4 text-sm">Chargement…</p>;
  if (!found.data) return <p className="p-4 text-sm">Ce spot est introuvable.</p>;

  const { name, latitude, longitude, source } = found.data;

  return (
    <div className="grid gap-6 p-4">
      <header>
        <h2 className="text-l font-medium">{name}</h2>
        <p className="text-muted-foreground text-xs">
          Spot du catalogue ·{" "}
          <a href={source.url} target="_blank" rel="noreferrer" className="underline">
            sa fiche chez la source
          </a>
        </p>
        <p className="text-muted-foreground text-xs">
          {source.attribution} · licence {source.license.type}
        </p>
      </header>

      <PointConditions latitude={latitude} longitude={longitude} />
    </div>
  );
}
