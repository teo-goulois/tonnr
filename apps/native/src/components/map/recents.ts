import { RECENTS_KEY, type Recent, readRecents } from "@repo/client/recents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

// What the reader looked at last, as the map names it from afar and the search offers it before
// a key is pressed: decision 042. An account's are the account's, which every device reads; a
// visitor's are the phone's, kept under the browser's key. What opens a place's sheet says that it
// was looked at; this reads what was said, again each time the screen comes back into view.

function keptOnPhone(): Recent[] {
  try {
    return readRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "null"));
  } catch {
    return [];
  }
}

/** What the reader looked at last, the last first, and what forgets it. */
export function useRecentPlaces() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const [onPhone, setOnPhone] = useState(keptOnPhone);
  useFocusEffect(useCallback(() => setOnPhone(keptOnPhone()), []));
  const kept = useQuery(
    orpc.v1.preferences.getRecents.queryOptions({
      enabled: signedIn,
      // An API from before the recent views answers with an error: the phone's own then stand.
      retry: false,
    }),
  );
  const clear = useMutation(
    orpc.v1.preferences.clearRecents.mutationOptions({
      onSuccess: (answer) =>
        queryClient.setQueryData(orpc.v1.preferences.getRecents.queryKey(), answer),
    }),
  );

  return {
    recents: (signedIn && kept.data ? kept.data : onPhone) as Recent[],
    onClear: () => {
      try {
        localStorage.removeItem(RECENTS_KEY);
      } catch {
        // A phone that keeps nothing kept none.
      }
      setOnPhone([]);
      if (signedIn) {
        void queryClient.cancelQueries({ queryKey: orpc.v1.preferences.getRecents.queryKey() });
        clear.mutate(undefined);
      }
    },
  };
}
