import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
// Must be called outside of any component — registers the headless JS task
try {
  const { setBackgroundMessageHandler } = require('./src/infra/notification/firebase-messaging');
  setBackgroundMessageHandler();
} catch (_e) {
  // Firebase messaging not available — notifications disabled
}

AppRegistry.registerComponent(appName, () => App);
