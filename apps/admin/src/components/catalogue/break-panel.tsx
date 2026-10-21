import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { useSelector } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { BreakPage, BreakUses } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { BreakFields, type BreakForm, draftOf, sameDraft } from "./break-fields";
import { ListTexts } from "./list-texts";
import { PlaceLinks } from "./place-links";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-xs">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

/** What uses a break, in words, or null when nothing does. */
export function usesOf(uses: BreakUses) {
  const said = [
    uses.spots > 0 && m.catalogue_uses_spots({ count: formatCount(uses.spots) }),
    uses.alerts > 0 && m.catalogue_uses_alerts({ count: formatCount(uses.alerts) }),
    uses.lists > 0 && m.catalogue_uses_lists({ count: formatCount(uses.lists) }),
    uses.sessions > 0 && m.catalogue_uses_sessions({ count: formatCount(uses.sessions) }),
    uses.contributions > 0 &&
      m.catalogue_uses_contributions({ count: formatCount(uses.contributions) }),
    uses.answers > 0 && m.catalogue_uses_answers({ count: formatCount(uses.answers) }),
    uses.publications > 0 && m.catalogue_uses_publications(),
  ].filter((part) => typeof part === "string");
  return said.length > 0 ? said.join(", ") : null;
}

type BreakPanelProps = {
  page: BreakPage;
  // The form of the break, which the page holds, since the map beside it moves its marker. It
  // saves the break when it is sent.
  form: BreakForm;
  onSelect: (id: string) => void;
  onMerge: (otherId: string) => void;
  onDelete: () => void;
};

/** One break of the catalogue: what it is, what uses it, and what its operator changes of it. */
export function BreakPanel({ page, form, onSelect, onMerge, onDelete }: BreakPanelProps) {
  const found = page.break;
  const isChanged = useSelector(
    form.store,
    (state) => !sameDraft(state.values, draftOf(found, state.values.language)),
  );
  const used = usesOf(page.uses);

  return (
    <div className="grid gap-l">
      <div className="grid gap-xs">
        <h2 className="text-l font-medium text-pretty">{found.name}</h2>
        <p className="text-s text-neutral-7">
          {[found.source.provider, found.source.ref].filter(Boolean).join(" · ") ||
            m.catalogue_no_source()}
          {found.location && ` · ${[...found.location].reverse().join(", ")}`}
        </p>
        <PlaceLinks point={found} />
        <p className="text-s">
          {used ? (
            <Badge variant="warning">{m.catalogue_used_by({ uses: used })}</Badge>
          ) : (
            <span className="text-neutral-7">{m.catalogue_unused()}</span>
          )}
        </p>
      </div>

      <form.AppForm>
        <form.Form className="grid gap-m">
          <BreakFields form={form} confirmed={found.confirmed} />
          <div className="sticky bottom-0 flex flex-wrap gap-xs bg-neutral-1 py-xs">
            <form.SubmitButton disabled={!isChanged}>{m.catalogue_save()}</form.SubmitButton>
            <Button
              type="button"
              variant="ghost"
              disabled={!isChanged}
              onClick={() => form.reset(draftOf(found, form.state.values.language))}
            >
              {m.catalogue_reset()}
            </Button>
          </div>
        </form.Form>
      </form.AppForm>

      <Part title={m.catalogue_nearby()}>
        {page.nearby.length > 0 ? (
          <ul className="grid gap-xs">
            {page.nearby.map((near) => (
              <li key={near.id} className="flex flex-wrap items-center justify-between gap-xs">
                <button
                  type="button"
                  className="focus-ring rounded-xs text-left underline-offset-2 hover:underline"
                  onClick={() => onSelect(near.id)}
                >
                  {near.name}
                  <span className="text-s text-neutral-7">
                    {" "}
                    · {m.catalogue_meters({ meters: formatCount(near.meters) })}
                    {near.provider && ` · ${near.provider}`}
                  </span>
                </button>
                <Button variant="outline" size="sm" onClick={() => onMerge(near.id)}>
                  {m.catalogue_merge()}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-7">{m.catalogue_nearby_none()}</p>
        )}
      </Part>

      {page.listings.length > 0 && (
        <Part title={m.catalogue_listings()}>
          <div className="grid gap-m">
            {page.listings.map((listing) => (
              <ListTexts
                key={`${listing.list}:${listing.ref}`}
                list={listing.list}
                reference={listing.ref}
                details={listing.details}
              />
            ))}
          </div>
        </Part>
      )}

      {page.candidates.length > 0 && (
        <Part title={m.catalogue_candidates()}>
          <ul className="grid gap-xxs">
            {page.candidates.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  to="/catalogue/import"
                  search={{ candidate: candidate.id }}
                  className="focus-ring rounded-xs underline underline-offset-2"
                >
                  {candidate.name}
                </Link>
                <span className="text-s text-neutral-7">
                  {" "}
                  · {candidate.list} · {candidate.ref}
                </span>
              </li>
            ))}
          </ul>
        </Part>
      )}

      <Part title={m.catalogue_delete_title()}>
        {used ? (
          <p className="text-neutral-7">{m.catalogue_delete_used()}</p>
        ) : (
          <div>
            <Button variant="destructive" onClick={onDelete}>
              {m.catalogue_delete()}
            </Button>
          </div>
        )}
      </Part>
    </div>
  );
}
