import { scaleColor, WAVE_HEIGHT_SCALE } from "@repo/client/sea-scales";
import { SURF_FACES } from "@repo/conditions/sessions/sizes";
import { SurferFillIcon, WaveFillIcon } from "@repo/ui/icon";
import { useState } from "react";
import { View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";

import type { SurfSize } from "./profiling";

// A size drawn as the web draws it (`SurfSizePicture`): a surfer of 1.75 m beside a wave of the
// size's height of face, both to one scale, so that the wave is read against the body. The two
// are the icons the web draws, Nucleo's person and wave, each cut to what it draws of its box:
// the person stands in a square, and the wave's square is stretched to its width and turned to
// break towards the surfer. Decisions 043 and 063.

// The picture's box, in the web's units: the surfer at the left, the wave rising at the right.
const WIDTH = 100;
const HEIGHT = 64;
const WATER = 58;
const TOP = 6;
const SURFER = 1.75;
const SURFER_X = 16;
const PERSON = "4.6 0 8.8 18";
const WAVE = { box: "1 2.1 16 8.3", wide: 16, high: 8.3 };
const WAVE_LEFT = 30;
const WAVE_STRETCH = { least: 1.6, most: 4.4 };
const HEADROOM = 1.2;
const LEAST_WAVE = 8;

/** Where a size's wave and its surfer stand in the box, in its units. */
export function sizeLayout(size: SurfSize) {
  const face = SURF_FACES[size].drawn;
  const perMeter = (WATER - TOP) / Math.max(SURFER * HEADROOM, face);
  const high = Math.max(face * perMeter, LEAST_WAVE);
  const across = Math.min(Math.max(high / WAVE.high, WAVE_STRETCH.least), WAVE_STRETCH.most);
  const wide = WAVE.wide * across;
  return {
    face,
    wave: { left: Math.min(WAVE_LEFT, WIDTH - wide), wide, high },
    surfer: SURFER * perMeter,
  };
}

/** A size drawn, as wide as what holds it. It says nothing to a screen reader: its name does. */
export function SurfSizePicture({ size }: { size: SurfSize }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const unit = width / WIDTH;
  const { face, wave, surfer } = sizeLayout(size);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ width: "100%", aspectRatio: WIDTH / HEIGHT, overflow: "hidden" }}
    >
      {width > 0 ? (
        <>
          {/* The wave's square, stretched to its width about its middle, and turned. */}
          <View
            style={{
              position: "absolute",
              left: (wave.left + wave.wide / 2 - wave.high / 2) * unit,
              top: (WATER - wave.high) * unit,
              width: wave.high * unit,
              height: wave.high * unit,
              transform: [{ scaleX: -wave.wide / wave.high }],
            }}
          >
            <Glyph
              icon={WaveFillIcon}
              size={wave.high * unit}
              color={scaleColor(WAVE_HEIGHT_SCALE, face)}
              viewBox={WAVE.box}
              preserveAspectRatio="none"
            />
          </View>
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: WATER * unit,
              height: 1,
              backgroundColor: colors["neutral-10"],
              opacity: 0.25,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: (SURFER_X - surfer / 2) * unit,
              top: (WATER - surfer) * unit,
            }}
          >
            <Glyph
              icon={SurferFillIcon}
              size={surfer * unit}
              color={colors["neutral-10"]}
              viewBox={PERSON}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}
