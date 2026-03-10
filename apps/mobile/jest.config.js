module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-fs$': '<rootDir>/__mocks__/react-native-fs.js',
    '^react-native-share$': '<rootDir>/__mocks__/react-native-share.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-keychain|react-native-fs|react-native-share|react-native-vector-icons|react-native-image-picker)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  collectCoverageFrom: [
    'src/application/**/*.{ts,tsx}',
    'src/infra/**/*.{ts,tsx}',
    'src/presentation/navigation/**/*.{ts,tsx}',
    '!src/**/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
