import { describe, expect, it } from "vitest";

import { arrowFeatures } from "./sea-arrows";

describe("the arrows on the sea", () => {
  it("are turned the way the waves go", () => {
    const features = arrowFeatures([{ longitude: -4, latitude: 47, fromDegrees: 270 }]);
    expect(features.features[0]?.properties).toEqual({ rotate: 90 });
  });
});
