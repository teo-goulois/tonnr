import { Button } from "@repo/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Loader } from "@/components/shared/loader";
import type { PrivateSourceDetail, PrivateSourceSnapshot } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { publicSourceUrl, sourceDateText, sourceJsonText } from "@/lib/private-source-values";
import { m } from "@/paraglide/messages.js";
import { isMissing, orpc } from "@/utils/orpc";

export function SourceError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="grid justify-items-start gap-s">
      <p className="text-neutral-7">{m.private_source_load_failed()}</p>
      <Button variant="outline" onClick={onRetry}>
        {m.retry()}
      </Button>
    </div>
  );
}

export function SourceUrl({ value }: { value: string | null }) {
  if (!value) return <span className="text-neutral-7">{m.private_source_unknown()}</span>;
  const href = publicSourceUrl(value);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className="focus-ring rounded-xs break-all underline underline-offset-2 hover:text-neutral-10"
    >
      {value}
    </a>
  ) : (
    <span className="text-neutral-7">{m.private_source_unlinked_url()}</span>
  );
}

/** The source JSON is escaped text, and is only mounted after its disclosure opens. */
export function SourceJson({ value, label }: { value: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="min-w-0 w-full max-w-full"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="focus-ring cursor-pointer rounded-xs text-s text-neutral-7">
        {label}
      </summary>
      {open && (
        <pre
          tabIndex={0}
          aria-label={label}
          className="focus-ring mt-xs min-w-0 w-full max-w-full max-h-96 overflow-auto rounded-xs bg-neutral-3 p-xs font-mono text-xs"
        >
          {sourceJsonText(value)}
        </pre>
      )}
    </details>
  );
}

