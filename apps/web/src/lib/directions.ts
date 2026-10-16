/** A place a map app is asked to show, or to lead to. */
export type Destination = { latitude: number; longitude: number };

/** The map apps that lead to a place, in the order they are offered. */
export const DIRECTIONS_APPS = ["apple", "google", "waze"] as const;
export type DirectionsApp = (typeof DIRECTIONS_APPS)[number];

// Six decimals place a point within a decimeter: more says nothing.
const at = ({ latitude, longitude }: Destination) =>
  `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

/**
 * The way to a place in a map app. Each is a web address that the app answers when it is
 * installed, and its site when it is not, so a link never leads nowhere.
 */
export function directionsUrl(app: DirectionsApp, place: Destination) {
  switch (app) {
    case "apple":
      return `https://maps.apple.com/?${new URLSearchParams({ daddr: at(place) })}`;
    case "google":
      return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: at(place) })}`;
    case "waze":
      return `https://waze.com/ul?${new URLSearchParams({ ll: at(place), navigate: "yes" })}`;
  }
}
