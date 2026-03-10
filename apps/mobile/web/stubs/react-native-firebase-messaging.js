// Web stub for @react-native-firebase/messaging
const noop = () => {};
const noopReturn = () => noop;

const messaging = () => ({
  requestPermission: async () => -1,
  getToken: async () => null,
  onTokenRefresh: noopReturn,
  onMessage: noopReturn,
  onNotificationOpenedApp: noopReturn,
  getInitialNotification: async () => null,
  setBackgroundMessageHandler: noop,
});

messaging.AuthorizationStatus = {
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  NOT_DETERMINED: -1,
  DENIED: 0,
};

module.exports = messaging;
module.exports.default = messaging;
