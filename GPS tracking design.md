# Map-View Movements Design

## Problem Description
In order to create a  pleasant UX, some map focus changes are using flight-like move which may take a few seconds.
In some scenarios such a flight is interrupted and the original user intention is not fully performed.

Examples:
1. [Zoom out when returning to GPS position](https://github.com/IsraelHikingMap/Site/issues/828)
2. [Map-view flight to search result is canceled if POI pane is closed](https://github.com/IsraelHikingMap/Site/issues/1127)

### Definitions
- Map-view: the map center, zoom, rotation, and tilt values
- Map-view move: a SW-driven change from one map-view to another that uses constant zoom and position change rates.
- Map-view flight: a SW-driven change from one map-view to another that uses variable zoom and position change rates and a potential intermediate zoom-out to show both source and target positions.
- TBD: an open UX or design question

## Desired UX
Map-view changes, and flights in particular are driven by the following events, in this priority:
1. Direct user interaction with map: pan, zoom, and rotate
2. Flight resquests: search result selection, opening a share, and (if possible) address bar entry
3. GPS updates

If the map-view is following GPS updates, it will pause this following for 30 seconds after a higher priority event.

## Proposed design

The design describes a map-view controller that
- Submits map-view flights and moves
- Provides map-view information for the address bar
- Provides the rotation angle for the rotate button

### Interaction with the address-bar controller
The address bar controller is responsible for updating the address bar. 
It received updates from the map-view controller as well as other sources.
The address-bar controller stores the latest map-view information it received.
The address bar shows this map-view information only if a higher-priority address, such as a POI, is not shown.    
TBD: Can entering a position in address bar issue a flight request rather than a site reload?

### The map-view controller state
Includes the following:
- Map-view target: center, zoom and rotation angle
- Map-follow state: active, inactive
- Map-rotation state: active, inactive
- Pause expiration time

### Event-driven activity
#### Direct user interaction with map
UX: Map reflects to user's pan, zoom, rotate, and tilt gestures and mouse actions. On-going flights are interrupted. Future GPS-driven updates are paused for 30 seconds.

- Update the map-view target
- If the map rotation angle was changed
  - Inactivate the rotate button
  - Update the rotate button icon angle from the map-view target rotation angle
- Submit a map-view move
  - TBD: is this needed, or is it driven directly from the gestures?
- Set the pause expiration time to 30 seconds from now 
- Send an update event to the address bar controller

#### Flight resquest
UX: Flight requests are triggered by search result selection, clicking a POI or a trail, or opening a share.
The map view is changed according to the flight resuest target.
Future GPS-driven updates are paused until 30 seconds after flight completion.

- Update the map-view target position and zoom.
- Send an update event to the address bar controller.
- Submit a map-view flight.
  - TBD: Keep the map-rotation state or turn it North-up?
  - TBD: Keep the map tilt or turn it off?
- Set the pause expiration time to 30 seconds from now.

#### Map-view flight end event
UX: Future GPS-driven updates are paused until 30 seconds after flight completion.

- Set the pause expiration time to 30 seconds from now.

#### GPS update event
UX: GPS updates do not change the map view if not following or paused. Rotation icon is updated if rotation is active.

- If map-rotation is active, update the rotation icon angle
- If map-follow is active and pause expiration time has expired
  - Update the map-view target position from the GPS position
  - If roration is active, update the map-view rotation angle from the GPS bearing
  - Issue a map-view move
    - TBD: If the move distance is more than 1 Km, issue a map-view flight?
  - Send an update event to the address bar controller

#### Follow button event
UX: Activating the follow button during a flight or a movewill cause the next GPS update to interrupt it

- Copy the follow state from the button.
- If follow was activated, clear the pause expiration time.

#### Rotate button event
UX: Clicking the rotate button during a flight or a move does not interrupt it

- Copy the rotate state.

#### Zoom-in and zoom-out buttons
UX: Clicking the zoom buttons is considered a direct user interaction, as if the user performed a pinch action at the current location.
Map responds to user's zoom request. On-going flights are interrupted. Future GPS-driven updates are paused for 30 seconds.

- Update the map-view target with the current map center and the current zoom +/- 1.
- Set the pause expiration time to 30 seconds from now.
- Send an update event to the address bar controller.

## Notable differences from current UX
Currently, address bar changes are causing site reload.

## Notes
- An alternative design approach would be to include this functionality in a single "map and address-bar" controller.
- Map tilt is not stored.
- Cursor rotation was not described here.
