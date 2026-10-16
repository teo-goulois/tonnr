# 047. An agent signs in as an account, and reads what it keeps

Status: asked for by Téo on 2026-10-13, and built the same day. He said yes to a sign-in for agents, and to tools that read an account and write nothing. It builds on [decision 045](045-mcp-server.md), whose server took a key alone, and adds a fifth way to call to those of [decision 019](019-api-access.md), at the MCP server and nowhere else. Not built: a tool that writes, an operator's view of the assistants that registered, and the page in a language the assistant cannot choose.

## Context

Decision 045's server takes an API key in a header. An assistant that a person adds by its address alone, as the connectors of Claude and of ChatGPT do, sends no header: it expects the server to say where a person signs in, by OAuth, as the Model Context Protocol has it. And a key reads nothing of an account, so no agent could tell a surfer about their own spots.

Téo's handbook has an agent act as its user, signed in through the sign-in library, so that it never gets more than that user.

Read on 2026-10-13, in the packages as they install, and tried in a test that runs the whole exchange:

- Better Auth 1.7.7 no longer holds its plugin for agents. `@better-auth/oauth-provider` 1.7.7 makes the library an authorization server: a client registers, the account agrees on a page of the app's, and the client is given a token.
- It writes the MCP server among what a token may be made for as it starts, by looking for a row and then writing it. Two programs that start at once on one database both write, and the second signs no one in.
- It takes a client that does not say what it is for one of the web, and refuses such a client an address of the person's own machine, which is where a terminal or a desktop app is sent back to.
- Its own scopes give an account's name and address to whoever was allowed anything.
- Any signed-in account may make a client through its routes, unless it is told otherwise.

## Decision

### Who signs in, and to what

- An assistant is an agent's client that an account allowed to read it. The MCP server answers it as it answers a key: `Authorization: Bearer`, with a token in place of the key.
- A token opens the MCP server and nothing else of the API. `/v1` and `/rpc` refuse it.
- A request with no key and no token gets 401, and the refusal says where a client reads how an account signs in: `/.well-known/oauth-protected-resource/mcp`, which names the sign-in library as the one that makes the tokens. The library says the rest at `/.well-known/oauth-authorization-server/api/auth`.
- A client registers itself, with no account and no word from an operator. An account that adds the server to its assistant has nothing else to do.
- No account makes or changes a client through the library's own routes for it.
- A client whose every return address is of the person's own machine is read as the app it is. An address of the web is taken over HTTPS alone. An app's own scheme is taken when it is named after a domain, which is the library's rule.

### What the account is asked

- The assistant sends the account's browser to the API, which sends it on to the web app's page `/connect`. Whoever is not signed in signs in or creates an account there, and is then asked.
- The API signs what the assistant asked for and sends it with the address, after a `#`. The browser keeps what follows a `#` to itself: the web app's server never reads it, and its router, which writes a query its own way and undid the signature when this was first tried, leaves it as it came. The page gives it back to the API unchanged.
- The page names the assistant by the name it gave itself, lists what it will read, says that it changes nothing and is not told the account's address, and names the host the answer goes to. A name is the client's own word: the host is what the account can check.
- The account allows or refuses. Its answer goes back to the assistant with the browser.
- The library remembers the answer. An assistant that asks again for the same thing is not shown the page.

### What a token lets do

- A token says `read`, and may say `offline_access`, which lets the client ask for a new token without the account. It says nothing of who the account is: the library's scopes for a name and an address are left out, and no route gives them to an assistant.
- A token is made for the MCP server alone, lasts an hour, and names its account and its client. The MCP server reads it with the key it was signed with, and asks no address.
- Then one read of the database says whether it still holds: the account exists and is not suspended, the client was not closed, and the account still agrees. An account that an operator suspends, or one that takes its word back, is out at the next request.
- What the client keeps to ask for a new token lasts thirty days from its last use.

### What an assistant reads

- What a key reads, by the same tools.
- What its account keeps, by seven tools that a key is not listed: `list_my_spots`, `list_my_alerts`, `list_my_alert_notifications`, `list_my_sessions`, `get_my_session`, `get_my_sessions_recap` and, since [decision 063](063-a-surfer-profile.md), `get_my_surfer_profile`. Each is a procedure of the account's, marked `account` beside its tool.
- Nothing is written. No tool creates, changes or deletes, and reading what the alerts told marks nothing as read.
- The MCP server gives a procedure the account, as a session it makes from the token, and no key. The procedure asks who calls and finds an account, as it does with a cookie.
- An account's lists are not read: a shared list comes with its link, which opens the list to whoever holds it, and a model's context is no place for it.

### Counting, and taking it back

- A call is counted with the accounts, as every call with a session is, and as one that came by MCP. No account is named in the counts, an assistant's no more than a browser's. An account has no limit.
- `GET /v1/agents` lists the assistants an account allowed, and `DELETE /v1/agents/{clientId}` takes one back: the agreement goes, and with it what the client keeps. The account's panel lists them, with a button for each.

## Rejected

- **The key in a header for everyone.** A connector takes an address and nothing else.
- **A token read against the database alone, as the library offers.** It rests on a part of the library that it does not show, and ties a token to the browser's session: an assistant would stop working when its account signs out of the web app.
- **A token trusted until it ends.** An hour during which a suspended account still reads, and an assistant goes on after the account said no.
- **The library's scopes.** With them an assistant that an account allowed to read its spots would read its address.
- **Clients that an operator registers by hand.** An account could not add the server to its assistant without writing to whoever runs the instance.
- **A client that proves who it is by a document at its address.** It is another package of the library's, and the assistants it would name are few today. The page names the host instead.
- **Tools that write.** Téo said reading alone. A model that sets an alert or deletes a spot on a misread sentence is a decision of its own, with a confirmation to design.
- **The `/login` page for the sign-in.** It leads to the map. A page of its own says why it asks.

## Consequences

- An assistant holds what reads an account's private spots, its alerts and its log. The page says so, and the account's panel takes it back.
- Anyone registers a client: the table of clients grows with each assistant that is added, and nothing clears it. The library holds a registration to five a minute for an address, in the memory of one process.
- A client names itself as it likes, "Claude" too. The page says that the name is its own word, and names the host.
- The page is in English: the library is told one address, and `/fr/connect` is reached by no assistant.
- An assistant in a browser's page, which asks the API from another site, is refused by the API's CORS. The connectors ask from their own servers.
- A client whose app answers a scheme that is no domain's name cannot register. It reaches the server with a key.
- The API's sign-in routes grow by the library's: `/api/auth/oauth2/*` and `/api/auth/jwks`. Eight tables come with it. The key that signs the tokens is kept in the database, enciphered with `BETTER_AUTH_SECRET`: an instance that changes that secret signs every assistant out.
- The web app of this decision needs the API of this decision, and the API sends accounts to a page that an older web app does not have: deploy both.
- Which assistants register, and how many accounts allowed one, is in the database and on no screen.
