# Map-View Movements Design

## Problem Description
In order to create a  pleasant UX, some map focus changes are using flight-like move which may take a few seconds.
In some scenarios such flight is interrupted and the original user intention is not fully performed.

Examples:
1. [Zoom out when returning to GPS position](https://github.com/IsraelHikingMap/Site/issues/828)
2. [Map-view flight to search result is canceled if POI pane is closed](https://github.com/IsraelHikingMap/Site/issues/1127)

### Definition
- Map-view: the map center, zoom, rotation, and tilt values
- Map-view flight: the process of SW-driven change from one map-view to another
## Desired UX
Map-view changes, and flights in particular need to be driven only from specific events, in the following priority:
1. Direct user interaction with map: pan, zoom, and rotate
2. Flight resquests: search result selection, opening a share, and (if possible) address bar entry
3. GPS updates

If the map-view is following the GPS, it will pause when a higher priority event occurs and resume 30 seconds after
the completion the user interactions or the focus change.

## Proposed design

The design proposed an object, a map-view controller, that
- Controls the the map-view and flights
- Provides map-view information for the address bar
- Provides the Rotation angle for the rotate button

### Interaction with the address-bar controller
The address bar controller is responsible for updating the address bar. 
It received updates from the map-view controller.
When an address of an OSM element is shown, the update are stored but not shown.
When such a higher-priority address is no longer shown, the address bar controller will show the latest map view info it received.

### The map-view controller state
Includes the following:
- map-view target: center position, zoom and rotation angle
- Following button's state: active, inactive
- Rotation button's state: active, inactive
- Pause expiration time

### Event-driven activity
#### Direct user interaction with map
- Update the map-view target
- Send an update event to the address bar controller
- Issue a simple-style map move
  - TBD: is this needed?
- Set the pause expiration time to 30 seconds from now 

#### Flight resquest
- Update the current map center position, zoom
- Send an update event to the address bar controller
- Issue a flight-style map move
  - TBD: Keep the map rotation or turn it North-up?
  - TBD: Keep the map tilt or turn it off?
- Set the pause expiration time to 30 seconds from now 

#### Flight end event
- Set the pause expiration time to 30 seconds from now 

#### GPS update event
- Ignore if the following button is inactive
- Ignore if the following pause expiration time was not reached
- Update the map center position
- If roration button is active, update the rotation angle
- Issue a map move to the desired position, zoom, and rotation
  - If the distance between the current map center and the target is more than 1000 meters issue a flight-style map move
  - Otherwise, use a simple move
- Send an update event to the address bar controller

#### Follow button event
- Copy the follow state
- Clear the pause expiration time

#### Rotate button event
- Copy the rotate state

#### Zoom-in and zoom-out buttons
[//]: # (Consider zoom-button click while flight is active)
Clicking on the zoom buttons is considered like a direct user interaction, as if the user performed a pinch action at the current location

## Notable differences from current UX
- Direct user interaction with the map while flight is acive

## Notes
- An alternative design approach would be to include this functionality in the address-bar controller.
- Map tilt is not stored
