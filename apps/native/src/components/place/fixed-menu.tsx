import type { MenuAction, MenuComponentProps, MenuComponentRef } from "@expo/ui/community/menu";
import { Button, Host, Menu, RNHostView, Section, Toggle } from "@expo/ui/swift-ui";
import { disabled, menuOrder, tint } from "@expo/ui/swift-ui/modifiers";
import { type ReactNode, type Ref, useImperativeHandle } from "react";

// The platform's menu of a place, as `@expo/ui/community/menu` draws it on iOS, with SwiftUI's
// `Menu`, and with its items in the order they are given wherever it opens, as the web's menu
// lists them: iOS's own order turns a menu that opens upward, from a button low on the screen,
// upside down. Android draws `@expo/ui`'s own (`fixed-menu.android.tsx`).

function idOf(action: MenuAction): string {
  return action.id ?? action.title;
}

function itemOf(action: MenuAction, onPressAction: MenuComponentProps["onPressAction"]): ReactNode {
  if (action.attributes?.hidden) return null;
  const key = idOf(action);
  const { subactions, displayInline, state, attributes, title } = action;
  if (subactions && subactions.length > 0) {
    const items = subactions.map((one) => itemOf(one, onPressAction));
    return displayInline ? (
      <Section key={key} title={title}>
        {items}
      </Section>
    ) : (
      <Menu key={key} label={title}>
        {items}
      </Menu>
    );
  }
  const press = () => onPressAction?.({ nativeEvent: { event: key } });
  const modifiers = [
    ...(attributes?.disabled ? [disabled(true)] : []),
    ...(action.imageColor && !attributes?.destructive ? [tint(action.imageColor)] : []),
  ];
  if (state === "on" || state === "off") {
    return (
      <Toggle
        key={key}
        label={title}
        isOn={state === "on"}
        onIsOnChange={press}
        modifiers={modifiers.length > 0 ? modifiers : undefined}
      />
    );
  }
  return (
    <Button
      key={key}
      label={title}
      role={attributes?.destructive ? "destructive" : undefined}
      modifiers={modifiers.length > 0 ? modifiers : undefined}
      onPress={press}
    />
  );
}

export default function FixedMenu({
  ref,
  actions,
  onPressAction,
  style,
  testID,
  children,
}: MenuComponentProps & { ref?: Ref<MenuComponentRef> }) {
  // SwiftUI's menu opens by its own press alone, as `@expo/ui`'s does on iOS.
  useImperativeHandle(ref, () => ({ show: () => {} }), []);
  return (
    <Host matchContents style={style} testID={testID} ignoreSafeArea="all">
      <Menu
        label={
          <RNHostView matchContents>
            <>{children}</>
          </RNHostView>
        }
        modifiers={[menuOrder("fixed")]}
      >
        {actions.map((action) => itemOf(action, onPressAction))}
      </Menu>
    </Host>
  );
}
