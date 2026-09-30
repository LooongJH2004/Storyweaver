import { defineConfig } from 'tsdown'

/** Bundle Director orchestration from declaration-build output. */
export default defineConfig({
  entry: [
    'lib/types/index.js',
    'lib/types/storybook.js',
    'lib/types/creator.js',
    'lib/types/director.js',
    'lib/types/invariant.js',
  ],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
