# Connecting an agent: the MCP server

An instance of Tonnr is also an MCP server. An agent that speaks the Model Context Protocol, such as Claude Code or Cursor, lists its tools and calls them, with no HTTP call to write. [Decision 045](decisions/045-mcp-server.md) gives the rules.

Below, `https://api.example.org` stands for the address of the instance's API.

## What to give a client

- The address: `https://api.example.org/mcp`.
- The transport: Streamable HTTP. Nothing is kept between two requests, and the older transport with two addresses, HTTP+SSE, is not served.
- One header: `Authorization: Bearer <key>`, with an API key of the instance. Whoever runs the instance makes it, for a developer account: [self-hosting](self-hosting.md#accounts-the-operator-and-api-keys) says how.

A request with no working key gets 401, the list of the tools too. A session's cookie is not read.

## The tools

Every tool reads, and none writes. An agent reads what a key reads at `/v1`: nothing of an account.

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

## A client that takes no header

A client that adds a remote server by its address alone, with a sign-in or with none, cannot send the key. Until agents sign in as an account, which decision 045 leaves for later, it reaches the server through a bridge as above, or not at all.

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

Not tried: Claude Code, Cursor and Claude Desktop themselves. Claude Code's command is as its `claude mcp add --help` gives it. The files of Claude Code and of Cursor are written from what is known of their format.
