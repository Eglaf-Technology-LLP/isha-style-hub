import { Platform, Vibration } from 'react-native';

// A very short buzz for presses (tabs, size picks, add to bag). Android only:
// iOS has no short vibration without a native haptics module.
export const tap = () => {
  if (Platform.OS === 'android') Vibration.vibrate(8);
};
export const success = () => {
  if (Platform.OS === 'android') Vibration.vibrate([0, 12, 60, 12]);
};
