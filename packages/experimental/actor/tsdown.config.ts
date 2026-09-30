import { defineConfig } from 'tsdown'

/** Build the service and its invariant companion as independent bundles. */
export default defineConfig([
  {
    entry: ['lib/types/execution-model.js', 'lib/types/index.js', 'lib/types/narrative-executor.js', 'lib/types/request-history.js', 'lib/types/director-executor.js'],
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
