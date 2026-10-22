import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { ShareSheet } from "@/components/lists/share-sheet";
import { useListMutations } from "@/components/lists/use-list-mutations";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { useTheme } from "@/lib/theme";
import { orpc } from "@/utils/orpc";

/**
 * What shares one of the account's lists, `/list/share?id=`, over the saved tab: the share button
 * of a list's heading opens it, and its panel's "Share this list" (decision 035). A list that is
 * no more closes it.
 */
export default function Screen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { space } = useTheme();
  const mutations = useListMutations();
  const lists = useQuery(orpc.v1.lists.list.queryOptions());
  const spots = useQuery(orpc.v1.spots.list.queryOptions());
  const list = lists.data?.lists.find((one) => one.id === id);
  const gone = lists.isSuccess && !list;

  useEffect(() => {
    if (gone) close();
  }, [gone]);

  if (!list) {
    return (
      <Loading>
        <View style={{ gap: space.l, padding: space.l }}>
          <SkeletonText lines={2} size="l" />
          <Skeleton height={44} />
        </View>
      </Loading>
    );
  }

  // The spots of the list that only their owner sees today, which its link will show.
  const privateSpots = list.spotIds.filter(
    (spotId) =>
      spots.data?.spots.find((spot) => spot.id === spotId)?.publication?.status !== "accepted",
  ).length;

  return (
    <ShareSheet list={list} privateSpots={privateSpots} mutations={mutations} onClose={close} />
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/saved");
}
