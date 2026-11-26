import { describe, expect, it, vi } from 'vitest';
import { CredentialStore } from '../src/services/CredentialStore';
import { DEFAULT_SETTINGS } from '../src/constants';

function storage() {
    const values = new Map<string, string>();
    return { values, getSecret: (id: string) => values.get(id) ?? null, setSecret: (id: string, secret: string) => { values.set(id, secret); } };
}

describe('CredentialStore', () => {
    it('migrates legacy plaintext without modifying runtime values and restores them on next load', async () => {
        const secrets = storage(); const store = new CredentialStore(secrets);
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.steamSync.apiKey = 'steam-key'; settings.anilistSync.accessToken = 'ani-token';
        settings.traktSync.refreshToken = 'trakt-refresh'; settings.music.lastfmApiKey = 'music-key';
        settings.integrations.providers.igdb.clientSecret = 'igdb-secret';
        let persisted: unknown;
        await store.save(settings, async data => { persisted = data; });
        const json = JSON.stringify(persisted);
        for (const secret of ['steam-key', 'ani-token', 'trakt-refresh', 'music-key', 'igdb-secret']) expect(json).not.toContain(secret);
        expect(settings.steamSync.apiKey).toBe('steam-key');
        const restored = new CredentialStore(secrets).restore(persisted) as typeof settings;
        expect(restored.steamSync.apiKey).toBe('steam-key');
        expect(restored.integrations.providers.igdb.clientSecret).toBe('igdb-secret');
        expect(restored.music.lastfmApiKey).toBe('music-key');
    });
    it('does not remove old credentials if JSON persistence fails during rotation', async () => {
        const secrets = storage(); const store = new CredentialStore(secrets);
        const settings = structuredClone(DEFAULT_SETTINGS); settings.anilistSync.accessToken = 'old';
        let persisted: unknown; await store.save(settings, async data => { persisted = data; });
        settings.anilistSync.accessToken = 'new';
        await expect(store.save(settings, async () => { throw new Error('Disk full'); })).rejects.toThrow(/previous saved settings/);
        expect((new CredentialStore(secrets).restore(persisted) as typeof settings).anilistSync.accessToken).toBe('old');
        expect([...secrets.values.values()]).not.toContain('new');
    });
    it('clears rotated/disconnected secrets only after settings were saved successfully', async () => {
        const secrets = storage(); const store = new CredentialStore(secrets);
        const settings = structuredClone(DEFAULT_SETTINGS); settings.traktSync.accessToken = 'old-token';
        await store.save(settings, async () => {});
        settings.traktSync.accessToken = 'new-token'; await store.save(settings, async () => {});
        expect([...secrets.values.values()]).not.toContain('old-token');
        settings.traktSync.accessToken = ''; await store.save(settings, async () => {});
        expect([...secrets.values.values()]).not.toContain('new-token');
    });
    it('serializes overlapping saves so the latest token wins without leaking plaintext', async () => {
        const secrets = storage(); const store = new CredentialStore(secrets);
        const settings = structuredClone(DEFAULT_SETTINGS); const outputs: unknown[] = [];
        settings.anilistSync.accessToken = 'first'; const first = store.save(settings, async data => { outputs.push(data); });
        settings.anilistSync.accessToken = 'second'; const second = store.save(settings, async data => { outputs.push(data); });
        await Promise.all([first, second]);
        expect((new CredentialStore(secrets).restore(outputs[1]) as typeof settings).anilistSync.accessToken).toBe('second');
        expect(JSON.stringify(outputs)).not.toContain('second');
    });
    it('retains legacy behavior explicitly on Obsidian without Secret Storage', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS); settings.steamSync.apiKey = 'legacy-key';
        let persisted: unknown; await new CredentialStore().save(settings, async data => { persisted = data; });
        expect((persisted as typeof settings).steamSync.apiKey).toBe('legacy-key');
    });
    it('preserves references when the device cannot unlock a previously saved secret', async () => {
        const id = 'lorebase-credential-aabb-1234';
        const settings = { anilistSync: { accessToken: '' }, credentialRefs: { 'anilistSync.accessToken': id } };
        const secrets = storage(); const store = new CredentialStore(secrets);
        const restored = store.restore(settings); let persisted: unknown;
        await store.save(restored, async data => { persisted = data; });
        expect((persisted as typeof settings).credentialRefs['anilistSync.accessToken']).toBe(id);
    });
    it('never falls back to a plaintext write when Secret Storage fails', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS); settings.steamSync.apiKey = 'do-not-leak';
        const persist = vi.fn();
        await expect(new CredentialStore({ getSecret: () => null, setSecret: () => { throw new Error('Locked'); } }).save(settings, persist)).rejects.toThrow(/securely/);
        expect(persist).not.toHaveBeenCalled();
    });
});
