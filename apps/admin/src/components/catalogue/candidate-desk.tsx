import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useAppForm, useSelector } from "@repo/ui/hooks/form/form";
import { fold } from "@repo/config/names";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ShortcutKeys } from "@/components/shared/shortcut-keys";
import type { CandidatePage, MapBreak } from "@/lib/api";
import { formatCount, formatDayAndHour } from "@/lib/format";
import { useShortcut, useShortcuts } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { client, orpc } from "@/utils/orpc";

import {
  BreakFields,
  DESCRIPTION_MOST,
  type DescriptionLanguage,
  linesInOrder,
  offshoreDraftOf,
  offshoreOf,
  pointOfDraft,
  sizeDraftOf,
  useBreakForm,
  valuesOf,
} from "./break-fields";
import { CatalogueMap } from "./catalogue-map";
import { ListFigure } from "./figure";
import { type Choices, fillBlanks, MergeChoices, mergedValues, type Side } from "./merge-choices";
import { PlaceLinks } from "./place-links";
import { NOTHING_SAID } from "./words";

type Mode = "add" | "merge";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-xs">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

// What the search of a break shows at most.
const FOUND_MOST = 8;

/** A break of the catalogue the candidate may go into, with what to choose it by. */
function BreakChoice({
  name,
  meters,
  provider,
  isChosen,
  onChoose,
}: {
  name: string;
  meters: number | null;
  provider: string | null;
  isChosen: boolean;
  // Absent once the candidate is decided.
  onChoose: (() => void) | undefined;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-xs">
      <span>
        {name}
        <span className="text-s text-neutral-7">
          {meters !== null && ` · ${m.catalogue_meters({ meters: formatCount(meters) })}`}
          {provider && ` · ${provider}`}
        </span>
      </span>
      {onChoose && (
        <Button variant={isChosen ? "default" : "outline"} size="sm" onClick={onChoose}>
          {m.catalogue_merge_into()}
        </Button>
      )}
    </li>
  );
}

/**
 * The buttons of a decision, at the foot of the form in view: what accepts it, which sends the
 * form, then what puts it off and what ignores it, which decide without it.
 */
