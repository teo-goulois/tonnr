import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { type Recent, clearRecents, setRecents, useRecents, viewRecent } from "@/lib/recents";
import { orpc } from "@/utils/orpc";

type Asked = {
  // Who is signed in. Undefined for a visitor, whose browser alone keeps what they looked at.
  account: string | undefined;
  // False until it is known whether someone is signed in: nothing is kept before.
  isReady: boolean;
  // What is open, once its name and its place are known.
  viewed: Recent | undefined;
};

/**
 * What the reader looked at last, and what keeps it: the account when there is one, which every
 * device then reads, and the browser, which a page opens with. Decision 042.
 */
export function useRecentViews({ account, isReady, viewed }: Asked) {
  const recents = useRecents();
  const queryClient = useQueryClient();
  const key = orpc.preferences.getRecents.queryKey();
  const kept = useQuery(
    orpc.preferences.getRecents.queryOptions({
      enabled: account !== undefined,
      // An API from before the recent views answers with an error: the browser's own then stand.
      retry: false,
      meta: { quiet: true },
    }),
  );
  // What the account holds is what every screen shows.
  useEffect(() => {
    if (kept.data) setRecents(kept.data);
  }, [kept.data]);

  const keep = (data: Awaited<ReturnType<typeof orpc.preferences.getRecents.call>>) =>
    queryClient.setQueryData(key, data);
  const save = useMutation(orpc.preferences.saveRecent.mutationOptions({ onSuccess: keep }));
  const clear = useMutation(orpc.preferences.clearRecents.mutationOptions({ onSuccess: keep }));
  const saveView = save.mutate;

  // A view is said once, when what is open changes or when another account reads it.
  const said = useRef<string>(undefined);
  const kind = viewed?.kind;
  const id = viewed?.id;
  useEffect(() => {
    if (!isReady || !viewed) return;
    const saying = `${account ?? ""} ${viewed.kind} ${viewed.id}`;
    if (said.current === saying) return;
    said.current = saying;
    // The list changes on the screen at once, then the account confirms it.
    viewRecent(viewed);
    if (account === undefined) return;
    // An answer on its way would bring back the list as it was.
    void queryClient.cancelQueries({ queryKey: key });
    saveView({ kind: viewed.kind, id: viewed.id });
    // What is open is known by its kind and its id: its name coming again says nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, account, kind, id]);

  return {
    recents,
    onClear: () => {
      clearRecents();
      if (account === undefined) return;
      void queryClient.cancelQueries({ queryKey: key });
      clear.mutate(undefined);
    },
  };
}
