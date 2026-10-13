import { APP_NAME, FEEDBACK_URL, REPOSITORY_URL } from "@repo/config/app";

/** The buoy the landing shows, and the one its request reads: a real station of the instance. */
export const EXAMPLE_STATION = "candhis-05602";

/** The shell variable an example keeps its key in. */
export const KEY_VARIABLE = `${APP_NAME.toUpperCase()}_KEY`;

/**
 * What an agent reads at `/llms.txt`: what the service is and how to call its API, as Markdown.
 * It names routes of `packages/api`, and the tools of its MCP server: a route or a tool that
 * changes there changes here. English alone, as the API's reference is.
 */
export function llmsText({ site, api }: { site: string; api: string }) {
  return `# ${APP_NAME}

> ${APP_NAME} is a free, open-source surf-conditions service. People save their surf spots with the swell, wind and tide that make them work, and are told when measurements or forecasts match. An API serves the data underneath: buoy measurements, forecasts, tides and a catalogue of surf breaks.

## For a person

- [The map](${site}/app): buoys, wind stations, surf breaks, forecasts and tides. No account is needed to read it.
- [What ${APP_NAME} does](${site}/): every feature, in a page.

## The API

- Base address: \`${api}/v1\`
- [OpenAPI specification](${api}/v1/openapi.json): every route, its parameters and its answers.
- [Reference](${api}/v1/docs): the same, for a person.
- A program calls with a key: \`Authorization: Bearer <key>\`. Whoever runs the instance hands the keys out. [Ask for one](${FEEDBACK_URL}) and say what you are building.
- A key reads the data everyone shares. It never stands for an account: spots, lists, alerts and sessions take a signed-in account.
- Answers are JSON. Heights are in metres, periods in seconds, speeds in metres per second, directions in degrees the sea or the wind comes from, and times in UTC.
- A station comes with its \`attribution\` and its \`license\`. Show them with the data.
- A call over the limit of a key answers 429. Wait, then call again.

## Routes a key reads

- \`GET /v1/stations\`: buoys and wind stations with their latest reading, in an area (\`bbox\`), by \`provider\` or by what they measure (\`measures=waves|wind\`).
- \`GET /v1/stations/{id}\`: one station with its latest reading.
- \`GET /v1/stations/{id}/readings\`: a station's readings over a period, newest first.
- \`GET /v1/forecasts?latitude=&longitude=&days=\`: hourly waves, wind and weather at a point, up to seven days. \`start\` and \`end\` give a period of one's own in place of \`days\`, and \`stepHours\` one hour in so many.
- \`GET /v1/tides/extremes\`: high and low tides near a point.
- \`GET /v1/tides/timeline\`: the tide's height at regular intervals near a point.
- \`GET /v1/breaks\`: the catalogue of surf breaks, in an area or by name.
- \`GET /v1/breaks/search\`: surf breaks by their name or their town's.
- \`GET /v1/breaks/{id}\`: one surf break, with what is known of it.
- \`GET /v1/maps/wave-height\`: where to get map tiles of the wave height, and how to read them.
- \`GET /v1/health\`: answers anyone, and says since when the API and its worker run.

## Example

\`\`\`sh
curl ${api}/v1/stations/${EXAMPLE_STATION} \\
  -H "Authorization: Bearer $${KEY_VARIABLE}"
\`\`\`

## For an agent: the MCP server

- Address: \`${api}/mcp\`, over Streamable HTTP. Nothing is kept between two requests.
- It takes the same key, in the same header: \`Authorization: Bearer <key>\`. Or an account signs the agent in: add the address alone to an assistant, and it opens a page where the account agrees. The assistant then also reads that account's spots, alerts and sessions, and changes nothing. With neither it answers 401.
- Its tools read what the routes above read, under names of their own: \`list_stations\`, \`get_station\`, \`get_station_readings\`, \`get_forecast\`, \`get_tide_extremes\`, \`get_tide_timeline\`, \`list_surf_breaks\`, \`search_surf_breaks\`, \`get_surf_break\` and \`get_surf_break_guide\`. Each one reads, and none writes.
- A call to a tool is a call to its route: it answers the same JSON, and counts against the same limit.
- Claude Code: \`claude mcp add --transport http ${APP_NAME.toLowerCase()} ${api}/mcp --header "Authorization: Bearer $${KEY_VARIABLE}"\`
- [How to connect another client](${REPOSITORY_URL}/blob/main/docs/mcp.md).

## The project

- [Source code](${REPOSITORY_URL}), under the GNU AGPL, version 3. Anyone may host an instance.
- [Feedback, and a key](${FEEDBACK_URL}).
- The measurements belong to the networks that publish them, each under its own terms.
`;
}
