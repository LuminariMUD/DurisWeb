# Notification Sounds

The notification composable first tries `/sounds/notification.mp3` at 50%
volume. This repository does not currently include that asset. When the file is
missing or browser playback rejects it, `useNotifications.ts` falls back to a
short Web Audio API beep.

To supply a custom sound, add `notification.mp3` in this directory. Keep it
short and normalized; the browser may still block playback until the user has
interacted with the page.
