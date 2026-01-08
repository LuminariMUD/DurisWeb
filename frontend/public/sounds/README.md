# Notification Sounds

## Required File

Place a notification sound file named `notification.mp3` in this directory.

### Recommendations:
- **Duration**: 0.5 - 2 seconds (short and non-intrusive)
- **Format**: MP3 (best browser compatibility)
- **Volume**: Normalized/moderate (the app will play at 50% volume)
- **Style**: Subtle alert sound (e.g., bell, chime, soft beep)

### Suggested Sounds:
- Sword clash/metal clang (fits PvP theme)
- Bell/chime
- Short notification beep
- Trumpet fanfare

### Free Sound Resources:
- https://freesound.org/ (search: "notification", "bell", "sword")
- https://mixkit.co/free-sound-effects/notification/
- https://pixabay.com/sound-effects/search/notification/

### Alternative: Use Web Audio API

If you don't want to add a file, the app will fail silently and notifications will work without sound.

You can also generate a simple beep using Web Audio API by modifying the `playNotificationSound()` function in `useNotifications.ts`:

```typescript
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800 // 800 Hz
    gainNode.gain.value = 0.3 // 30% volume

    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.2) // 200ms beep
  } catch (error) {
    console.debug('Error playing notification sound:', error)
  }
}
```
