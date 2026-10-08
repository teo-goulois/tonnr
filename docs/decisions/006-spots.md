# 006. Spots and their criteria

Status: accepted on 2026-10-08.

## Context

A spot is what the product is built around: a point, a name, and the conditions that make it work. Alerts will be computed from it.

## Decision

- A spot belongs to one user and is private or public. A private spot that is not the caller's is reported as missing, so its existence stays private. The API never exposes the owner, only whether the caller is the owner.
- Criteria are stored as one JSON column and validated by `criteriaSchema` in `packages/api/src/spots/criteria.ts`. They cover the swell (height, period, direction), the wind (speed, direction), and the tide (height, rising or falling). A direction is a sector that runs clockwise from one bearing to another and may pass through north.
- A criterion left out is not checked. A criterion on a value that is unknown for an hour, such as the tide far from any station, counts as not met.
- `GET /v1/spots/{id}/conditions` gives, hour by hour, the forecast and the tide, the criteria that hour does not meet, and the windows during which every criterion is met. The alert engine will use the same computation.
- An account holds at most 100 spots.

## Consequences

- Sharing a spot with chosen people is not built. It needs invitations and a third visibility.
- Conditions come from the forecast only. A buoy measurement does not yet confirm that a spot works now.
- Tide heights are measured from the datum the tide source uses (decision 002), so a tide criterion means that datum.
- Changing the shape of the criteria means migrating the stored JSON.
