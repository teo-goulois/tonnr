import type { Spot } from "@repo/client/viewer/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTell } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// What the owner of a spot does with it from its sheet, as the web's route does it: rename it,
// move it, ask that it be made public or take the request back, delete it; and what makes a spot
// read in a shared list one of the reader's own. Each answer takes its place wherever the spot
// is kept. Decisions 006, 034 and 035.

export function useSpotActions() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const spotsKey = orpc.v1.spots.list.queryKey();
  const failed = (error: Error) => tell({ title: error.message, tone: "danger" });

  // The list on the screen changes at once. A request for it that was on its way would bring
  // back the list as it was: it is dropped, and the list is asked for again.
  const setSpots = async (update: (all: Spot[]) => Spot[]) => {
    await queryClient.cancelQueries({ queryKey: spotsKey });
    queryClient.setQueryData(spotsKey, (answer: { spots: Spot[] } | undefined) =>
      answer ? { spots: update(answer.spots) } : answer,
    );
    void queryClient.invalidateQueries({ queryKey: spotsKey });
  };
  const keep = (updated: Spot) => {
    queryClient.setQueryData(orpc.v1.spots.get.queryKey({ input: { id: updated.id } }), updated);
    void setSpots((all) => all.map((one) => (one.id === updated.id ? updated : one)));
  };

  const change = useMutation(
    orpc.v1.spots.update.mutationOptions({
      onSuccess: (updated) => {
        keep(updated);
        // A spot that moved has another sea: what an alert was tried at there is tried again.
        void queryClient.invalidateQueries({ queryKey: orpc.v1.alerts.preview.key() });
        tell({ title: m.spot_changed({ name: updated.name }), tone: "success" });
      },
      onError: failed,
    }),
  );
  const publish = useMutation(
    orpc.v1.spots.requestPublication.mutationOptions({
      onSuccess: (updated) => {
        keep(updated);
        tell({ title: m.spot_publish_sent(), tone: "success" });
      },
      onError: failed,
    }),
  );
  const cancelPublication = useMutation(
    orpc.v1.spots.cancelPublication.mutationOptions({
      onSuccess: (updated) => {
        keep(updated);
        tell({ title: m.spot_publish_cancelled(), tone: "success" });
      },
      onError: failed,
    }),
  );
  const remove = useMutation(
    orpc.v1.spots.delete.mutationOptions({
      onSuccess: ({ id }) => {
        void setSpots((all) => all.filter((one) => one.id !== id));
        // The spot left the lists it was in.
        queryClient.setQueryData(
          orpc.v1.lists.list.queryKey(),
          (answer) =>
            answer && {
              ...answer,
              lists: answer.lists.map((list) =>
                list.spotIds.includes(id)
                  ? { ...list, spotIds: list.spotIds.filter((other) => other !== id) }
                  : list,
              ),
            },
        );
        // What was kept of the spot alone goes too: its address would show it again.
        queryClient.removeQueries({ queryKey: orpc.v1.spots.get.queryKey({ input: { id } }) });
        void queryClient.invalidateQueries({ queryKey: orpc.v1.alerts.key() });
      },
      onError: failed,
    }),
  );
  const copy = useMutation(
    orpc.v1.spots.create.mutationOptions({
      onSuccess: (made) => {
        void setSpots((all) => [...all.filter((one) => one.id !== made.id), made]);
        tell({ title: m.spot_saved({ name: made.name }), tone: "success" });
      },
      onError: failed,
    }),
  );

  return {
    rename: (spot: Spot, name: string, done: () => void) =>
      change.mutate({ id: spot.id, name }, { onSuccess: done }),
    move: (spot: Spot, point: { latitude: number; longitude: number }, done: () => void) =>
      change.mutate({ id: spot.id, ...point }, { onSuccess: done }),
    isChanging: change.isPending,
    publish: (spot: Spot, note: string, done: () => void) =>
      publish.mutate({ id: spot.id, ...(note && { note }) }, { onSuccess: done }),
    isPublishing: publish.isPending || cancelPublication.isPending,
    cancelPublication: (spot: Spot, done: () => void) =>
      cancelPublication.mutate({ id: spot.id }, { onSuccess: done }),
    remove: (spot: Spot, done: () => void) =>
      remove.mutate(
        { id: spot.id },
        {
          onSuccess: () => {
            tell({ title: m.spot_deleted({ name: spot.name }), tone: "success" });
            done();
          },
        },
      ),
    isRemoving: remove.isPending,
    /** Makes a spot read in a shared list one of the reader's own, with what was said of it. */
    copy: (spot: Spot, done: (made: Spot) => void) => {
      const said = Object.fromEntries(
        Object.entries(spot.characteristics ?? {}).filter(([, value]) => value !== null),
      );
      copy.mutate(
        {
          name: spot.name,
          latitude: spot.latitude,
          longitude: spot.longitude,
          ...(Object.keys(said).length > 0 && { characteristics: said }),
        },
        { onSuccess: done },
      );
    },
    isCopying: copy.isPending,
  };
}
