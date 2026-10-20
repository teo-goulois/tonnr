import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { labelsHidden, pickerStyle, tag, tint } from "@expo/ui/swift-ui/modifiers";

import { feel } from "@/components/ui/haptics";
import { useTheme } from "@/lib/theme";

// One choice among a few, drawn by the platform at the end of a row: on iOS SwiftUI's menu
// picker, the value in the accent's color whose press opens the system's menu, the choice in
// force checked; Android's is in `menu-picker.android.tsx`. Its label is said to a screen reader
// and not drawn, since the row says it. Decision 069.

export type MenuOption<Value extends string | number> = { value: Value; label: string };

export function MenuPicker<Value extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly MenuOption<Value>[];
  onChange: (value: Value) => void;
}) {
  const { colors, scheme } = useTheme();
  return (
    <Host matchContents colorScheme={scheme}>
      <Picker
        label={label}
        selection={String(value)}
        onSelectionChange={(chosen) => {
          const option = options.find((one) => String(one.value) === String(chosen));
          if (!option || option.value === value) return;
          feel("select");
          onChange(option.value);
        }}
        modifiers={[pickerStyle("menu"), labelsHidden(), tint(colors["color-1"])]}
      >
        {options.map((option) => (
          <Text key={String(option.value)} modifiers={[tag(String(option.value))]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
