import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Node-environment unit tests (server actions, validators, DTO mappers).
// Storybook browser tests stay in vitest.config.ts.
export default defineConfig({
  resolve: {
    alias: { '@': path.join(dirname, 'src') },
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
