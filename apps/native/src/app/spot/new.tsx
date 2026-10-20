import { NewSpotScreen } from "@/components/map/new-spot-screen";

/**
 * Adds a spot of the account's own, by putting its marker on a map and naming it (decision 006),
 * `/spot/new?latitude=&longitude=` when a press held on the map gave the point.
 */
export default function Screen() {
  return <NewSpotScreen />;
}
