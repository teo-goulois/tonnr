import type { MenuAction } from "@expo/ui/community/menu";

// The groups of a menu as the web's separators part them, written as the platform's own menu
// takes them (`@expo/ui/community/menu`): there a group is parted from the rest by standing
// inline, which iOS draws with a line between it and what is around it, and Android with a line
// before it and one after. A group stands inline every other one from the second, so that one
// line parts each group from the next on both, and a group with a title always, which only a
// group standing inline shows, over it, on iOS. Pure, so that a test reads it.

export type MenuGroup = {
  /** What the group is called, over it: the web's `MenuGroupLabel`. */
  title?: string;
  actions: MenuAction[];
};

/** The actions of the platform's menu, parted into the groups given, the empty ones left out. */
export function menuActions(groups: readonly MenuGroup[]): MenuAction[] {
  return groups
    .filter((group) => group.actions.length > 0)
    .flatMap((group, index) =>
      group.title !== undefined || index % 2 === 1
        ? [
            {
              id: `group-${index}`,
              title: group.title ?? "",
              displayInline: true,
              subactions: group.actions,
            },
          ]
        : group.actions,
    );
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
