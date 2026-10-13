import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { MinusIcon, PlusIcon } from "@repo/ui/icon";
import { useState } from "react";

import { formatDuration } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { MorphText } from "../shared/morph-text";
import { ViewerDrawer } from "../viewer/viewer-drawer";

/** How long a session is taken to last until its surfer says. */
export const USUAL_MINUTES = 90;
// What a session's length is chosen among at a press.
const USUAL = [30, 60, USUAL_MINUTES, 120, 180];
// A length of one's own: from a quarter of an hour to eight hours, five minutes at a time.
const LEAST = 15;
const MOST = 480;
const STEP = 5;

const within = (minutes: number) => Math.min(MOST, Math.max(LEAST, minutes));

type DurationInputProps = {
  // In minutes.
  value: number;
  onChange: (minutes: number) => void;
  label: string;
  wide: boolean;
  disabled?: boolean;
};

/**
 * How long a session lasted: the five usual lengths, a press each, and a last choice for
 * another one, which opens a drawer where it is set to five minutes. A length that is none of
 * the usual ones is written on that last choice.
 */
export function DurationInput({ value, onChange, label, wide, disabled }: DurationInputProps) {
  // The length being set in the drawer. Null while the drawer is closed.
  const [own, setOwn] = useState<number | null>(null);
  const isUsual = USUAL.includes(value);
  // A step from the length as it is then: two presses in a row are two steps.
  const step = (by: number) =>
    setOwn((current) => (current === null ? null : within(current + by)));

  return (
    <>
      <Tabs
        value={isUsual ? String(value) : "own"}
        onValueChange={(next) => {
          // The last choice changes nothing by itself: its drawer does, once it is answered.
          if (next !== "own") onChange(Number(next));
        }}
      >
        <TabsList variant="segment" aria-label={label} className="w-full">
          {USUAL.map((choice) => (
            <TabsTab
              key={choice}
              value={String(choice)}
              disabled={disabled}
              className="min-w-0 flex-1 px-0 max-lg:px-0"
            >
              {formatDuration(choice)}
            </TabsTab>
          ))}
          <TabsTab
            value="own"
            disabled={disabled}
            className="min-w-0 flex-1 px-0 max-lg:px-0"
            onClick={() => setOwn(within(value))}
          >
            {/* The choice becomes the length that was set, and its letters move to it. */}
            <MorphText>{isUsual ? m.session_duration_other() : formatDuration(value)}</MorphText>
          </TabsTab>
        </TabsList>
      </Tabs>

      <ViewerDrawer
        open={own !== null}
        onOpenChange={(open) => {
          if (!open) setOwn(null);
        }}
        wide={wide}
        title={label}
      >
        {own !== null && (
          <div className="grid gap-l">
            {/* The slider says the length to who cannot see it. Its figures slide as it moves. */}
            <p aria-hidden className="text-center text-xl font-medium tabular-nums">
              <MorphText>{formatDuration(own)}</MorphText>
            </p>
            <div className="flex items-center gap-s">
              <Button
                variant="secondary"
                size="icon"
                className="shrink-0"
                aria-label={m.session_duration_less()}
                disabled={own <= LEAST}
                onClick={() => step(-STEP)}
              >
                <MinusIcon data-slot="icon" aria-hidden />
              </Button>
              <Slider
                className="min-w-0 flex-1"
                value={own}
                min={LEAST}
                max={MOST}
                step={STEP}
                getAriaLabel={() => label}
                getAriaValueText={(_formatted, minutes) => formatDuration(minutes)}
                onValueChange={(next) => setOwn(within(Number(next)))}
              />
              <Button
                variant="secondary"
                size="icon"
                className="shrink-0"
                aria-label={m.session_duration_more()}
                disabled={own >= MOST}
                onClick={() => step(STEP)}
              >
                <PlusIcon data-slot="icon" aria-hidden />
              </Button>
            </div>
            <Button
              onClick={() => {
                onChange(own);
                setOwn(null);
              }}
            >
              {m.session_duration_done()}
            </Button>
          </div>
        )}
      </ViewerDrawer>
    </>
  );
}
