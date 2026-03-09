import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { setBackgroundMessageHandler } from './src/infra/notification/firebase-messaging';

// Must be called outside of any component — registers the headless JS task
setBackgroundMessageHandler();

AppRegistry.registerComponent(appName, () => App);
