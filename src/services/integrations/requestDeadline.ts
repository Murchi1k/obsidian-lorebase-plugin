import { scheduleTimeout } from '../../utils/timers';

export const PROVIDER_REQUEST_TIMEOUT_MS = 45_000;

export class RequestTimeoutError extends Error {
    constructor() { super('Provider request timed out. Try again later.'); this.name = 'RequestTimeoutError'; }
}

function abortError(): Error {
    const error = new Error('Lorebase request was cancelled.');
    error.name = 'AbortError';
    return error;
}

/** Bounds the wait and rejects stale results; requestUrl itself cannot always be aborted. */
export async function requestWithDeadline<T>(operation: () => PromiseLike<T>, timeout = PROVIDER_REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError();

    let cancelTimer: (() => void) | undefined;
    let abort: (() => void) | undefined;
    const deadline = new Promise<never>((_, reject) => {
        abort = () => reject(abortError());
        signal?.addEventListener('abort', abort, { once: true });
        cancelTimer = scheduleTimeout(() => reject(new RequestTimeoutError()), timeout);
    });
    // Invoke the transport immediately, forwarding even an empty rejection.
    const run = async (): Promise<T> => operation();
    try {
        return await Promise.race([run(), deadline]);
    } finally {
        cancelTimer?.();
        if (abort) signal?.removeEventListener('abort', abort);
    }
}