function DecisionBar({
  accept,
  status,
  isPending,
  onDecide,
  onIgnore,
  bindings,
}: {
  accept: ReactNode;
  status: CandidatePage["candidate"]["status"];
  isPending: (decision: "later" | "reopen") => boolean;
  onDecide: (decision: "later" | "reopen") => void;
  onIgnore: () => void;
  bindings: ReturnType<typeof useShortcuts>;
}) {
  return (
    <div className="sticky bottom-0 flex flex-wrap gap-xs bg-neutral-1 py-xs">
      {accept}
      {status === "waiting" ? (
        <Button
          type="button"
          variant="outline"
          isPending={isPending("later")}
          onClick={() => onDecide("later")}
        >
          {m.catalogue_later()}
          <ShortcutKeys hotkey={bindings["candidate-later"]} className="max-md:hidden" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          isPending={isPending("reopen")}
          onClick={() => onDecide("reopen")}
        >
          {m.catalogue_wait_again()}
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onIgnore}>
        {m.catalogue_ignore()}
        <ShortcutKeys hotkey={bindings["candidate-ignore"]} className="max-md:hidden" />
      </Button>
    </div>
  );
}

const ACTIONS = {
  add: m.catalogue_proposal_add,
  merge: m.catalogue_proposal_merge,
  hold: m.catalogue_proposal_hold,
};

const STATES = {
  waiting: m.catalogue_state_waiting,
  later: m.catalogue_state_later,
  added: m.catalogue_state_added,
  merged: m.catalogue_state_merged,
  ignored: m.catalogue_state_ignored,
};

type CandidateDeskProps = {
  page: CandidatePage;
  breaks: MapBreak[];
  // The candidates before and after this one in the queue in view.
  previousId: string | undefined;
  nextId: string | undefined;
  onOpen: (id: string) => void;
  // A decision was taken: the page the API gave back, which says the next that waits.
  onDecided: (page: CandidatePage) => void;
};

/**
 * One candidate of a list, with what to decide it on: what whoever prepared the list proposes
 * and why, the list's own texts and pictures, the breaks around it on a map, and the decision.
 */
export function CandidateDesk({
  page,
  breaks,
  previousId,
  nextId,
  onOpen,
  onDecided,
}: CandidateDeskProps) {
  const { candidate, others } = page;
  // A break the list thought of is said once, among those.
  const nearby = page.nearby.filter((near) => !others.some((other) => other.id === near.id));
  const isOpen = candidate.status === "waiting" || candidate.status === "later";
  const language: DescriptionLanguage = getLocale() === "fr" ? "fr" : "en";
  const bindings = useShortcuts();

  // The break it goes into: the one proposed, until the operator chooses another.
  const [targetId, setTargetId] = useState<string | null>(
    page.target?.id ??
      (candidate.proposal?.action === "merge" ? (page.nearby[0]?.id ?? null) : null),
  );
  const [mode, setMode] = useState<Mode>(
    targetId && candidate.proposal?.action === "merge" ? "merge" : "add",
  );
  const target = useQuery(
    orpc.v1.catalogue.get.queryOptions({
      input: { id: targetId ?? "" },
      enabled: targetId !== null && isOpen,
    }),
  );

  // The break as it would be added, which the map beside it moves, and the form that adds it. A
  // decision is taken once its form is sent, whether by its button or by the shortcut.
  const formRef = useRef<HTMLFormElement>(null);
  const listed = candidate.characteristics ?? NOTHING_SAID;
  const addForm = useBreakForm({
    defaultValues: {
      name: candidate.proposal?.name ?? candidate.name,
      latitude: candidate.latitude?.toFixed(5) ?? "",
      longitude: candidate.longitude?.toFixed(5) ?? "",
      characteristics: listed,
      offshore: offshoreDraftOf(listed),
      size: sizeDraftOf(listed),
      description: "",
      language,
    },
    onSubmit: async () => {
      // The mutation said what went wrong.
      await decide.mutateAsync("add").catch(() => {});
    },
  });
  const draft = useSelector(addForm.store, (state) => state.values);
  const point = pointOfDraft(draft);
  const side: Side = {
    name: draft.name,
    latitude: point?.latitude ?? target.data?.break.latitude ?? 0,
    longitude: point?.longitude ?? target.data?.break.longitude ?? 0,
    characteristics: {
      ...linesInOrder(draft.characteristics),
      offshoreDirectionDegrees: offshoreOf(draft.offshore),
    },
    description: null,
  };
  const [choices, setChoices] = useState<{ id: string; choices: Choices } | null>(null);
  const kept = target.data?.break;
  const chosen =
    kept && choices?.id === kept.id ? choices.choices : kept ? fillBlanks(kept, side) : null;
  // The description of the break it goes into, which the merge writes: the break's own, until the
  // operator changes it. Another break chosen starts from its own.
  const mergeForm = useAppForm({
    defaultValues: {
      text: kept?.description?.text ?? "",
      language: kept?.description?.language ?? language,
    },
    onSubmit: async () => {
      // The mutation said what went wrong.
      await decide.mutateAsync("merge").catch(() => {});
    },
    validators: {
      onSubmit: z.object({
        text: z.string().refine(
          (typed) => {
            const text = typed.trim();
            return text === "" || (text.length >= 3 && text.length <= DESCRIPTION_MOST);
          },
          m.catalogue_fault_description({ most: DESCRIPTION_MOST }),
        ),
        language: z.enum(["en", "fr"]),
      }),
    },
  });
  useEffect(() => {
    if (kept) {
      mergeForm.reset({
        text: kept.description?.text ?? "",
        language: kept.description?.language ?? language,
      });
    }
  }, [kept?.id]);

  const [ignoring, setIgnoring] = useState(false);
  const ignoreForm = useAppForm({
    defaultValues: { note: "" },
    onSubmit: async () => {
      // The mutation said what went wrong.
      await decide.mutateAsync("ignore").catch(() => {});
    },
  });

  const decide = useMutation({
    mutationFn: async (decision: "add" | "merge" | "later" | "ignore" | "reopen") => {
      const version = { id: candidate.id, updatedAt: candidate.updatedAt };
      if (decision === "add")
        return client.v1.candidates.add({ ...version, values: valuesOf(addForm.state.values) });
      if (decision === "merge") {
        if (!kept || !chosen) throw new Error(m.catalogue_merge_pick());
        const description = mergeForm.state.values;
        const text = description.text.trim();
        return client.v1.candidates.merge({
          ...version,
          breakId: kept.id,
          breakUpdatedAt: kept.updatedAt,
          values: {
            ...mergedValues(kept, side, chosen),
            description: text === "" ? null : { text, language: description.language },
          },
        });
      }
      if (decision === "later") return client.v1.candidates.later(version);
      if (decision === "ignore") {
        return client.v1.candidates.ignore({ ...version, note: ignoreForm.state.values.note });
      }
      return client.v1.candidates.reopen(version);
    },
    onSuccess: (next, decision) => {
      const said = {
        add: m.catalogue_decided_added,
        merge: m.catalogue_decided_merged,
        later: m.catalogue_decided_later,
        ignore: m.catalogue_decided_ignored,
        reopen: m.catalogue_decided_reopened,
      }[decision];
      toast.success(said({ name: next.candidate.name }));
      setIgnoring(false);
      ignoreForm.reset();
      onDecided(next);
    },
    onError: (error) => toast.error(error.message),
  });

  const canMerge = Boolean(kept && chosen);
  // The shortcut sends the form in view, as its button does: what is wrong is said, and focused.
  const accept = () => {
    if (!isOpen || decide.isPending) return;
    if (mode === "merge" && !canMerge) return;
    formRef.current?.requestSubmit();
  };
  useShortcut("candidate-accept", bindings, accept);
  useShortcut("candidate-later", bindings, () => {
    if (candidate.status === "waiting" && !decide.isPending) decide.mutate("later");
  });
  useShortcut("candidate-ignore", bindings, () => isOpen && setIgnoring(true));
  useShortcut("candidate-next", bindings, () => nextId && onOpen(nextId));
  useShortcut("candidate-previous", bindings, () => previousId && onOpen(previousId));

  const barProps = {
    status: candidate.status,
    isPending: (decision: "later" | "reopen") => decide.isPending && decide.variables === decision,
    onDecide: (decision: "later" | "reopen") => decide.mutate(decision),
    onIgnore: () => setIgnoring(true),
    bindings,
  };

  const proposal = candidate.proposal;
  const decidedBreak = candidate.breakId;
  const chooseTarget = isOpen
    ? (id: string) => {
        setTargetId(id);
        setMode("merge");
      }
    : undefined;

  // Any break of the catalogue, by its name: the one it is may lie far from where the list put it.
  const [query, setQuery] = useState("");
  const found = useMemo(() => {
    const typed = fold(query.trim());
    if (typed.length < 2) return [];
    return breaks.filter((one) => fold(one.name).includes(typed)).slice(0, FOUND_MOST);
  }, [breaks, query]);
  // A break chosen by hand, which may lie far from the candidate: the map goes to it.
  const picked =
    targetId !== page.target?.id ? breaks.find((one) => one.id === targetId) : undefined;
  const chosenPoint = picked ? { latitude: picked.latitude, longitude: picked.longitude } : null;
  const searchWeb = `https://www.google.com/search?q=${encodeURIComponent(
    [candidate.name, ...(candidate.location ?? []), "surf"].join(" "),
  )}`;

  return (
    <div className="grid gap-l">
      <div className="flex flex-wrap items-start justify-between gap-s">
        <div className="grid gap-xxs">
          <h2 className="text-l font-medium text-pretty">{candidate.name}</h2>
          <p className="text-s text-neutral-7">
            {[candidate.location?.join(" · "), `${candidate.list} · ${candidate.ref}`]
              .filter(Boolean)
              .join(" — ")}{" "}
            ·{" "}
            <a
              href={searchWeb}
              target="_blank"
              rel="noreferrer"
              className="focus-ring rounded-xs underline underline-offset-2 hover:text-neutral-10"
            >
              {m.catalogue_search_web()}
            </a>
          </p>
        </div>
        <div className="flex gap-xs">
          <Button
            variant="outline"
            size="sm"
            disabled={!previousId}
            onClick={() => previousId && onOpen(previousId)}
          >
            {m.catalogue_previous()}
            <ShortcutKeys hotkey={bindings["candidate-previous"]} className="max-md:hidden" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!nextId}
            onClick={() => nextId && onOpen(nextId)}
          >
            {m.catalogue_next()}
            <ShortcutKeys hotkey={bindings["candidate-next"]} className="max-md:hidden" />
          </Button>
        </div>
      </div>

      {proposal && (
        <section className="edge grid gap-xs rounded-m p-m [--edge-color:var(--neutral-4)]">
          <h3 className="font-medium">{ACTIONS[proposal.action]()}</h3>
          {proposal.note && <p className="text-pretty whitespace-pre-line">{proposal.note}</p>}
          {proposal.doubts && proposal.doubts.length > 0 && (
            <ul className="grid gap-xxs">
              {proposal.doubts.map((doubt) => (
                <li key={doubt} className="text-pretty">
                  <Badge variant="warning" className="mr-xs">
                    {m.catalogue_doubt()}
                  </Badge>
                  {doubt}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-l xl:grid-cols-2">
        <div className="grid content-start gap-l">
          {candidate.figures.length > 0 && (
            <Part title={m.catalogue_figures()}>
              {candidate.figures.map((figure) => (
                <ListFigure
                  key={`${figure.image}:${figure.crop?.join(",")}`}
                  list={candidate.list}
                  figure={figure}
                  alt={m.catalogue_figure_alt({ name: candidate.name })}
                />
              ))}
            </Part>
          )}
          {candidate.texts.length > 0 && (
            <Part title={m.catalogue_texts()}>
              <ul className="grid gap-s">
                {candidate.texts.map((text) => (
                  <li key={`${text.label}:${text.language}:${text.text}`} className="grid gap-xxs">
                    <span className="text-s text-neutral-7">
                      {[text.label, text.language?.toUpperCase()].filter(Boolean).join(" · ")}
                    </span>
                    <p lang={text.language} className="text-pretty whitespace-pre-line">
                      {text.text}
                    </p>
                  </li>
                ))}
              </ul>
            </Part>
          )}
          {candidate.evidence.length > 0 && (
            <Part title={m.catalogue_evidence()}>
              <ul className="grid gap-xs">
                {candidate.evidence.map((page) => (
                  <li key={page.url} className="grid gap-xxs">
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring rounded-xs break-words underline underline-offset-2"
                    >
                      {page.title ?? page.url}
                    </a>
                    {page.note && <p className="text-s text-neutral-7 text-pretty">{page.note}</p>}
                  </li>
                ))}
              </ul>
            </Part>
          )}
          {candidate.details && (
            <details>
              <summary className="focus-ring cursor-pointer rounded-xs text-s text-neutral-7">
                {m.catalogue_listing_raw()}
              </summary>
              <pre className="mt-xs max-h-96 overflow-auto rounded-xs bg-neutral-3 p-xs font-mono text-xs">
                {JSON.stringify(candidate.details, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <div className="grid content-start gap-s">
          <div className="h-[24rem]">
            <CatalogueMap
              breaks={breaks}
              selectedId={mode === "merge" ? (targetId ?? undefined) : undefined}
              markedIds={[...others, ...nearby].map((near) => near.id)}
              marker={point}
              onMarkerMove={
                isOpen
                  ? (moved) => {
                      addForm.setFieldValue("latitude", moved.latitude.toFixed(5));
                      addForm.setFieldValue("longitude", moved.longitude.toFixed(5));
                    }
                  : undefined
              }
              onSelect={(id) => chooseTarget?.(id)}
              focus={
                chosenPoint
                  ? { key: `${candidate.id}:${targetId}`, point: chosenPoint, zoom: 14 }
                  : point
                    ? { key: candidate.id, point, zoom: 14 }
                    : page.target
                      ? { key: candidate.id, point: page.target, zoom: 14 }
                      : null
              }
            />
          </div>
          {point && <PlaceLinks point={point} />}
          {candidate.pointNote && (
            <p className="text-s text-neutral-7 text-pretty">
              {candidate.pointNote}
              {candidate.pointUrl && (
                <>
                  {" "}
                  <a
                    href={candidate.pointUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring rounded-xs underline underline-offset-2"
                  >
                    {m.catalogue_point_source()}
                  </a>
                </>
              )}
            </p>
          )}
          {others.length > 0 && (
            <Part title={m.catalogue_others()}>
              <ul className="grid gap-xxs">
                {others.map((other) => (
                  <BreakChoice
                    key={other.id}
                    name={other.name}
                    meters={other.meters}
                    provider={other.provider}
                    isChosen={mode === "merge" && targetId === other.id}
                    onChoose={chooseTarget && (() => chooseTarget(other.id))}
                  />
                ))}
              </ul>
            </Part>
          )}
          <Part title={m.catalogue_nearby_candidate({ meters: formatCount(3000) })}>
            {nearby.length > 0 ? (
              <ul className="grid gap-xxs">
                {nearby.slice(0, 8).map((near) => (
                  <BreakChoice
                    key={near.id}
                    name={near.name}
                    meters={near.meters}
                    provider={near.provider}
                    isChosen={mode === "merge" && targetId === near.id}
                    onChoose={chooseTarget && (() => chooseTarget(near.id))}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-neutral-7">{m.catalogue_nearby_none()}</p>
            )}
          </Part>
          {isOpen && (
            <div className="grid gap-xs">
              <Input
                type="search"
                value={query}
                placeholder={m.catalogue_search()}
                aria-label={m.catalogue_search()}
                onChange={(event) => setQuery(event.target.value)}
              />
              {found.length > 0 && (
                <ul className="grid gap-xxs">
                  {found.map((one) => (
                    <BreakChoice
                      key={one.id}
                      name={one.name}
                      meters={null}
                      provider={one.provider}
                      isChosen={mode === "merge" && targetId === one.id}
                      onChoose={chooseTarget && (() => chooseTarget(one.id))}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {isOpen ? (
        <section className="grid gap-m">
          <ToggleGroup
            size="default"
            variant="outline"
            aria-label={m.catalogue_decision()}
            value={[mode]}
            onValueChange={(chosenMode) => {
              const [next] = chosenMode as Mode[];
              if (next) setMode(next);
            }}
          >
            <ToggleGroupItem value="add">{m.catalogue_mode_add()}</ToggleGroupItem>
            <ToggleGroupItem value="merge" disabled={!targetId}>
              {kept ? m.catalogue_mode_merge({ name: kept.name }) : m.catalogue_mode_merge_none()}
            </ToggleGroupItem>
          </ToggleGroup>

          {mode === "add" ? (
            <addForm.AppForm>
              <addForm.Form ref={formRef} className="grid gap-m">
                <BreakFields form={addForm} descriptionHint={m.catalogue_description_own()} />
                <DecisionBar
                  accept={
                    <addForm.SubmitButton
                      isPending={decide.isPending && decide.variables === "add"}
                    >
                      {m.catalogue_add()}
                      <ShortcutKeys
                        hotkey={bindings["candidate-accept"]}
                        className="max-md:hidden"
                      />
                    </addForm.SubmitButton>
                  }
                  {...barProps}
                />
              </addForm.Form>
            </addForm.AppForm>
          ) : (
            <mergeForm.AppForm>
              <mergeForm.Form ref={formRef} className="grid gap-m">
                {kept && chosen ? (
                  <div className="grid gap-m">
                    <MergeChoices
                      kept={kept}
                      other={side}
                      keptLabel={kept.name}
                      otherLabel={candidate.list}
                      choices={chosen}
                      onChange={(next) => setChoices({ id: kept.id, choices: next })}
                      without={["description"]}
                      confirmed={kept.confirmed}
                    />
                    <mergeForm.Subscribe selector={(state) => state.values.language}>
                      {(written) => (
                        <mergeForm.AppField name="text">
                          {(field) => (
                            <field.Textarea
                              label={m.catalogue_description()}
                              description={m.catalogue_description_own()}
                              rows={4}
                              lang={written}
                            />
                          )}
                        </mergeForm.AppField>
                      )}
                    </mergeForm.Subscribe>
                    <mergeForm.AppField name="language">
                      {(field) => (
                        <field.Control<DescriptionLanguage>>
                          {(control) => (
                            <ToggleGroup
                              size="sm"
                              variant="outline"
                              aria-label={m.catalogue_description_language()}
                              value={[control.value]}
                              onValueChange={(picked) => {
                                // A language is always chosen: pressing the one chosen keeps it.
                                const [next] = picked as DescriptionLanguage[];
                                if (next) control.onChange(next);
                              }}
                            >
                              <ToggleGroupItem value="fr">
                                {m.catalogue_language_fr()}
                              </ToggleGroupItem>
                              <ToggleGroupItem value="en">
                                {m.catalogue_language_en()}
                              </ToggleGroupItem>
                            </ToggleGroup>
                          )}
                        </field.Control>
                      )}
                    </mergeForm.AppField>
                  </div>
                ) : (
                  <p className="text-neutral-7">{m.catalogue_merge_pick()}</p>
                )}
                <DecisionBar
                  accept={
                    <mergeForm.SubmitButton
                      isPending={decide.isPending && decide.variables === "merge"}
                      disabled={!canMerge}
                    >
                      {m.catalogue_merge()}
                      <ShortcutKeys
                        hotkey={bindings["candidate-accept"]}
                        className="max-md:hidden"
                      />
                    </mergeForm.SubmitButton>
                  }
                  {...barProps}
                />
              </mergeForm.Form>
            </mergeForm.AppForm>
          )}
        </section>
      ) : (
        <section className="grid gap-xs">
          <p>
            {STATES[candidate.status]()}
            {candidate.decidedAt && (
              <span className="text-neutral-7"> · {formatDayAndHour(candidate.decidedAt)}</span>
            )}
          </p>
          {candidate.note && <p className="text-neutral-7">{candidate.note}</p>}
          {decidedBreak && (
            <Link
              to="/catalogue"
              search={{ break: decidedBreak }}
              className="focus-ring w-fit rounded-xs underline underline-offset-2"
            >
              {m.catalogue_open_break()}
            </Link>
          )}
          {candidate.status === "ignored" && (
            <div>
              <Button variant="outline" onClick={() => decide.mutate("reopen")}>
                {m.catalogue_reopen()}
              </Button>
            </div>
          )}
        </section>
      )}

      <Dialog open={ignoring} onOpenChange={setIgnoring}>
        <DialogPopup className="w-full max-w-md gap-l p-l">
          <DialogTitle>{m.catalogue_ignore_title({ name: candidate.name })}</DialogTitle>
          <ignoreForm.AppForm>
            <ignoreForm.Form className="grid gap-l">
              <ignoreForm.AppField name="note">
                {(field) => <field.Textarea label={m.catalogue_ignore_note()} rows={3} />}
              </ignoreForm.AppField>
              <div className="flex justify-end gap-xs">
                <Button type="button" variant="ghost" onClick={() => setIgnoring(false)}>
                  {m.cancel()}
                </Button>
                <ignoreForm.SubmitButton
                  isPending={decide.isPending && decide.variables === "ignore"}
                >
                  {m.catalogue_ignore()}
                </ignoreForm.SubmitButton>
              </div>
            </ignoreForm.Form>
          </ignoreForm.AppForm>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
