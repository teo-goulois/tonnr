# 028. A drawer closes before its address changes

Status: accepted on 2026-10-10.

## Context

The map's selection and its panels are named in the address. Closing one used to navigate
first and wait for the route's session check before starting its exit. A mobile connection
made the close button feel unresponsive. Clearing the selection also updated the map while
the drawer was moving.

## Decision

`ViewerDrawer` dismisses locally as soon as the primitive asks it to close, whether by its
button, a swipe, Escape, or the backdrop. The primitive's `onOpenChangeComplete` then tells
the owner to clear the address. There is no timer that guesses when the animation ends.
The drawer stays dismissed while that navigation waits for the session check.

The address remains the source of the selected record. A different record interrupts a
local dismissal; a completed exit must not clear that new selection. Back and forward
navigation still control the drawer, without writing another history entry.

The shared drawer's exit uses the theme's Large duration, scaled by the primitive's swipe
strength, as its entrance uses the theme. It no longer has a separate 400 ms base duration.

## Consequences

- Dismissal does not wait for the network, and clearing the selection changes the map after
  the exit, not during it.
- The address retains the selection during the exit and until navigation completes.
- The session check remains in place. This does not change the time it takes to open a
  selection through navigation, nor guarantee frame timing on a particular device.
