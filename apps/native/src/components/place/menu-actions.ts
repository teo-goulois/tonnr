import type { MenuAction } from "@expo/ui/community/menu";

// The groups of a menu as the web's separators part them, written as the platform's own menu
// takes them (`@expo/ui/community/menu`), where a group is parted from the rest by standing
// inline. iOS draws a line between an inline group and what is around it, and shows its title
// over it: a group stands inline every other one from the second, so that one line parts each
// group from the next, and a group with a title always. Android draws a line before an inline
// group and one after, and never its title: a group with a title is an item of its own there,
// named by it, which opens what it holds, and only a group between two others stands inline, so
// that no line ends the menu. Pure, so that a test reads it.

export type MenuGroup = {
  /** What the group is called, over it: the web's `MenuGroupLabel`. */
  title?: string;
  actions: MenuAction[];
};

/** The actions of the platform's menu, parted into the groups given, the empty ones left out. */
export function menuActions(
  groups: readonly MenuGroup[],
  platform: "ios" | "android" = "ios",
): MenuAction[] {
  const shown = groups.filter((group) => group.actions.length > 0);
  return shown.flatMap((group, index): MenuAction[] => {
    const id = `group-${index}`;
    if (platform === "android") {
      if (group.title !== undefined) return [{ id, title: group.title, subactions: group.actions }];
      return index > 0 && index < shown.length - 1
        ? [{ id, title: "", displayInline: true, subactions: group.actions }]
        : group.actions;
    }
    return group.title !== undefined || index % 2 === 1
      ? [{ id, title: group.title ?? "", displayInline: true, subactions: group.actions }]
      : group.actions;
  });
}

/** Every action a menu holds that can be done, its groups opened: what a screen reader offers. */
export function leavesOf(actions: readonly MenuAction[]): MenuAction[] {
  return actions.flatMap((action) =>
    action.subactions && action.subactions.length > 0
      ? leavesOf(action.subactions)
      : action.attributes?.disabled || action.attributes?.hidden
        ? []
        : [action],
  );
}
