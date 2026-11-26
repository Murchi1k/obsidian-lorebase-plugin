import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
// Regression checks for data integrity, credentials, AniList and provider deadlines.
export default defineConfig({test:{environment:'node',include:['tests/dataIntegrity.test.ts','tests/aniListSyncService.test.ts','tests/credentialStore.test.ts','tests/requestDeadline.test.ts']},resolve:{alias:{obsidian:resolve('tests/mocks/obsidian.ts')}}});
