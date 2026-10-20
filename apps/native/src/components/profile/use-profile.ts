import { DENSITY_OF_READING } from "@repo/client/density";
import type { ProfileAnswers, SurferProfile } from "@repo/client/viewer/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import { useSaveDensity } from "@/components/account/kept-settings";
import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

import { isTabPath } from "./profiling";

/**
 * What the account said of itself as a surfer, and what keeps or puts off its answers: decision
 * 063. `profile` is null for an account that was never asked, and undefined while the API has
 * not said or for a visitor.
 */
export function useProfile() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const saveDensity = useSaveDensity();
  const read = useQuery(
    orpc.v1.profile.get.queryOptions({
      enabled: signedIn,
      // An API from before the profile answers with an error: nothing is then asked.
      retry: false,
    }),
  );
  const keep = (data: SurferProfile) =>
    queryClient.setQueryData(orpc.v1.profile.get.queryKey(), data);
  const save = useMutation(orpc.v1.profile.save.mutationOptions({ onSuccess: keep }));
  const putOff = useMutation(orpc.v1.profile.putOff.mutationOptions({ onSuccess: keep }));
  const profile = signedIn && read.isSuccess ? read.data : undefined;

  return {
    profile,
    isPending: signedIn && read.isPending,
    isError: read.isError,
    retry: () => void read.refetch(),
    isRefetching: read.isRefetching,
    isSaving: save.isPending,
    /** Keeps every answer at once, and says whether they were kept. */
    onSave: async (answers: ProfileAnswers) => {
      const before = profile?.reading ?? null;
      try {
        await save.mutateAsync(answers);
      } catch {
        return false;
      }
      // What the surfer reads of a forecast sets how much a panel shows, when it changes.
      if (answers.reading && answers.reading !== before)
        saveDensity(DENSITY_OF_READING[answers.reading]);
      return true;
    },
    /** Leaves the questions without answering: they are not asked again. */
    onPutOff: () => putOff.mutate(undefined),
  };
}

/**
 * Opens the questions once, as the web asks them: to an account that was never asked, after its
 * first sign-in or at its next visit, once nothing stands over the tabs. Decision 063.
 */
export function useOnboardingOnce() {
  const { signedIn, userId } = useAccount();
  const path = usePathname();
  const read = useQuery(orpc.v1.profile.get.queryOptions({ enabled: signedIn, retry: false }));
  // The account it was opened for in this run of the app, so that it opens once.
  const opened = useRef<string | undefined>(undefined);
  const free = isTabPath(path);

  useEffect(() => {
    if (!signedIn || !userId || !free || !read.isSuccess || read.data !== null) return;
    if (opened.current === userId) return;
    opened.current = userId;
    router.push("/onboarding");
  }, [signedIn, userId, free, read.isSuccess, read.data]);
}
