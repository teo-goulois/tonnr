import { describe, expect, it } from "vitest";

import { directionsUrl } from "./directions";

const place = { latitude: 48.5634, longitude: -4.6612 };

describe("directionsUrl", () => {
  it("asks each app for the way to the place", () => {
    expect(directionsUrl("apple", place)).toBe(
      "https://maps.apple.com/?daddr=48.563400%2C-4.661200",
    );
    expect(directionsUrl("google", place)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=48.563400%2C-4.661200",
    );
    expect(directionsUrl("waze", place)).toBe(
      "https://waze.com/ul?ll=48.563400%2C-4.661200&navigate=yes",
    );
  });
});
