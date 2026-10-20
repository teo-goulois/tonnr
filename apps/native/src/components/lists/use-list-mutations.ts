import type { SavedList } from "@repo/client/viewer/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTell } from "@/components/ui/toast";
import { orpc } from "@/utils/orpc";

import type { PlaceRef } from "@/components/saved/sea-now";

import { holds } from "./items";

// What changes the account's lists, as the web's route does (apps/web/src/routes/app/index.tsx):
// each change answers with the list as it is then, which takes its place in `lists.list`, and a
// list that is read alone, `lists.view`, is read again. What failed is told, and the lists are
// read again so that the screen shows what the API holds. Decision 017 and 035.

type ListsAnswer = Awaited<ReturnType<typeof orpc.v1.lists.list.call>>;

export function useListMutations() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const listsKey = orpc.v1.lists.list.queryKey();

  const setLists = (update: (lists: SavedList[]) => SavedList[]) =>
    queryClient.setQueryData<ListsAnswer>(listsKey, (answer) =>
      answer ? { ...answer, lists: update(answer.lists) } : answer,
    );
  const replaceList = (list: SavedList) => {
    setLists((all) =>
      all.some((other) => other.id === list.id)
        ? all.map((other) => (other.id === list.id ? list : other))
        : [...all, list],
    );
    void queryClient.invalidateQueries({
      queryKey: orpc.v1.lists.view.queryKey({ input: { id: list.id } }),
    });
  };
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: orpc.v1.lists.key() });
  const failed = (error: Error) => {
    tell({ title: error.message, tone: "danger" });
    void refreshLists();
  };
  const changing = { onSuccess: replaceList, onError: failed };

  const addStation = useMutation(orpc.v1.lists.addStation.mutationOptions(changing));
  const removeStation = useMutation(orpc.v1.lists.removeStation.mutationOptions(changing));
  const addBreak = useMutation(orpc.v1.lists.addBreak.mutationOptions(changing));
  const removeBreak = useMutation(orpc.v1.lists.removeBreak.mutationOptions(changing));
  const addSpot = useMutation(orpc.v1.lists.addSpot.mutationOptions(changing));
  const removeSpot = useMutation(orpc.v1.lists.removeSpot.mutationOptions(changing));

  const create = useMutation(
    orpc.v1.lists.create.mutationOptions({
      onSuccess: (list) => setLists((all) => [...all, list]),
      onError: (error) => tell({ title: error.message, tone: "danger" }),
    }),
  );
  const rename = useMutation(orpc.v1.lists.update.mutationOptions(changing));
  const remove = useMutation(
    orpc.v1.lists.delete.mutationOptions({
      onSuccess: ({ id }) => {
        setLists((all) => all.filter((list) => list.id !== id));
        queryClient.removeQueries({ queryKey: orpc.v1.lists.view.queryKey({ input: { id } }) });
      },
      onError: failed,
    }),
  );

  const share = useMutation(orpc.v1.lists.share.mutationOptions(changing));
  const renewShare = useMutation(orpc.v1.lists.renewShare.mutationOptions(changing));
  const unshare = useMutation(orpc.v1.lists.unshare.mutationOptions(changing));

  // Whether the reports at a list's breaks are told to the account: decision 068.
  const reports = useMutation(
    orpc.v1.lists.reports.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.v1.lists.key() }),
      onError: failed,
    }),
  );
  const leave = useMutation(
    orpc.v1.lists.leave.mutationOptions({
      onSuccess: () => refreshLists(),
      onError: failed,
    }),
  );

  /** Puts a place in one of the account's lists, and answers the list as it is then. */
  const addPlace = (listId: string, place: PlaceRef) => {
    if (place.kind === "station")
      return addStation.mutateAsync({ id: listId, stationId: place.id });
    if (place.kind === "break") return addBreak.mutateAsync({ id: listId, breakId: place.id });
    return addSpot.mutateAsync({ id: listId, spotId: place.id });
  };
  /** Takes a place out of one of the account's lists. A spot itself stays. */
  const removePlace = (listId: string, place: PlaceRef) => {
    if (place.kind === "station") {
      return removeStation.mutateAsync({ id: listId, stationId: place.id });
    }
    if (place.kind === "break") return removeBreak.mutateAsync({ id: listId, breakId: place.id });
    return removeSpot.mutateAsync({ id: listId, spotId: place.id });
  };

  /** Whether one of the account's lists holds a place, as the lists last read say. */
  const holdsPlace = (listId: string, place: PlaceRef) => {
    const list = queryClient
      .getQueryData<ListsAnswer>(listsKey)
      ?.lists.find((other) => other.id === listId);
    return list !== undefined && holds(list, place);
  };

  return {
    addPlace,
    removePlace,
    holdsPlace,
    create,
    rename,
    remove,
    share,
    renewShare,
    unshare,
    reports,
    leave,
    /** Whether something of the sharing is being asked: nothing is asked twice. */
    isSharing: share.isPending || renewShare.isPending || unshare.isPending,
    refreshLists,
  };
}
