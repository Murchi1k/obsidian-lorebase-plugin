export const PROVIDER_REQUEST_TIMEOUT_MS = 45_000;

export class RequestTimeoutError extends Error {
    constructor() { super('Provider request timed out. Try again later.'); this.name = 'RequestTimeoutError'; }
}

/** Bounds the wait and rejects stale results; requestUrl itself cannot always be aborted. */
export function requestWithDeadline<T>(operation: () => PromiseLike<T>, timeout = PROVIDER_REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (failed: boolean, value: unknown): void => {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (failed) reject(value); else resolve(value as T);
        };
        const abort = (): void => { const error = new Error('Lorebase request was cancelled.'); error.name = 'AbortError'; finish(true, error); };
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => finish(true, new RequestTimeoutError()), timeout);
        try { Promise.resolve(operation()).then(value => finish(false, value), error => finish(true, error)); }
        catch (error) { finish(true, error); }
    });
}
