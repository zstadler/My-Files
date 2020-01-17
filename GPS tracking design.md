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
2. Focus-change resquests: search result selection, opening a share, and address bar entry (if possible)
3. GPS position and bearing updates

If the map-view is following the GPS, it will pause when a higher priority event occurs and resume 30 seconds after
the completion the user interactions or the focus change.

## Proposed design

The design proposed an object, a map-view controller, that
- Controls the the map-view and flights
- Provides map-view information for the address bar
- Provides the Rotation angle for the rotate button

The controller state includes the following:
- Current map-view
- Map-view flight target
- Map rotation flag: Inactive, Rotating, North-
- User activity flag
- Flight activity flag
