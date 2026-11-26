import { requireApiVersion, type App } from 'obsidian';

type RecordValue = Record<string, unknown>;
type Storage = {
    getSecret(id: string): string | null;
    setSecret(id: string, secret: string): void;
};

export function getSecretStorage(app: Pick<App, 'secretStorage'>): Storage | undefined {
    if (!requireApiVersion('1.11.4')) return;
    return app.secretStorage;
}
const record = (value: unknown): value is RecordValue => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const fixedPaths = ['steamSync.apiKey', 'anilistSync.accessToken', 'traktSync.accessToken', 'traktSync.refreshToken', 'music.lastfmApiKey'];

function credentialPaths(settings: RecordValue): string[] {
    const paths = [...fixedPaths];
    const integrations = record(settings.integrations) ? settings.integrations : {};
    const providers = record(integrations.providers) ? integrations.providers : {};
    for (const provider of Object.keys(providers)) {
        if (!/^[a-z0-9_-]+$/i.test(provider)) continue;
        paths.push(`integrations.providers.${provider}.apiKey`, `integrations.providers.${provider}.clientSecret`);
    }
    return paths;
}

function location(settings: RecordValue, path: string): { parent: RecordValue; key: string } | undefined {
    const parts = path.split('.'); let parent = settings;
    for (const key of parts.slice(0, -1)) { if (!record(parent[key])) return; parent = parent[key]; }
    return { parent, key: parts[parts.length - 1] };
}

/** Keeps runtime credentials usable while persisting only Secret Storage references. */
export class CredentialStore {
    private refs: Record<string, string> = {};
    private unresolved = new Set<string>();
    private writes: Promise<void> = Promise.resolve();
    constructor(private readonly storage?: Storage) {}

    restore(value: unknown): unknown {
        if (!record(value)) return value;
        const settings = structuredClone(value);
        const saved = record(settings.credentialRefs) ? settings.credentialRefs : {};
        const paths = credentialPaths(settings);
        for (const path of paths) {
            const id = saved[path];
            if (typeof id !== 'string' || !/^lorebase-credential-[a-f0-9-]+$/.test(id)) continue;
            this.refs[path] = id;
            const target = location(settings, path);
            if (!target || typeof target.parent[target.key] === 'string' && target.parent[target.key]) continue;
            let secret: string | null = null;
            try { secret = this.storage?.getSecret(id) ?? null; } catch { /* Keep references when this device cannot unlock them. */ }
            if (secret) target.parent[target.key] = secret;
            else this.unresolved.add(path);
        }
        return settings;
    }

    save(value: unknown, persist: (data: unknown) => Promise<void>): Promise<void> {
        // Capture each caller's state now, then serialize secret rotation and JSON writes.
        const snapshot: unknown = structuredClone(value);
        const operation = this.writes.catch(() => undefined).then(async () => {
            if (!record(snapshot)) { await persist(snapshot); return; }
            if (!this.storage) {
                // Older Obsidian retains its existing settings-based credentials; it is not encrypted.
                if (Object.keys(this.refs).length) snapshot.credentialRefs = { ...this.refs };
                await persist(snapshot); return;
            }
            const refs = { ...this.refs }; const created: string[] = [];
            try {
                for (const path of credentialPaths(snapshot)) {
                    const target = location(snapshot, path);
                    if (!target) continue;
                    const secret = typeof target.parent[target.key] === 'string' ? target.parent[target.key] as string : '';
                    const previous = refs[path];
                    if (secret) {
                        if (!previous || this.storage.getSecret(previous) !== secret) {
                            const id = 'lorebase-credential-' + crypto.randomUUID();
                            this.storage.setSecret(id, secret); created.push(id);
                            if (this.storage.getSecret(id) !== secret) throw new Error('Credential storage verification failed.');
                            refs[path] = id;
                        }
                        this.unresolved.delete(path);
                    } else if (!this.unresolved.has(path)) delete refs[path];
                    target.parent[target.key] = '';
                }
                snapshot.credentialRefs = refs;
                await persist(snapshot);
            } catch {
                for (const id of created) { try { this.storage.setSecret(id, ''); } catch { /* Do not replace the original save error. */ } }
                throw new Error('Could not save credentials securely. The previous saved settings were retained.');
            }
            const previousRefs = this.refs;
            this.refs = refs;
            for (const id of Object.values(previousRefs)) {
                if (!Object.values(refs).includes(id)) { try { this.storage.setSecret(id, ''); } catch { /* Rotation succeeded; cleanup can be retried later. */ } }
            }
        });
        this.writes = operation;
        return operation;
    }
}

