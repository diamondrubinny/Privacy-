import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Self-contained bundle: only playwright-core (tied to the browser build) stays external.
  noExternal: [/^@privacyscan\//, 'zod', 'tldts', 'ipaddr.js'],
  external: ['playwright-core'],
});