function Facts({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className="grid min-w-0 gap-x-m gap-y-xs text-s sm:grid-cols-[minmax(9rem,auto)_minmax(0,1fr)]">
      {values.map(([label, value]) => (
        <div key={label} className="grid gap-xxs sm:col-span-2 sm:grid-cols-subgrid">
          <dt className="text-neutral-7">{label}</dt>
          <dd className="min-w-0 break-words [overflow-wrap:anywhere]">
            {value ?? m.private_source_unknown()}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SourcePagination({
  total,
  offset,
  limit,
  busy,
  onChange,
}: {
  total: number;
  offset: number;
  limit: number;
  busy: boolean;
  onChange: (offset: number) => void;
}) {
  const end = Math.min(offset + limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-s">
      <p aria-live="polite" className="text-s text-neutral-7 tabular-nums">
        {m.private_source_page_range({
          first: formatCount(total === 0 || offset >= total ? 0 : offset + 1),
          last: formatCount(offset >= total ? 0 : end),
          total: formatCount(total),
        })}
      </p>
      <div className="flex gap-xs">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          {m.catalogue_previous()}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || offset + limit >= total || offset + limit > 100_000}
          onClick={() => onChange(offset + limit)}
        >
          {m.catalogue_next()}
        </Button>
      </div>
    </div>
  );
}

/** A chosen export occurrence, never an independently corroborated physical break. */
export function PrivateSourceSnapshotView({ version }: { version: PrivateSourceSnapshot }) {
  const { snapshot, payload } = version;
  return (
    <section className="grid min-w-0 gap-s" aria-label={m.private_source_selected_version()}>
      <h3 className="font-medium">{m.private_source_selected_version()}</h3>
      <Facts
        values={[
          [m.private_source_name(), snapshot.name],
          [m.private_source_observed_at(), sourceDateText(snapshot.observedAt)],
          [m.private_source_imported_at(), sourceDateText(snapshot.importedAt)],
          [m.private_source_export_kind(), snapshot.exportKind],
          [m.private_source_country_label(), snapshot.countryLabel],
          [m.private_source_url(), <SourceUrl value={snapshot.sourceUrl} />],
          [m.private_source_review_status(), snapshot.reviewStatus],
          [m.private_source_snapshot_id(), snapshot.id],
          [m.private_source_artifact(), snapshot.artifactSha256],
          [m.private_source_source_row(), snapshot.sourceRow],
          [m.private_source_payload_hash(), snapshot.payloadSha256],
        ]}
      />
      <SourceJson label={m.private_source_original_json()} value={payload} />
    </section>
  );
}

function SourceClaims({ recordId }: { recordId: string }) {
  const [offset, setOffset] = useState(0);
  const claims = useQuery(
    orpc.v1.privateCatalogue.claims.queryOptions({
      input: { recordId, limit: 25, offset },
      meta: { quiet: true },
    }),
  );
  return (
    <section className="grid min-w-0 gap-s" aria-label={m.private_source_claims()}>
      <h3 className="font-medium">{m.private_source_claims()}</h3>
      <p className="text-s text-neutral-7">{m.private_source_claims_scope()}</p>
      {claims.isError ? (
        <SourceError onRetry={() => void claims.refetch()} />
      ) : claims.isPending ? (
        <Loader />
      ) : (
        <>
          {claims.data.items.length === 0 ? (
            <p className="text-neutral-7">{m.private_source_no_claims()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.private_source_predicate()}</TableHead>
                  <TableHead>{m.private_source_value()}</TableHead>
                  <TableHead>{m.private_source_unit()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.data.items.map((claim) => (
                  <TableRow key={`${claim.artifactSha256}:${claim.sourceRow}:${claim.id}`}>
                    <TableCell className="max-w-60 align-top">
                      <p className="break-words font-mono text-s">{claim.predicate}</p>
                      <p className="text-s text-neutral-7">{claim.kind}</p>
                    </TableCell>
                    <TableCell className="min-w-48 align-top">
                      <pre className="max-h-48 overflow-auto font-mono text-s whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {sourceJsonText(claim.value)}
                      </pre>
                      <div className="mt-xs">
                        <SourceJson label={m.private_source_claim_provenance()} value={claim} />
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-s text-neutral-7">
                      {claim.unit ?? m.private_source_unknown()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <SourcePagination
            total={claims.data.total}
            limit={claims.data.limit}
            offset={claims.data.offset}
            busy={claims.isFetching}
            onChange={setOffset}
          />
        </>
      )}
    </section>
  );
}

export function PrivateSourceDesk({
  detail,
  snapshotId,
  onSnapshotChange,
  onClose,
}: {
  detail: PrivateSourceDetail;
  snapshotId: string | undefined;
  onSnapshotChange: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const { record, provider, snapshots } = detail;
  const title = useRef<HTMLHeadingElement>(null);
  // Opening a record moves to its heading. Choosing another version leaves focus where
  // the operator put it, and a small screen does not leave the detail below fifty rows.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: "start" });
  }, [record.id]);
  const knownSnapshot = snapshots.some((one) => one.id === snapshotId);
  const version = useQuery(
    orpc.v1.privateCatalogue.snapshot.queryOptions({
      input: { id: snapshotId ?? "" },
      enabled: knownSnapshot,
      meta: { quiet: true },
    }),
  );
  const missingVersion = snapshotId && (!knownSnapshot || isMissing(version.error));
  return (
    <article className="grid min-w-0 gap-l">
      <div className="flex flex-wrap items-start justify-between gap-s">
        <div className="grid min-w-0 gap-xxs">
          <h2 ref={title} tabIndex={-1} className="break-words font-medium outline-none">
            {record.firstLabel ?? record.names[0] ?? record.nativeId}
          </h2>
          <p className="text-s text-neutral-7">
            {provider.title} · {record.nativeId}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {m.private_source_back_to_list()}
        </Button>
      </div>
      <section className="grid min-w-0 gap-s" aria-label={m.private_source_provenance_rights()}>
        <h3 className="font-medium">{m.private_source_provenance_rights()}</h3>
        <Facts
          values={[
            [m.private_source_publisher_group(), provider.publisherGroup],
            [m.private_source_rights_status(), provider.rightsStatus],
            [m.private_source_record_id(), record.id],
            [m.private_source_identity_kind(), record.identityKind],
            [m.private_source_published_names(), record.names.join(" · ") || null],
            [m.private_source_country_labels(), record.countries.join(" · ") || null],
          ]}
        />
        <p className="text-s text-neutral-7">{m.private_source_rights_note()}</p>
        {detail.aliases.length > 0 && (
          <SourceJson label={m.private_source_technical_aliases()} value={detail.aliases} />
        )}
        {detail.aliasesTruncated && (
          <p className="text-s text-neutral-7">{m.private_source_aliases_truncated()}</p>
        )}
        {detail.currentIdentity && (
          <SourceJson label={m.private_source_identity_event()} value={detail.currentIdentity} />
        )}
      </section>
      <section className="grid min-w-0 gap-s" aria-label={m.private_source_versions()}>
        <h3 className="font-medium">
          {m.private_source_versions_count({ count: formatCount(record.snapshots) })}
        </h3>
        <p className="text-s text-neutral-7">{m.private_source_versions_note()}</p>
        {snapshots.length === 0 ? (
          <p className="text-neutral-7">{m.private_source_no_versions()}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.private_source_export_kind()}</TableHead>
                <TableHead>{m.private_source_observed_at()}</TableHead>
                <TableHead>{m.private_source_imported_at()}</TableHead>
                <TableHead>
                  <span className="sr-only">{m.private_source_choose_version()}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((one) => (
                <TableRow key={one.id} data-state={one.id === snapshotId ? "selected" : undefined}>
                  <TableCell className="text-s">{one.exportKind}</TableCell>
                  <TableCell className="text-s text-neutral-7">
                    {sourceDateText(one.observedAt) ?? m.private_source_unknown()}
                  </TableCell>
                  <TableCell className="text-s text-neutral-7">
                    {sourceDateText(one.importedAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={one.id === snapshotId ? "secondary" : "outline"}
                      size="sm"
                      aria-pressed={one.id === snapshotId}
                      onClick={() => onSnapshotChange(one.id)}
                    >
                      {m.private_source_choose_version()}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {detail.snapshotsTruncated && (
          <p className="text-s text-neutral-7">{m.private_source_versions_truncated()}</p>
        )}
      </section>
      {missingVersion ? (
        <div className="grid justify-items-start gap-s">
          <p role="status" className="text-neutral-7">
            {m.private_source_version_missing()}
          </p>
          <Button variant="outline" onClick={() => onSnapshotChange(undefined)}>
            {m.private_source_choose_another_version()}
          </Button>
        </div>
      ) : snapshotId && version.isError ? (
        <SourceError onRetry={() => void version.refetch()} />
      ) : snapshotId && version.isPending ? (
        <Loader />
      ) : version.data && version.data.snapshot.recordId === record.id ? (
        <PrivateSourceSnapshotView key={version.data.snapshot.id} version={version.data} />
      ) : snapshotId ? (
        <p className="text-neutral-7">{m.private_source_version_missing()}</p>
      ) : (
        <p className="text-neutral-7">{m.private_source_select_version()}</p>
      )}
      <SourceClaims key={record.id} recordId={record.id} />
    </article>
  );
}
