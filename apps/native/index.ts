// The app's entry. The work the system wakes the app for is defined as the bundle loads, before
// the router, since the system may wake it with no screen drawn: the hourly task that writes the
// widgets (decision 074). Then the router, which draws the screens of src/app.
import "./src/widgets/background";
import "expo-router/entry";
