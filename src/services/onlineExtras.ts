import { onlineExtrasText } from '../localization/onlineExtras';

let enabled = true;
let generation = 0;
const listeners = new Set<(enabled: boolean) => void>();
const pending = new Set<(error: OnlineExtrasDisabledError) => void>();

export class OnlineExtrasDisabledError extends Error {
    constructor() { super(onlineExtrasText('disabled')); this.name = 'OnlineExtrasDisabledError'; }
}
export function areOnlineExtrasEnabled(): boolean { return enabled; }
export function assertOnlineExtras(): void { if (!enabled) throw new OnlineExtrasDisabledError(); }

export function onOnlineExtrasChange(listener: (enabled: boolean) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function configureOnlineExtras(value: boolean): void {
    if (enabled === value) return;
    enabled = value;
    generation++;
    if (!enabled) for (const reject of [...pending]) reject(new OnlineExtrasDisabledError());
    for (const listener of [...listeners]) listener(enabled);
}

/** Only optional discovery/media calls use this boundary. Catalogs and sync do not. */
export async function runOnlineExtra<T>(operation: () => PromiseLike<T>): Promise<T> {
    assertOnlineExtras();
    const session = generation;
    let disable: ((error: OnlineExtrasDisabledError) => void) | undefined;
    const disabled = new Promise<never>((_, reject) => {
        disable = (error) => reject(error);
        pending.add(disable);
    });
    const run = async (): Promise<T> => operation();
    try {
        const value = await Promise.race([run(), disabled]);
        if (!enabled || session !== generation) throw new OnlineExtrasDisabledError();
        return value;
    } finally {
        if (disable) pending.delete(disable);
    }
}

export function readOnlineExtrasPreference(value: Record<string, unknown>): boolean {
    return typeof value.onlineExtrasEnabled === 'boolean' ? value.onlineExtrasEnabled : value.offlineMode !== true;
}
