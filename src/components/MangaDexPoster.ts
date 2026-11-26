import { fetchBinary } from '../services/integrations/shared';

type Consumer = { resolve: (blob: Blob) => void; reject: (error: unknown) => void; signal: AbortSignal; abort: () => void };
type Task = { source: string; consumers: Set<Consumer> };
const cache = new Map<string, Blob>();
const pending = new Map<string, Task>();
const queue: Task[] = [];
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_CACHE_ITEMS = 64;
let cacheBytes = 0;
let running = false;

function remember(source: string, blob: Blob): void {
    if (blob.size > MAX_CACHE_BYTES) return;
    cache.set(source, blob);
    cacheBytes += blob.size;
    while (cacheBytes > MAX_CACHE_BYTES || cache.size > MAX_CACHE_ITEMS) {
        const oldest = cache.keys().next().value!;
        cacheBytes -= cache.get(oldest)!.size;
        cache.delete(oldest);
    }
}

async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
        while (queue.length) {
            const task = queue.shift()!;
            // Skip recycled offscreen cards before they enter the provider's
            // rate-limited request queue. Share requests for duplicate covers.
            if (!task.consumers.size) { pending.delete(task.source); continue; }
            try {
                const response = await fetchBinary(task.source);
                const type = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || 'image/jpeg';
                const blob = new Blob([response.arrayBuffer], { type });
                remember(task.source, blob);
                for (const consumer of task.consumers) consumer.resolve(blob);
            } catch (error) {
                for (const consumer of task.consumers) consumer.reject(error);
            } finally {
                for (const consumer of task.consumers) consumer.signal.removeEventListener('abort', consumer.abort);
                pending.delete(task.source);
            }
        }
    } finally { running = false; }
}

/** Bounded binary cache; individual cards own and revoke their object URLs. */
export function loadMangaDexPoster(source: string, signal: AbortSignal): Promise<Blob> {
    if (signal.aborted) return Promise.reject(new DOMException('Poster cancelled', 'AbortError'));
    const saved = cache.get(source);
    if (saved) {
        cache.delete(source); cache.set(source, saved);
        return Promise.resolve(saved);
    }
    let task = pending.get(source);
    if (!task) {
        task = { source, consumers: new Set() };
        pending.set(source, task);
        queue.push(task);
    }
    const current = task;
    return new Promise((resolve, reject) => {
        const consumer: Consumer = { resolve, reject, signal, abort: () => {
            current.consumers.delete(consumer);
            reject(new DOMException('Poster cancelled', 'AbortError'));
        } };
        current.consumers.add(consumer);
        signal.addEventListener('abort', consumer.abort, { once: true });
        queueMicrotask(() => { void drain(); });
    });
}
