module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  // src/visual.ts imports style/visual.less for its webpack side effect. Jest has no
  // loader chain, so the import resolves to an inert stub.
  moduleNameMapper: {
    "\\.less$": "<rootDir>/tests/style-stub.js"
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"]
};
