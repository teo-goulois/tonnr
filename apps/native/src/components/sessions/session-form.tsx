import type { SurfSize } from "@repo/client/sessions/types";
import type { MediaItem, MediaStatus } from "@repo/client/viewer/types";
import { SESSION_MOST_MEDIA } from "@repo/config/media";
import { SIZES } from "@repo/conditions/sessions/sizes";
import { ChevronLeftIcon } from "@repo/ui/icon";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { MediaStrip } from "@/components/media/media-strip";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { TARGET } from "@/components/ui/metrics";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { fonts } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

import { DurationField } from "./duration-field";
import { RatingInput, ratingWord } from "./rating";
import type { SessionDrafting } from "./session-draft";
import { SizeChoices, sizesWords } from "./surf-size";
import { WhenField } from "./when-field";

// What a session's sheet holds while it is written, a new one or one of the log: when it began,
// how long, how big the waves looked, how it was, its photos and videos and a few words, as the
// web's `SessionForm` asks them. Only when it began is asked for: the rest has a usual answer, or
// may wait. How big the waves looked is asked in a step of the same sheet, first the waves, then
// the sets, as the web asks it in a drawer. Decisions 043 and 066.

// A note as the API takes it.
export const NOTE_MOST = 2000;

/** A line of the form: what is asked on the left, and what answers it on the right. */
function FormRow({
  label,
  labelHidden = false,
  children,
}: {
  label: string;
  // The label says what the control beside it says: a screen reader reads the control.
  labelHidden?: boolean;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
      }}
    >
      <Text
        accessibilityElementsHidden={labelHidden}
        importantForAccessibility={labelHidden ? "no-hide-descendants" : "auto"}
        style={{ flexShrink: 1 }}
      >
        {label}
      </Text>
      <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center" }}>{children}</View>
    </View>
  );
}

/** What was said of the waves on a pill, which opens the step where it is said. */
function SizePill({
  waves,
  sets,
  onPress,
  disabled,
}: {
  waves: SurfSize | null;
  sets: SurfSize | null;
  onPress: () => void;
  disabled: boolean;
}) {
  useUnits();
  const { colors, space } = useTheme();
  const said = sizesWords(waves, sets);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={said ? m.surf_size_said({ waves: said }) : m.surf_size_ask()}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({
        minHeight: 36,
        maxWidth: 220,
        justifyContent: "center",
        paddingHorizontal: space.s,
        borderRadius: 999,
        backgroundColor: pressed ? colors["neutral-4"] : colors["neutral-3"],
      })}
    >
      <Text
        dense
        numberOfLines={1}
        style={{
          color: disabled ? colors["neutral-6"] : said ? colors["neutral-10"] : colors["neutral-7"],
        }}
      >
        {said ?? m.surf_size_add()}
      </Text>
    </Pressable>
  );
}

/** A few words, the keyboard kept out of their way by the screen that scrolls. */
export function NoteField({
  value,
  onChange,
  label,
  placeholder,
  most,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  placeholder: string;
  most: number;
  disabled: boolean;
}) {
  const { colors, space, type } = useTheme();
  return (
    <Surface insetEdge>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={most}
        editable={!disabled}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors["neutral-6"]}
        textAlignVertical="top"
        style={{
          minHeight: 96,
          paddingHorizontal: space.m,
          paddingTop: space.s,
          paddingBottom: space.s,
          color: colors["neutral-10"],
          fontFamily: fonts.regular,
          fontSize: type.m.size,
          lineHeight: type.m.line,
        }}
      />
    </Surface>
  );
}

type SessionFieldsProps = {
  drafting: SessionDrafting;
  now: number;
  disabled: boolean;
  // Whether the instance takes photos and videos: the line is drawn on one that does, or for a
  // session that keeps some. Undefined while it is asked.
  mediaStatus: MediaStatus | undefined;
  // Opens the step where how big the waves looked is said.
  onSizes: () => void;
  // Opens a photo or a video the session keeps, over the whole screen.
  onOpenMedia?: (item: MediaItem) => void;
};

