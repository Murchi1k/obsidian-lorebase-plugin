import { onlineExtrasText } from '../localization/onlineExtras';

let enabled = true;
let generation = 0;
const listeners = new Set<(enabled: boolean) => void>();
const pending = new Set<(error: unknown) => void>();

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
export function runOnlineExtra<T>(operation: () => PromiseLike<T>): Promise<T> {
    const session = generation;
    return new Promise<T>((resolve, reject) => {
        const fail = (error: unknown): void => { pending.delete(fail); reject(error); };
        try { assertOnlineExtras(); } catch (error) { fail(error); return; }
        pending.add(fail);
        try {
            assertOnlineExtras();
            if (session !== generation) throw new OnlineExtrasDisabledError();
            Promise.resolve(operation()).then(value => {
                pending.delete(fail);
                if (!enabled || session !== generation) reject(new OnlineExtrasDisabledError());
                else resolve(value);
            }, fail);
        } catch (error) { fail(error); }
    });
}

export function readOnlineExtrasPreference(value: Record<string, unknown>): boolean {
    return typeof value.onlineExtrasEnabled === 'boolean' ? value.onlineExtrasEnabled : value.offlineMode !== true;
}
