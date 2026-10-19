# 046. Sign in with Google when the instance offers it

Date: 2026-10-13

## Decision

Google is a second way to sign in or create an account, through Better Auth's own OAuth provider. Email and password remain available. The API enables Google only with both credentials and refuses an incomplete pair. Its auth endpoint `GET /api/auth/sign-in-providers` answers only whether Google is available; the web app shows the button from that answer. [Decision 070](070-signing-in-from-the-app.md) adds Apple to that answer, and takes Google's ID tokens from the apps. No credential goes into the web build.

The provider asks for an account selection and its default identity scopes. Better Auth checks the OAuth state, exchanges the code, and creates the session through the same suspension hooks as email sign-in. It links an existing account only when the Google address and the local address are verified. A local unchecked account is asked to use its password and check its address first. No provider bypasses that check.

A new Google account starts without a username and chooses one through the existing username form before a contribution or friendship needs it. The invitation travels in OAuth state; only the hook that creates a new user records its sponsor, under decision 041. Returning accounts acquire no sponsor by signing in through a link.

The web app returns to its current address with its language and map parameters. The standalone login returns to the app. A refusal returns to the login with a translated explanation and a validated local destination for another attempt. A redirect reloads the app: an unsaved draft or a dialog's in-memory follow-up is not restored. The selected place remains in the address.

## Consequences

The existing auth tables hold the provider account; no migration is needed. Google receives each request to sign in and supplies the account's name, address and image, which Better Auth keeps. The setup and callback addresses belong in [Self-hosting](../self-hosting.md). An instance without Google credentials continues to offer email alone.
