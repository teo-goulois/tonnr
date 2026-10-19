import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

import { useUsername } from "@/components/account/username";
import { useAuthPrompt } from "@/components/auth/auth-prompt";
import type { GuideLineName, Guiding } from "@/components/guides/types";
import { isTextLine } from "@/components/guides/guide-words";
import type { Guide, GuideOwn, Loadable, Standing } from "@/components/viewer/types";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

// How often a guide is read again while its reader has something waiting on it.
const WAITING_MS = 30 * 1000;

// What a refusal of the API says to whoever wrote, in their language. The API's own words are
// English.
function refusalOf(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "CONFLICT") return m.guide_same();
  if (code === "FORBIDDEN") return m.guide_full();
  if (code === "TOO_MANY_REQUESTS") return m.guide_too_many();
  return m.guide_failed();
}

/**
 * What the signed-in account wrote in the guides, and where it stands: its score and its rank.
 * It is asked for where it shows, in the account's panel. `account` is the id of the account
 * that is signed in: an answer is kept under it, since a session can become another account's
 * in another tab, and what was kept for the first is not the second's.
 */
export function useStanding({
  account,
  isShown,
}: {
  account: string | undefined;
  isShown: boolean;
}) {
  const asked = useQuery(
    orpc.v1.contributions.mine.queryOptions({
      queryKey: [...orpc.v1.contributions.mine.queryKey(), account],
      enabled: account !== undefined && isShown,
      meta: { quiet: true },
    }),
  );
  const standing: Loadable<Standing> = {
    data: account === undefined ? undefined : asked.data,
    isPending: asked.isLoading,
    isError: asked.isError,
  };
  return standing;
}

/**
 * The guide of the break in view, what the signed-in account wrote of it, and what the screen
 * does with both: decision 041. The guide is asked for when a break is selected, in the
 * language the page is read in. `account` is the id of the account that is signed in: what it
 * wrote, and what it typed and did not send, are kept under it and are no other account's.
 */
export function useGuiding({
  breakId,
  account,
  onBlock,
}: {
  breakId: string | undefined;
  account: string | undefined;
  // Asks whether to block the author of a line: decision 071.
  onBlock: (username: string) => void;
}) {
  const signedIn = account !== undefined;
  const queryClient = useQueryClient();
  const promptAuth = useAuthPrompt();
  const saveUsername = useUsername();

  const ownInput = { breakId: breakId ?? "" };
  const ownOptions = orpc.v1.guides.mine.queryOptions({
    input: ownInput,
    queryKey: [...orpc.v1.guides.mine.queryKey({ input: ownInput }), account],
    meta: { quiet: true },
  });
  const own = useQuery({
    ...ownOptions,
    enabled: signedIn && breakId !== undefined,
    // While the reader has something waiting here and the panel is open, what became of it is
    // asked about again now and then: they see it confirmed without leaving.
    refetchInterval: (query) => ((query.state.data?.waiting.length ?? 0) > 0 ? WAITING_MS : false),
  });
  const isWaiting = signedIn && (own.data?.waiting.length ?? 0) > 0;
  const guide = useQuery(
    orpc.v1.guides.get.queryOptions({
      input: { breakId: breakId ?? "", language: getLocale() },
      enabled: breakId !== undefined,
      refetchInterval: isWaiting ? WAITING_MS : false,
      meta: { quiet: true },
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
  const failed = useCallback(
    (error: unknown) => {
      toast.error(refusalOf(error));
      // The page held an older answer: the guide is read again.
      void changed();
    },
    [changed],
  );

  const propose = useMutation(orpc.v1.contributions.propose.mutationOptions({ onError: failed }));
  const withdraw = useMutation(
    orpc.v1.contributions.withdraw.mutationOptions({
      onSuccess: () => {
        toast.success(m.guide_withdrawn());
        return changed();
      },
      onError: failed,
    }),
  );
  // What is said of a contribution is refused for other reasons than a line is: the guide the
  // page held was older than the API's, and is read again.
  const stale = useCallback(() => {
    toast.error(m.guide_failed());
    void changed();
  }, [changed]);
  const confirm = useMutation(
    orpc.v1.contributions.confirm.mutationOptions({
      onSuccess: () => {
        toast.success(m.guide_confirm_done());
        return changed();
      },
      onError: stale,
    }),
  );
  const contest = useMutation(
    orpc.v1.contributions.contest.mutationOptions({
      onError: (error) => {
        const code = (error as { code?: unknown }).code;
        toast.error(
          code === "CONFLICT"
            ? m.guide_contest_refused()
            : code === "TOO_MANY_REQUESTS"
              ? m.guide_too_many()
              : m.guide_failed(),
        );
        void changed();
      },
    }),
  );
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
      onError: () => toast.error(m.guide_failed()),
    }),
  );

  // What was typed for a line and not sent, by break and line: kept while the app is open.
  const drafts = useRef(new Map<string, string>());
  const draftKey = useCallback(
    (line: GuideLineName) => `${account}:${breakId}:${line}`,
    [account, breakId],
  );

  const isSending =
    propose.isPending || withdraw.isPending || confirm.isPending || contest.isPending;
  const { mutate: sendProposal } = propose;
  const { mutate: sendWithdrawal } = withdraw;
  const { mutate: sendConfirmation } = confirm;
  const { mutate: sendContest } = contest;
  const { mutate: sendAnswer } = answer;

  const guiding: Guiding = useMemo(
    () => ({
      signedIn,
      isSending,
      draftOf: (line) => drafts.current.get(draftKey(line)),
      onDraft: (line, text) => {
        if (text === undefined) drafts.current.delete(draftKey(line));
        else drafts.current.set(draftKey(line), text);
      },
      onSignIn: (reason) => promptAuth({ mode: "sign-up", reason }),
      onUsernameSave: async (username) => {
        const refusal = await saveUsername(username);
        if (!refusal) await queryClient.invalidateQueries({ queryKey: orpc.v1.guides.mine.key() });
        return refusal;
      },
      onPropose: (line, value, done) => {
        if (breakId === undefined) return;
        sendProposal(
          {
            breakId,
            line,
            value,
            agreed: true,
            // A text is written in the language the page is read in.
            ...(isTextLine(line) && { language: getLocale() }),
          },
          {
            onSuccess: (written) => {
              toast.success(
                written.status === "shown" ? m.guide_sent_shown() : m.guide_sent_waiting(),
              );
              done();
              return changed();
            },
          },
        );
      },
      onWithdraw: (id) => sendWithdrawal({ id }),
      onConfirm: (id) => sendConfirmation({ id }),
      onContest: (id, reason, done) =>
        sendContest(
          { id, reason },
          {
            onSuccess: () => {
              toast.success(m.guide_contested());
              done();
              return changed();
            },
          },
        ),
      onAnswer: (question, given) => {
        if (breakId !== undefined) sendAnswer({ breakId, question, answer: given });
      },
      onBlock,
    }),
    [
      signedIn,
      isSending,
      draftKey,
      promptAuth,
      saveUsername,
      queryClient,
      breakId,
      sendProposal,
      sendWithdrawal,
      sendConfirmation,
      sendContest,
      sendAnswer,
      changed,
      onBlock,
    ],
  );

  const loaded: Loadable<Guide> = {
    data: guide.data,
    isPending: guide.isLoading,
    isError: guide.isError,
  };
  return { guide: loaded, own: signedIn ? own.data : undefined, guiding };
}
