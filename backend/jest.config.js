module.exports = {
  testEnvironment: "node",
  testMatch: ["**/src/**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, diagnostics: { ignoreCodes: [151002] } }],
  },
};
