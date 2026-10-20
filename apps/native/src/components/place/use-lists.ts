import type { SavedList } from "@repo/client/viewer/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { holds } from "@/components/lists/items";
import { useListMutations } from "@/components/lists/use-list-mutations";
import type { PlaceRef } from "@/components/saved/sea-now";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { FAVORITES, withAnswered, withSaved } from "./lists";

// The account's lists, as the bookmark of a place reads and changes them: the list changes on the
// screen at once, then the API confirms it through the lists' own mutations, which also read again
// a list read alone, and a list the API refused is asked for again. The web's route does the same
// (`save` in `apps/web/src/routes/app/index.tsx`). Decision 017.

export function useLists() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const tell = useTell();
  const mutations = useListMutations();
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

  /** Adds a place to a list, or takes it out, at once: the row that asks it plays its touch. */
  function save(listId: string, place: PlaceRef, add: boolean) {
    // An answer on its way would bring back the lists as they were.
    void queryClient.cancelQueries({ queryKey: key });
    setLists((all) => withSaved(all, listId, place, add));
    // What failed is told, and the lists read again, by the mutations themselves.
    (add ? mutations.addPlace : mutations.removePlace)(listId, place).then(
      (list) => setLists((all) => withAnswered(all, list)),
      () => {},
    );
    if (listId === FAVORITES && add) tell({ title: m.saved_added_to_favorites(), tone: "success" });
  }

  return {
    lists,
    isSaved: (place: PlaceRef) => lists.data?.some((list) => holds(list, place)) ?? false,
    save,
    /** Makes a list by that name, with the place in it from the start. */
    createWith: (name: string, place: PlaceRef, done: () => void) =>
      mutations.create.mutate(
        { name },
        {
          onSuccess: (list) => {
            save(list.id, place, true);
            done();
          },
        },
      ),
    isCreating: mutations.create.isPending,
  };
}
