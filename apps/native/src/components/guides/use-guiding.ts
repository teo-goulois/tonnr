import type { GuideLineName, GuideQuestion } from "@repo/client/guides/types";
import type { GuideOwn } from "@repo/client/viewer/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

import { isTextLine } from "./guide-words";

// The guide of a surf break, what the signed-in account wrote of it, and what the screen does with
// both, as the web's `useGuiding` (`apps/web/src/routes/app/-guiding.ts`) answers them: decision
// 041. The guide is asked for when its tab shows, in the language the app is set to. What the
// account wrote, and what it typed and did not send, are kept under its id and are no other
// account's.

// How often a guide is read again while its reader has something waiting on it.
const WAITING_MS = 30 * 1000;

// What was typed for a line and not sent, by account, break and line: kept while the app is
// open, whichever sheet closes in between.
const drafts = new Map<string, string>();

/** Why the API refused a line, in the reader's language. Its own words are English. */
export function refusalOf(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "CONFLICT") return m.guide_same();
  if (code === "FORBIDDEN") return m.guide_full();
  if (code === "TOO_MANY_REQUESTS") return m.guide_too_many();
  return m.guide_failed();
}

/** Why the API refused a contest, in the reader's language. */
function contestRefusalOf(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "CONFLICT") return m.guide_contest_refused();
  if (code === "TOO_MANY_REQUESTS") return m.guide_too_many();
  return m.guide_failed();
}

/** What a sheet hears once what it sent was taken, or why not. */
export type Outcome = { done: () => void; failed: (why: string) => void };

export type GuideActions = {
  signedIn: boolean;
  // True while a line, or what is said of a contribution, is on its way.
  isSending: boolean;
  draftOf: (line: GuideLineName) => string | undefined;
  onDraft: (line: GuideLineName, text: string | undefined) => void;
  onPropose: (line: GuideLineName, value: string[] | string, outcome: Outcome) => void;
  onWithdraw: (contributionId: string) => void;
  onConfirm: (contributionId: string) => void;
  onContest: (contributionId: string, reason: string, outcome: Outcome) => void;
  onAnswer: (question: GuideQuestion, answer: string | null) => void;
};

export function useGuiding(breakId: string | undefined) {
  const { userId } = useAccount();
  const signedIn = userId !== undefined;
  const queryClient = useQueryClient();
  const tell = useTell();

  const ownInput = { breakId: breakId ?? "" };
  const ownOptions = orpc.v1.guides.mine.queryOptions({
    input: ownInput,
    queryKey: [...orpc.v1.guides.mine.queryKey({ input: ownInput }), userId],
  });
  const own = useQuery({
    ...ownOptions,
    enabled: signedIn && breakId !== undefined,
    // While the reader has something waiting here, what became of it is asked about again now
    // and then: they see it confirmed without leaving.
    refetchInterval: (query) => ((query.state.data?.waiting.length ?? 0) > 0 ? WAITING_MS : false),
  });
  const isWaiting = signedIn && (own.data?.waiting.length ?? 0) > 0;
  const guide = useQuery(
    orpc.v1.guides.get.queryOptions({
      input: { breakId: breakId ?? "", language: getLocale() },
      enabled: breakId !== undefined,
      refetchInterval: isWaiting ? WAITING_MS : false,
    }),
  );

  // What changed in a guide changes what is read of it, and where its author stands.
  const changed = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.v1.guides.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.v1.contributions.key() }),
        // A list of words that was confirmed is what the break says.
        queryClient.invalidateQueries({ queryKey: orpc.v1.breaks.get.key() }),
      ]),
    [queryClient],
  );
  // The guide that was read was older than the API's: it is read again.
  const stale = useCallback(() => {
    tell({ title: m.guide_failed(), tone: "danger" });
    void changed();
  }, [changed, tell]);

  const propose = useMutation(orpc.v1.contributions.propose.mutationOptions());
  const withdraw = useMutation(
    orpc.v1.contributions.withdraw.mutationOptions({
      onSuccess: () => {
        tell({ title: m.guide_withdrawn(), tone: "success" });
        return changed();
      },
      onError: stale,
    }),
  );
  const confirm = useMutation(
    orpc.v1.contributions.confirm.mutationOptions({
      onSuccess: () => {
        tell({ title: m.guide_confirm_done(), tone: "success" });
        return changed();
      },
      onError: stale,
    }),
  );
  const contest = useMutation(orpc.v1.contributions.contest.mutationOptions());
  const answer = useMutation(
    orpc.v1.guides.answer.mutationOptions({
      // The answer shows where it was pressed before the API has said.
      onMutate: (sent) => {
        queryClient.setQueryData(ownOptions.queryKey, (known: GuideOwn | undefined) => {
          if (!known) return known;
          const answers = { ...known.answers };
          if (sent.answer === null) delete answers[sent.question];
          else answers[sent.question] = sent.answer;
          return { ...known, answers };
        });
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.v1.guides.key() }),
      onError: () => tell({ title: m.guide_failed(), tone: "danger" }),
    }),
  );

  const draftKey = (line: GuideLineName) => `${userId}:${breakId}:${line}`;

  const actions: GuideActions = {
    signedIn,
    isSending: propose.isPending || withdraw.isPending || confirm.isPending || contest.isPending,
    draftOf: (line) => drafts.get(draftKey(line)),
    onDraft: (line, text) => {
      if (text === undefined) drafts.delete(draftKey(line));
      else drafts.set(draftKey(line), text);
    },
    onPropose: (line, value, outcome) => {
      if (breakId === undefined) return;
      propose.mutate(
        {
          breakId,
          line,
          value,
          agreed: true,
          // A text is written in the language the app is set to.
          ...(isTextLine(line) && { language: getLocale() }),
        },
        {
          onSuccess: (written) => {
            outcome.done();
            tell({
              title: written.status === "shown" ? m.guide_sent_shown() : m.guide_sent_waiting(),
              tone: "success",
            });
            return changed();
          },
          onError: (error) => {
            outcome.failed(refusalOf(error));
            void changed();
          },
        },
      );
    },
    onWithdraw: (id) => withdraw.mutate({ id }),
    onConfirm: (id) => confirm.mutate({ id }),
    onContest: (id, reason, outcome) =>
      contest.mutate(
        { id, reason },
        {
          onSuccess: () => {
            outcome.done();
            tell({ title: m.guide_contested(), tone: "success" });
            return changed();
          },
          onError: (error) => {
            outcome.failed(contestRefusalOf(error));
            void changed();
          },
        },
      ),
    onAnswer: (question, given) => {
      if (breakId !== undefined) answer.mutate({ breakId, question, answer: given });
    },
  };

  return {
    guide,
    own: signedIn ? own.data : undefined,
    actions,
    // Reads the guide again, as a pull does.
    refresh: () => Promise.all([guide.refetch(), signedIn ? own.refetch() : undefined]),
  };
}
