# Connecting an agent: the MCP server

An instance of Tonnr is also an MCP server. An agent that speaks the Model Context Protocol, such as Claude, ChatGPT or Cursor, lists its tools and calls them, with no HTTP call to write. Decisions [045](decisions/045-mcp-server.md) and [047](decisions/047-agents-sign-in.md) give the rules.

Below, `https://api.example.org` stands for the address of the instance's API.

## What to give a client

- The address: `https://api.example.org/mcp`.
- The transport: Streamable HTTP. Nothing is kept between two requests, and the older transport with two addresses, HTTP+SSE, is not served.
- Who calls, one of two:
  - An account, which signs the agent in. Give the client the address and nothing else: it finds where to sign in, opens a page of the web app where the account agrees, and reads what that account keeps as well as what everyone shares. This is how a connector of Claude or of ChatGPT is added.
  - A program, with one header: `Authorization: Bearer <key>`, with an API key of the instance. Whoever runs the instance makes it, for a developer account: [self-hosting](self-hosting.md#accounts-the-operator-and-api-keys) says how. A key reads what everyone shares, and nothing of an account.

A request with neither gets 401, the list of the tools too, and the refusal says where an account signs in. A session's cookie is not read.

## The tools

Every tool reads, and none writes. With a key, an agent reads what a key reads at `/v1`: nothing of an account.

| Tool                   | What it answers                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| `list_stations`        | Buoys and wind stations in an area, each with what it measured last         |
| `get_station`          | One station with what it measured last                                      |
| `get_station_readings` | What a station measured over a period, the newest first                     |
| `get_forecast`         | The hourly forecast of waves, wind and weather at a point, 7 days at most   |
| `get_tide_extremes`    | The high and the low tides near a point                                     |
| `get_tide_timeline`    | The tide's height at regular steps near a point                             |
| `list_surf_breaks`     | The surf breaks of the catalogue in an area, with what is known of each     |
| `search_surf_breaks`   | Surf breaks by their name or their town's, the likeliest first              |
| `get_surf_break`       | One surf break of the catalogue                                             |
| `get_surf_break_guide` | What the people who surf a break wrote of it: access, entry, hazards, rules |

An agent that an account signed in is listed six more, which read what that account keeps:

| Tool                          | What it answers                                           |
| ----------------------------- | --------------------------------------------------------- |
| `list_my_spots`               | The account's own spots, with what it says of them        |
| `list_my_alerts`              | Its alerts, with the conditions each one waits for        |
| `list_my_alert_notifications` | What its alerts told it, the newest first                 |
| `list_my_sessions`            | Its log of surf sessions, the latest first                |
| `get_my_session`              | One session, with the conditions kept with it             |
| `get_my_sessions_recap`       | What the log comes to: totals, and the places surfed most |

- A tool is a route of the API, and answers the same JSON: [the reference](https://api.example.org/v1/docs) says what each field is.
- Heights are in metres, periods in seconds, speeds in metres per second, and directions in degrees clockwise from north that the sea or the wind comes from. Times are in UTC.
- An area is `"west,south,east,north"` in decimal degrees: `"-5.2,47.6,-4.0,48.5"`.
- An answer names where its data comes from, in `attribution`, `source` and `license`. Whoever shows the data shows that with it.
- A forecast takes a period of the agent's own, `start` and `end`, in place of whole days, and `stepHours` for one hour in so many: a week every three hours is a third of a week at every hour.
- A tool asks for less than its route when the agent says nothing: 25 stations, 48 readings, 50 breaks, two days of forecast, a tide every 30 minutes. The agent asks for more within the route's bounds.

## The limit

A call to a tool is a call to its route. It is counted under the key, and held to the limit of the key's developer account: so many calls in an hour of the clock, shared by its keys and by both ways in, `/v1` and `/mcp`. Listing the tools takes nothing of it. Over the limit, a tool answers an error that says how many seconds to wait.

The counts say which way a call came. Whoever runs the instance reads in the admin how much comes by MCP and whose agents call, and a member of a developer account reads its own in the console.

## Claude Code

```bash
export TONNR_KEY=<key>
claude mcp add --transport http tonnr https://api.example.org/mcp \
  --header "Authorization: Bearer $TONNR_KEY"
```

Or, for everyone who works in a repository, in its `.mcp.json`, which holds no key:

```json
{
  "mcpServers": {
    "tonnr": {
      "type": "http",
      "url": "https://api.example.org/mcp",
      "headers": { "Authorization": "Bearer ${TONNR_KEY}" }
    }
  }
}
```

## Cursor

In `.cursor/mcp.json`, or in `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "tonnr": {
      "url": "https://api.example.org/mcp",
      "headers": { "Authorization": "Bearer ${env:TONNR_KEY}" }
    }
  }
}
```

## Claude Desktop, and a client that speaks stdio alone

Such a client starts a program on the machine and talks to it. [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) is one that passes what it hears on to a remote server, with the header. In Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tonnr": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://api.example.org/mcp",
        "--header",
        "Authorization:${TONNR_AUTH}"
      ],
      "env": { "TONNR_AUTH": "Bearer <key>" }
    }
  }
}
```

The header is written without a space after its colon, and its value comes from `env`: some clients cut an argument at a space. The key is then in that file, on that machine.

## An assistant that signs in: Claude, ChatGPT, and other connectors

Add a custom connector, or a remote MCP server, by its address alone: `https://api.example.org/mcp`. The assistant then opens the web app's page `/connect` in a browser. Sign in there, or create an account, read what the assistant will read, and allow it.

- The assistant reads the account's spots, its alerts and what they told, and its log of sessions, besides what everyone reads. It changes nothing, and is not told the account's name or address.
- The page names the assistant by the name it gave itself, and the host the answer goes to. Allow only what you just asked for.
- The account takes it back in the web app, in its panel, under "Connected assistants". The assistant reads nothing more from the next request on.
- Claude Code signs in the same way when the server is added with no header: `claude mcp add --transport http tonnr https://api.example.org/mcp`, then `/mcp` in a session.
- A client whose app answers an address scheme of its own that is not named after a domain cannot register. It connects with a key, as above.

## By hand

```bash
curl https://api.example.org/mcp \
  --header "Authorization: Bearer $TONNR_KEY" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The answer holds the tools, as JSON or as the one event of a stream.

## What was tried

On 2026-10-13, against an API started from its release build, with invented stations and breaks:

- The official SDK's client, `@modelcontextprotocol/client` 2.3.1, in the 2026-07-28 revision of the protocol and in the one before, 2025-11-25: it lists the tools, nine of them that day, and calls them, and is refused at connection without a working key.
- The same client through `mcp-remote`, as the configuration for Claude Desktop above runs it.
- The `curl` call above.
- The sign-in of an account, in the API's tests: a client registers, an account agrees, the client trades what it is given for a token, lists the tools and reads the account's spots, and is refused once the account is suspended or takes its word back.
- The page `/connect` in a browser, against the release build of the API and a web app on the same machine: an account was created on the page, allowed an invented assistant, and the assistant traded what the browser brought back for a token, listed sixteen tools and read the account's spots. Asked a second time, the API did not show the page again.

Not tried: Claude Code, Cursor, Claude Desktop and ChatGPT themselves, with a key or with a sign-in. Claude Code's command is as its `claude mcp add --help` gives it. The files of Claude Code and of Cursor are written from what is known of their format.
