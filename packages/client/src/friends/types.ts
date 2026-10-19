import type { Friend, FriendDetail, Inviter, Loadable } from "../viewer/types";

/**
 * The link of the signed-in account, the friends it made, and what the screen does with them:
 * the route gives it. Decision 041.
 */
export type Friending = {
  // The address of the account's link. Undefined until the API gave it, and for an account
  // that has no username yet: it has no link to give.
  link: string | undefined;
  friends: Loadable<Friend[]>;
  // The friend whose contributions are open, and what they wrote.
  opened: { id: string; detail: Loadable<FriendDetail> } | undefined;
  onOpen: (id: string | undefined) => void;
  isRenewing: boolean;
  onRenew: () => void;
  isRemoving: boolean;
  onRemove: (id: string) => void;
  // Asks whether to block a friend, by its username, which ends the friendship: decision 071.
  onBlock: (username: string) => void;
};

/**
 * The link someone was given, as the address names it: whose it is, and what its reader does
 * with it. Undefined when the address names none.
 */
export type Invitation = {
  inviter: Loadable<Inviter>;
  // True for a link that opens nothing: it was changed, or was never one.
  isGone: boolean;
  // True for the link of an account the reader blocked, which names it no more: decision 071.
  isBlocked: boolean;
  isAccepting: boolean;
  onAccept: () => void;
  // Asks for an account, with the link: one that is made through it has its owner as sponsor.
  onCreateAccount: () => void;
  onSignIn: () => void;
  onClose: () => void;
};
