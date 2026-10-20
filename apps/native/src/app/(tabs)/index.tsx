import { router, useLocalSearchParams } from "expo-router";

import { InviteSheet } from "@/components/friends/invite-sheet";
import { MapScreen } from "@/components/map/map-screen";

/** The map: the sea, its buoys, the surf breaks and the account's own spots (decisions 018, 040 and 069). */
export default function Screen() {
  // Someone's link, `?invite=`, says whose it is over the map (decision 041).
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  return (
    <>
      <MapScreen />
      {invite ? (
        <InviteSheet token={invite} onDone={() => router.setParams({ invite: undefined })} />
      ) : null}
    </>
  );
}
