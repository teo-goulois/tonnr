import { DENSITY_OF_READING } from "@repo/client/density";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useSaveDensity } from "@/components/shared/density-account";
import type { Profiling, SurferProfile } from "@/components/viewer/types";
import { orpc } from "@/utils/orpc";

/**
 * What the account said of itself as a surfer: the questions it is asked once, as it comes, and
 * the answers it changes in its panel. `isFree` says that nothing else stands over the map, so
 * that the questions wait for a link's dialog to close. Decision 063.
 */
export function useProfile({
  account,
  isFree,
}: {
  account: string | undefined;
  isFree: boolean;
}): Profiling {
  const queryClient = useQueryClient();
  const saveDensity = useSaveDensity();
  const read = useQuery(
    orpc.v1.profile.get.queryOptions({
      enabled: account !== undefined,
      // An API from before the profile answers with an error: nothing is then asked.
      retry: false,
      meta: { quiet: true },
    }),
  );
  // Left in this page, so that a refusal of the API does not ask again at once.
  const [isLeft, setLeft] = useState(false);
  const keep = (data: SurferProfile) =>
    queryClient.setQueryData(orpc.v1.profile.get.queryKey(), data);
  const save = useMutation(orpc.v1.profile.save.mutationOptions({ onSuccess: keep }));
  const putOff = useMutation(orpc.v1.profile.putOff.mutationOptions({ onSuccess: keep }));

  const profile = account === undefined ? undefined : read.isSuccess ? read.data : undefined;

  return {
    profile,
    isAsking: profile === null && isFree && !isLeft,
    isSaving: save.isPending,
    onSave: async (answers) => {
      const before = profile?.reading ?? null;
      try {
        await save.mutateAsync(answers);
      } catch {
        return false;
      }
      setLeft(true);
      // What the surfer reads of a forecast sets how much a panel shows, when it changes.
      if (answers.reading && answers.reading !== before)
        saveDensity(DENSITY_OF_READING[answers.reading]);
      return true;
    },
    onPutOff: () => {
      setLeft(true);
      putOff.mutate(undefined);
    },
  };
}
