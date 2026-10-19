// What deleting an account asks and leaves, for the API that deletes it and for the apps that
// say so before they ask: decision 071.

/** An account without a password deletes itself from a session opened this many minutes ago at most. */
export const FRESH_SIGN_IN_MINUTES = 10;

/** How many days the username of a deleted account is nobody's. */
export const DELETED_USERNAME_DAYS = 30;
