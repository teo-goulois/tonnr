import { describe, expect, it } from "vitest";

import { LEGEND_SWITCH_HEIGHT, switchFit } from "./switch-fit";

describe("a switch of the legend", () => {
  it("is drawn as tall as the web's, whatever the platform's size", () => {
    for (const natural of [
      { width: 63, height: 28 },
      { width: 51, height: 31 },
    ]) {
      const fit = switchFit(natural);
      expect(natural.height * fit.scale).toBeCloseTo(LEGEND_SWITCH_HEIGHT);
      // What its layout keeps is what is drawn: its size less the margins on both sides.
      expect(natural.height + 2 * fit.marginVertical).toBeCloseTo(LEGEND_SWITCH_HEIGHT);
      expect(natural.width + 2 * fit.marginHorizontal).toBeCloseTo(fit.width);
    }
  });

  it("keeps the aspect of the platform's switch", () => {
    const fit = switchFit({ width: 63, height: 28 });
    expect(fit.width / LEGEND_SWITCH_HEIGHT).toBeCloseTo(63 / 28);
  });

  it("is left as it is while it has no height yet", () => {
    expect(switchFit({ width: 0, height: 0 })).toMatchObject({ scale: 1 });
  });
});
