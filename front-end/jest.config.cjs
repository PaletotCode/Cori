module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^@shopify/flash-list$": "<rootDir>/tests/mocks/flashList.tsx",
    "^@expo/vector-icons$": "<rootDir>/tests/mocks/expoVectorIcons.tsx",
    "^expo-clipboard$": "<rootDir>/tests/mocks/expoClipboard.ts",
    "^@react-navigation/native$": "<rootDir>/tests/mocks/reactNavigationNative.ts",
    "^expo-router$": "<rootDir>/tests/mocks/expoRouter.ts",
    "^react-native-reanimated$": "<rootDir>/tests/mocks/reactNativeReanimated.ts",
  },
  clearMocks: true,
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
};
