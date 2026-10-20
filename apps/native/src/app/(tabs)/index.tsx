import { Invitation } from "@/components/friends/invite-sheet";
import { MapScreen } from "@/components/map/map-screen";

/** The map: the sea, its buoys, the surf breaks and the account's own spots (decisions 018, 040 and 069). */
export default function Screen() {
  return (
    <>
      <MapScreen />
      <Invitation />
    </>
  );
}
