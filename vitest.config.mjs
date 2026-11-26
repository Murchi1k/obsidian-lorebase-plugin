import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['tests/helpers/obsidianEnvironment.ts'],
        include: ['tests/**/*.test.ts'],
    },
    resolve: {
        alias: {
            obsidian: resolve(process.cwd(), 'tests/mocks/obsidian.ts'),
        },
    },
});
