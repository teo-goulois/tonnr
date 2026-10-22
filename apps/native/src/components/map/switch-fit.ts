// The legend's switches drawn as tall as the web's, whatever size the platform gives its own: an
// iPhone's was 51 by 31 points before iOS 26 and is 63 by 28 since, and Android's is another. The
// switch is measured as it is laid out, scaled to the web's height, and gives back the room that
// it then leaves, so that its row is as tall as the web's. A module that imports nothing of React
// Native, so that a test reads it.

/** The web's switch in the legend, 38 by 22: its row is as tall. */
export const LEGEND_SWITCH_HEIGHT = 22;

/** What an iPhone of iOS 26 lays its switch out at, until the switch was measured. */
export const SWITCH_GUESS = { width: 63, height: 28 } as const;

export type SwitchSize = { width: number; height: number };

/** How much a switch of `natural` size is scaled to stand `height` tall, and the room it gives. */
export function switchFit(natural: SwitchSize, height = LEGEND_SWITCH_HEIGHT) {
  const scale = natural.height > 0 ? height / natural.height : 1;
  return {
    scale,
    width: natural.width * scale,
    marginVertical: -(natural.height * (1 - scale)) / 2,
    marginHorizontal: -(natural.width * (1 - scale)) / 2,
  };
}
