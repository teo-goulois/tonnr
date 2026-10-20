import type { SavedItem, SavedList } from "@repo/client/viewer/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { FAVORITES, holds, withAnswered, withSaved } from "./lists";

// The account's lists, as the bookmark of a place reads and changes them: the list changes on the
// screen at once, then the API confirms it, and a list the API refused is asked for again. The
// web's route does the same (`save` in `apps/web/src/routes/app/index.tsx`). Decision 017.

export function useLists() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const tell = useTell();
  const key = orpc.v1.lists.list.queryKey();
  const lists = useQuery(
    orpc.v1.lists.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.lists,
      meta: { quiet: true },
    }),
  );

  const setLists = (update: (lists: SavedList[]) => SavedList[]) =>
    queryClient.setQueryData(key, (answer) => ({
      lists: update(answer?.lists ?? []),
      joined: answer?.joined ?? [],
    }));
  const answered = {
    onSuccess: (list: SavedList) => setLists((all) => withAnswered(all, list)),
    onError: (error: Error) => {
      tell({ title: error.message, tone: "danger" });
      void queryClient.invalidateQueries({ queryKey: key });
    },
  };
  const addStation = useMutation(orpc.v1.lists.addStation.mutationOptions(answered));
  const removeStation = useMutation(orpc.v1.lists.removeStation.mutationOptions(answered));
  const addBreak = useMutation(orpc.v1.lists.addBreak.mutationOptions(answered));
  const removeBreak = useMutation(orpc.v1.lists.removeBreak.mutationOptions(answered));
  const addSpot = useMutation(orpc.v1.lists.addSpot.mutationOptions(answered));
  const removeSpot = useMutation(orpc.v1.lists.removeSpot.mutationOptions(answered));
  const create = useMutation(
    orpc.v1.lists.create.mutationOptions({
      onSuccess: (list) => setLists((all) => [...all, list]),
      onError: (error) => tell({ title: error.message, tone: "danger" }),
    }),
  );

  /** Adds a place to a list, or takes it out, at once: the switch that asks it plays its touch. */
  function save(listId: string, item: SavedItem, add: boolean) {
    // An answer on its way would bring back the lists as they were.
    void queryClient.cancelQueries({ queryKey: key });
    setLists((all) => withSaved(all, listId, item, add));
    if ("spotId" in item) {
      (add ? addSpot : removeSpot).mutate({ id: listId, spotId: item.spotId });
    } else if ("breakId" in item) {
      (add ? addBreak : removeBreak).mutate({ id: listId, breakId: item.breakId });
    } else {
      (add ? addStation : removeStation).mutate({ id: listId, stationId: item.stationId });
    }
    if (listId === FAVORITES && add) tell({ title: m.saved_added_to_favorites(), tone: "success" });
  }

  return {
    lists,
    isSaved: (item: SavedItem) => lists.data?.some((list) => holds(list, item)) ?? false,
    save,
    /** Makes a list by that name, with the place in it from the start. */
    createWith: (name: string, item: SavedItem, done: () => void) =>
      create.mutate(
        { name },
        {
          onSuccess: (list) => {
            save(list.id, item, true);
            done();
          },
        },
      ),
    isCreating: create.isPending,
  };
}
