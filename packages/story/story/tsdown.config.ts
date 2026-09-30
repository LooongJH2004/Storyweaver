import { defineConfig } from 'tsdown'

/** Build the Story service and its invariant companion as independent bundles. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/dynamic-state.js', 'lib/types/style.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    entry: ['lib/types/invariant.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
