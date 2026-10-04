/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/src/**/*.test.ts"],
  // The generated Prisma client (generated/prisma/client.ts) is genuinely ESM-only — it uses
  // `import.meta.url` to resolve __dirname, which has no CommonJS equivalent at all. `tsx`
  // (used for dev/the real app) handles mixed CJS/ESM transparently; Jest's module system
  // does not unless told to run its whole import graph as ESM. Run via `node
  // --experimental-vm-modules` (see the `test` script) for this to take effect.
  extensionsToTreatAsEsm: [".ts"],
  // NodeNext-style relative imports use a `.js` extension even though the source is `.ts`
  // (correct once `tsc` compiles it; the generated Prisma client's internal imports are
  // written this way too) — Jest's ESM resolver needs this mapped back to find the real
  // `.ts` file, since it has no build step of its own.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    // diagnostics.ignoreCodes 151002 silences a noisy (and here harmless) ts-jest warning
    // repeated once per compiled file about "nodenext" needing `isolatedModules: true` in
    // tsconfig.json — moot since ts-jest already runs isolated per-file under `useESM`.
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, diagnostics: { ignoreCodes: [151002] } }],
  },
};
