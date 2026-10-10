# 029. Reading charts by touch

Status: accepted on 2026-10-10.

## Context

The sea charts were read with a mouse. On a phone the same surface must let someone scroll
through a panel, scroll the tide through days, and inspect a particular hour without the
finger covering its value.

## Decision

A stationary touch of 300 ms starts inspection. Sliding then selects the nearest sample,
with a cursor on the curve and the time and values above it. The four comparison lanes
read the same moment. Tide inspection also shows the other crossings of that water level.
Lifting the finger returns to the usual reading.

Moving more than eight CSS pixels before the hold completes leaves the gesture to native
scrolling. Only active inspection cancels a touch move, through a non-passive listener.
A second finger, cancellation or loss of focus ends inspection. Mouse and keyboard chart
navigation keep their existing behavior.

`useChartTouch` owns this gesture for the product's curves. Updates are limited to animation
frames and snap to actual samples, so moving inside one sample does not redraw the chart.
Chart mounting still follows the drawer's rest and the existing drawing queue.

## Consequences

- The tide retains its native horizontal scrolling and day snapping.
- Inspection does not dismiss the drawer or scroll the page while the finger reads values.
- The mobile hint is translated in the web app's messages.
- The forecast table keeps its native scrolling; its values are already written in cells.
- Browser tests exercise the real charts with touch events. Physical Safari gesture timing
  still requires validation on a phone; a desktop viewport does not establish that behavior.
