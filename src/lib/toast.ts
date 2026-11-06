import { Alert, Platform, ToastAndroid } from 'react-native';

// A short confirmation ("You're signed in"), like the website's toasts.
// Android: the system toast. iOS has none built in: a brief alert instead,
// only for messages that carry information (not plain confirmations).
export function toast(
  message: string,
  { important = false }: { important?: boolean } = {},
) {
  if (Platform.OS === 'android')
    ToastAndroid.show(
      message,
      message.length > 60 ? ToastAndroid.LONG : ToastAndroid.SHORT,
    );
  else if (important) Alert.alert(message);
}