/** When, how long, how big, how it was, its photos and videos, and a few words. */
export function SessionFields({
  drafting,
  now,
  disabled,
  mediaStatus,
  onSizes,
  onOpenMedia,
}: SessionFieldsProps) {
  const { space } = useTheme();
  const { media } = drafting;
  const showsMedia = mediaStatus?.offered === true || media.kept.length > 0;

  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.xs }}>
        <Surface insetEdge style={{ overflow: "hidden" }}>
          <FormRow label={m.session_when()}>
            <WhenField
              value={drafting.startedAt}
              onChange={drafting.setStartedAt}
              now={now}
              disabled={disabled}
              invalid={drafting.isAhead}
            />
          </FormRow>
          <Separator inset={space.m} />
          {/* The choices take the line's whole width, under its name. */}
          <View style={{ gap: space.xs, paddingHorizontal: space.m, paddingVertical: space.s }}>
            <Text>{m.session_duration()}</Text>
            <DurationField
              value={drafting.minutes}
              onChange={drafting.setMinutes}
              disabled={disabled}
              bleed={space.m}
            />
          </View>
          <Separator inset={space.m} />
          <FormRow label={m.surf_size_title()}>
            <SizePill
              waves={drafting.waveSize}
              sets={drafting.setSize}
              onPress={onSizes}
              disabled={disabled}
            />
          </FormRow>
          <Separator inset={space.m} />
          {/* The line says the rating in a word once it is given. */}
          <FormRow
            label={drafting.rating === null ? m.session_rating() : ratingWord(drafting.rating)}
            labelHidden
          >
            <RatingInput
              label={m.session_rating()}
              value={drafting.rating}
              onChange={drafting.setRating}
              disabled={disabled}
            />
          </FormRow>
        </Surface>
        {drafting.isAhead ? (
          <Text
            size="s"
            tone="danger"
            accessibilityLiveRegion="polite"
            style={{ paddingHorizontal: space.m }}
          >
            {m.session_when_ahead()}
          </Text>
        ) : drafting.isFromPhoto ? (
          <Text
            size="s"
            tone="muted"
            accessibilityLiveRegion="polite"
            style={{ paddingHorizontal: space.m }}
          >
            {m.native_session_from_photo()}
          </Text>
        ) : null}
      </View>

      {showsMedia ? (
        <View style={{ gap: space.xs }}>
          <Text
            size="s"
            weight="medium"
            tone="muted"
            accessibilityRole="header"
            style={{ paddingHorizontal: space.m }}
          >
            {m.media_title()}
          </Text>
          <MediaStrip
            purpose="session"
            entries={media.entries}
            kept={media.kept}
            uploads={media.uploads}
            disabled={disabled || drafting.isKeptAsked}
            paused={mediaStatus?.paused === true || mediaStatus?.offered === false}
            most={SESSION_MOST_MEDIA}
            onAdd={media.add}
            onRemove={media.remove}
            onRetry={media.retry}
            onOpen={onOpenMedia}
          />
        </View>
      ) : null}

      <NoteField
        value={drafting.note}
        onChange={drafting.setNote}
        label={m.session_note()}
        placeholder={m.session_note_placeholder()}
        most={NOTE_MOST}
        disabled={disabled}
      />
    </View>
  );
}

/** The header of a step inside a sheet: a way back, what the step asks, and one thing to do. */
export function StepHeader({
  title,
  onBack,
  backLabel,
  action,
}: {
  title: string;
  onBack: () => void;
  // What the way back says: back to the form, or out of the sheet.
  backLabel?: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors, space } = useTheme();
  const back = backLabel ?? m.action_back();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingTop: space.s,
        paddingBottom: space.xs,
        paddingHorizontal: space.xs,
      }}
    >
      <View style={{ flex: 1, alignItems: "flex-start" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={back}
          onPress={onBack}
          style={({ pressed }) => ({
            minHeight: TARGET,
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            paddingHorizontal: space.xs,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {backLabel ? null : (
            <Glyph icon={ChevronLeftIcon} size={16} color={colors["neutral-10"]} />
          )}
          <Text weight="medium">{back}</Text>
        </Pressable>
      </View>
      <Text
        weight="medium"
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flexShrink: 1, textAlign: "center" }}
      >
        {title}
      </Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        {action ? (
          <Button variant="ghost" onPress={action.onPress}>
            {action.label}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

type SizesStepProps = {
  waves: SurfSize | null;
  sets: SurfSize | null;
  onDone: (waves: SurfSize | null, sets: SurfSize | null) => void;
  onBack: () => void;
};

/**
 * How big the waves looked, as a step of the sheet: first most of the waves, then the sets, each
 * among nine pictures of a surfer beside a wave. No size is offered before the surfer says one,
 * so that none is said for being offered; the sets are never smaller than the waves.
 */
export function SizesStep({ waves, sets, onDone, onBack }: SizesStepProps) {
  const { space } = useTheme();
  const [step, setStep] = useState<"waves" | "sets">("waves");
  const [picked, setPicked] = useState<SurfSize | null>(waves);
  const isSets = step === "sets" && picked !== null;

  return (
    <View style={{ flex: 1 }}>
      <StepHeader
        title={isSets ? m.surf_size_sets() : m.surf_size_waves()}
        onBack={isSets ? () => setStep("waves") : onBack}
        action={
          !isSets && (waves ?? sets)
            ? { label: m.surf_size_clear(), onPress: () => onDone(null, null) }
            : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{ gap: space.m, padding: space.m, paddingBottom: space.xl }}
      >
        <Text size="s" tone="muted">
          {m.surf_size_hint()}
        </Text>
        {isSets ? (
          <SizeChoices
            key="sets"
            label={m.surf_size_sets()}
            // The sets said before stay chosen while they are no smaller than the waves.
            value={sets && SIZES.indexOf(sets) >= SIZES.indexOf(picked) ? sets : null}
            least={picked}
            // Each set is drawn behind the waves that were said.
            front={picked}
            onPick={(size) => onDone(picked, size)}
          />
        ) : (
          <SizeChoices
            key="waves"
            label={m.surf_size_waves()}
            value={picked}
            onPick={(size) => {
              setPicked(size);
              setStep("sets");
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}
