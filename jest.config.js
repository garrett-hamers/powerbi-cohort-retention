module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  collectCoverageFrom: ["src/**/*.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 60,
      functions: 80,
      lines: 80
    }
  }
};
