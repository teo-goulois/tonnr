import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { ChevronDownIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Loader } from "@/components/shared/loader";
import type { PrivateSourceSummary } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { sourceDateText, withoutSourceSearchControls } from "@/lib/private-source-values";
import { m } from "@/paraglide/messages.js";
import { isMissing, orpc } from "@/utils/orpc";

import {
  PrivateSourceDesk,
  SourceError,
  SourceJson,
  SourcePagination,
  SourceUrl,
} from "./private-source-detail";

type Filters = { q?: string; provider?: string; country?: string };
type View = "records" | "resources";
type PrivateSourcesPageProps = {
  filters: Filters;
  view: View;
  offset: number;
  resourceOffset: number;
  recordId: string | undefined;
  snapshotId: string | undefined;
  onFiltersChange: (filters: Filters) => void;
  onViewChange: (view: View) => void;
  onPageChange: (offset: number, resources: boolean) => void;
  onOpen: (id: string | undefined) => void;
  onSnapshotChange: (id: string | undefined) => void;
};

function SourceFilter({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  const selected = options.find((one) => one.value === value)?.label ?? value ?? all;
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" />} aria-label={`${label}: ${selected}`}>
        <span className="max-w-64 truncate">{selected}</span>
        <ChevronDownIcon aria-hidden />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuRadioGroup value={value ?? ""} onValueChange={(next) => onChange(next || undefined)}>
          <MenuRadioItem value="">{all}</MenuRadioItem>
          {options.map((one) => (
            <MenuRadioItem key={one.value} value={one.value}>
              {one.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/** These counts are source identities, export occurrences, assertions and URL inventory rows. */
export function PrivateSourcesOverview({
  summary,
  provider,
  onProviderChange,
}: {
  summary: PrivateSourceSummary;
  provider: string | undefined;
  onProviderChange: (id: string | undefined) => void;
}) {
  return (
    <section className="grid gap-m" aria-label={m.private_source_overview()}>
      <dl className="grid grid-cols-2 gap-m lg:grid-cols-4">
        {(
          [
            [m.private_source_records(), summary.totals.records],
            [m.private_source_versions(), summary.totals.snapshots],
            [m.private_source_assertions(), summary.totals.claims],
            [m.private_source_resources(), summary.totals.resources],
          ] as const
        ).map(([label, count]) => (
          <div key={label} className="grid gap-xxs">
            <dt className="text-s text-neutral-7">{label}</dt>
            <dd className="text-l tabular-nums">{formatCount(count)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-s text-neutral-7">{m.private_source_identity_note()}</p>
      {summary.providers.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.private_source_provider()}</TableHead>
              <TableHead className="text-right">{m.private_source_records()}</TableHead>
              <TableHead className="text-right">{m.private_source_versions()}</TableHead>
              <TableHead className="text-right">{m.private_source_assertions()}</TableHead>
              <TableHead className="text-right">{m.private_source_resources()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.providers.map((one) => (
              <TableRow key={one.id}>
                <TableCell>
                  <Button
                    variant={provider === one.id ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={provider === one.id}
                    onClick={() => onProviderChange(provider === one.id ? undefined : one.id)}
                  >
                    {one.title}
                  </Button>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(one.records)}
                </TableCell>
                <TableCell className="text-right text-neutral-7 tabular-nums">
                  {formatCount(one.snapshots)}
                </TableCell>
                <TableCell className="text-right text-neutral-7 tabular-nums">
                  {formatCount(one.claims)}
                </TableCell>
                <TableCell className="text-right text-neutral-7 tabular-nums">
                  {formatCount(one.resources)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export function PrivateSourcesPage({
  filters,
  view,
  offset,
  resourceOffset,
  recordId,
  snapshotId,
  onFiltersChange,
  onViewChange,
  onPageChange,
  onOpen,
  onSnapshotChange,
}: PrivateSourcesPageProps) {
  const summary = useQuery(
    orpc.v1.privateCatalogue.summary.queryOptions({ input: {}, meta: { quiet: true } }),
  );
  const configured = summary.data?.configured === true && !summary.isError;
  const records = useQuery(
    orpc.v1.privateCatalogue.records.queryOptions({
      input: { ...filters, limit: 50, offset },
      enabled: configured && view === "records",
      meta: { quiet: true },
    }),
  );
  const resources = useQuery(
    orpc.v1.privateCatalogue.resources.queryOptions({
      input: { q: filters.q, provider: filters.provider, limit: 50, offset: resourceOffset },
      enabled: configured && view === "resources",
      meta: { quiet: true },
    }),
  );
  const detail = useQuery(
    orpc.v1.privateCatalogue.record.queryOptions({
      input: { id: recordId ?? "" },
      enabled: configured && view === "records" && !!recordId,
      meta: { quiet: true },
    }),
  );
  const q = filters.q ?? "";
  const [typed, setTyped] = useState(q);
  const [seen, setSeen] = useState(q);
  if (q !== seen) {
    setSeen(q);
    if (q !== typed.trim()) setTyped(q);
  }
  useEffect(() => {
    const wanted = withoutSourceSearchControls(typed).trim();
    if (wanted === q) return;
    const timer = setTimeout(() => onFiltersChange({ ...filters, q: wanted || undefined }), 250);
    return () => clearTimeout(timer);
  }, [typed, q, filters.provider, filters.country, onFiltersChange]);

  if (summary.isError) return <SourceError onRetry={() => void summary.refetch()} />;
  if (summary.isPending) return <Loader />;
  if (!summary.data.configured)
    return (
      <div className="grid justify-items-start gap-s">
        <p className="text-neutral-7">{m.private_source_not_configured()}</p>
        <Button variant="outline" onClick={() => void summary.refetch()}>
          {m.retry()}
        </Button>
      </div>
    );
  const providers = summary.data.providers;
  return (
    <div className="grid min-w-0 gap-l">
      <PrivateSourcesOverview
        summary={summary.data}
        provider={filters.provider}
        onProviderChange={(provider) => onFiltersChange({ ...filters, provider })}
      />
      <div className="grid gap-s">
        <ToggleGroup
          size="sm"
          variant="outline"
          aria-label={m.private_source_view()}
          value={[view]}
          onValueChange={(values) => {
            const [next] = values;
            if (next === "records" || next === "resources") onViewChange(next);
          }}
        >
          <ToggleGroupItem value="records">{m.private_source_records()}</ToggleGroupItem>
          <ToggleGroupItem value="resources">{m.private_source_resources()}</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex flex-wrap items-center gap-s">
          <Input
            type="search"
            className="w-full sm:w-80"
            aria-label={
              view === "resources" ? m.private_source_search_urls() : m.private_source_search()
            }
            placeholder={
              view === "resources" ? m.private_source_search_urls() : m.private_source_search()
            }
            autoComplete="off"
            maxLength={120}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <SourceFilter
            label={m.private_source_provider()}
            all={m.private_source_all_providers()}
            value={filters.provider}
            options={providers.map((one) => ({ value: one.id, label: one.title }))}
            onChange={(provider) => onFiltersChange({ ...filters, provider })}
          />
          {view === "records" && (
            <SourceFilter
              label={m.private_source_country_label()}
              all={m.private_source_all_countries()}
              value={filters.country}
              options={summary.data.countries.map((one) => ({
                value: one.label,
                label: `${one.label} · ${formatCount(one.records)}`,
              }))}
              onChange={(country) => onFiltersChange({ ...filters, country })}
            />
          )}
          {(filters.q || filters.provider || filters.country) && (
            <Button
              variant="ghost"
              onClick={() => {
                setTyped("");
                onFiltersChange({});
              }}
            >
              {m.private_source_reset_filters()}
            </Button>
          )}
        </div>
        {view === "records" && (
          <p className="text-s text-neutral-7">{m.private_source_country_note()}</p>
        )}
      </div>
      {view === "resources" ? (
        <section className="grid min-w-0 gap-s" aria-label={m.private_source_resources()}>
          <p className="text-s text-neutral-7">{m.private_source_resources_note()}</p>
          {resources.isError ? (
            <SourceError onRetry={() => void resources.refetch()} />
          ) : resources.isPending ? (
            <Loader />
          ) : (
            <>
              {resources.data.items.length === 0 ? (
                <p className="text-neutral-7">{m.private_source_no_resources()}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.private_source_url()}</TableHead>
                      <TableHead>{m.private_source_provider()}</TableHead>
                      <TableHead>{m.private_source_last_modified()}</TableHead>
                      <TableHead>{m.private_source_detail_retrieved()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resources.data.items.map((one) => (
                      <TableRow key={`${one.artifactSha256}:${one.payloadSha256}:${one.url}`}>
                        <TableCell className="min-w-64 text-s">
                          <SourceUrl value={one.url} />
                          <div className="mt-xs">
                            <SourceJson
                              label={m.private_source_resource_provenance()}
                              value={one}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-s text-neutral-7">
                          {providers.find((provider) => provider.id === one.providerId)?.title ??
                            one.providerId}
                        </TableCell>
                        <TableCell className="text-s text-neutral-7">
                          {sourceDateText(one.lastModified) ?? m.private_source_unknown()}
                        </TableCell>
                        <TableCell className="text-s">
                          {one.detailRetrieved ? m.private_source_yes() : m.private_source_no()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <SourcePagination
                total={resources.data.total}
                limit={resources.data.limit}
                offset={resources.data.offset}
                busy={resources.isFetching}
                onChange={(next) => onPageChange(next, true)}
              />
            </>
          )}
        </section>
      ) : (
        <div className="grid min-w-0 gap-l xl:grid-cols-[minmax(20rem,2fr)_minmax(0,3fr)]">
          <section
            className={cn("grid min-w-0 content-start gap-s", recordId && "max-xl:hidden")}
            aria-label={m.private_source_records()}
          >
            {records.isError ? (
              <SourceError onRetry={() => void records.refetch()} />
            ) : records.isPending ? (
              <Loader />
            ) : (
              <>
                {records.data.items.length === 0 ? (
                  <p className="text-neutral-7">{m.private_source_no_records()}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{m.private_source_name()}</TableHead>
                        <TableHead>{m.private_source_versions()}</TableHead>
                        <TableHead>{m.private_source_assertions()}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.data.items.map((one) => (
                        <TableRow
                          key={one.id}
                          data-state={one.id === recordId ? "selected" : undefined}
                        >
                          <TableCell className="min-w-48">
                            <button
                              type="button"
                              aria-current={one.id === recordId || undefined}
                              className="focus-ring grid gap-xxs rounded-xs text-left hover:underline"
                              onClick={() => onOpen(one.id)}
                            >
                              <span className="font-medium">
                                {one.firstLabel ?? one.names[0] ?? one.nativeId}
                              </span>
                              <span className="text-s text-neutral-7">
                                {providers.find((provider) => provider.id === one.providerId)
                                  ?.title ?? one.providerId}{" "}
                                · {one.nativeId}
                              </span>
                              {one.countries.length > 0 && (
                                <span className="text-s text-neutral-7">
                                  {one.countries.join(" · ")}
                                </span>
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="text-neutral-7 tabular-nums">
                            {formatCount(one.snapshots)}
                          </TableCell>
                          <TableCell className="text-neutral-7 tabular-nums">
                            {formatCount(one.claims)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <SourcePagination
                  total={records.data.total}
                  limit={records.data.limit}
                  offset={records.data.offset}
                  busy={records.isFetching}
                  onChange={(next) => onPageChange(next, false)}
                />
              </>
            )}
          </section>
          <div className="min-w-0">
            {recordId && (!detail.data || detail.isError) && (
              <Button variant="ghost" size="sm" className="mb-s" onClick={() => onOpen(undefined)}>
                {m.private_source_back_to_list()}
              </Button>
            )}
            {!recordId ? (
              <p className="text-neutral-7">{m.private_source_select_record()}</p>
            ) : isMissing(detail.error) ? (
              <p role="status" className="text-neutral-7">
                {m.private_source_record_missing()}
              </p>
            ) : detail.isError ? (
              <SourceError onRetry={() => void detail.refetch()} />
            ) : detail.isPending ? (
              <Loader />
            ) : (
              <PrivateSourceDesk
                key={detail.data.record.id}
                detail={detail.data}
                snapshotId={snapshotId}
                onSnapshotChange={onSnapshotChange}
                onClose={() => onOpen(undefined)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
