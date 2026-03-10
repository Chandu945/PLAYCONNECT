const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const appDirectory = __dirname;
const rootDirectory = path.resolve(appDirectory, '../..');

module.exports = {
  entry: path.resolve(appDirectory, 'index.web.js'),

  output: {
    path: path.resolve(appDirectory, 'dist'),
    filename: 'bundle.js',
    publicPath: '/',
  },

  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
    alias: {
      'react-native$': 'react-native-web',
      'react-native-keychain': path.resolve(appDirectory, 'web/stubs/react-native-keychain.js'),
      'react-native-fs': path.resolve(appDirectory, 'web/stubs/react-native-fs.js'),
      'react-native-share': path.resolve(appDirectory, 'web/stubs/react-native-share.js'),
      '@react-native-firebase/messaging': path.resolve(appDirectory, 'web/stubs/react-native-firebase-messaging.js'),
      '@react-native-firebase/app': path.resolve(appDirectory, 'web/stubs/react-native-firebase-app.js'),
    },
    modules: [
      path.resolve(appDirectory, 'node_modules'),
      path.resolve(rootDirectory, 'node_modules'),
      'node_modules',
    ],
  },

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules\/(?!(react-native-web|react-native-safe-area-context|react-native-screens|react-native-gesture-handler|react-native-image-picker|react-native-vector-icons|@react-native|@react-navigation)\/).*/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@react-native/babel-preset'],
            plugins: ['react-native-web'],
          },
        },
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/,
        type: 'asset/resource',
      },
    ],
  },

  plugins: [
    new webpack.DefinePlugin({
      __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
      process: { env: {} },
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(appDirectory, 'web/index.html'),
    }),
  ],

  devServer: {
    port: 3000,
    historyApiFallback: true,
    hot: true,
    static: {
      directory: path.resolve(appDirectory, 'web'),
    },
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    ],
  },
};
