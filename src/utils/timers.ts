// Background operations use the plugin window so a closed popout cannot cancel a request deadline.
function timerHost(start: 'setTimeout' | 'setInterval', stop: 'clearTimeout' | 'clearInterval'): typeof globalThis {
    if (typeof window !== 'undefined' && typeof window[start] === 'function' && typeof window[stop] === 'function') return window;
    return globalThis;
}

export function scheduleTimeout(callback: () => void, delay: number): () => void {
    const host = timerHost('setTimeout', 'clearTimeout');
    const handle = host.setTimeout(callback, delay);
    return () => host.clearTimeout(handle);
}

export function scheduleInterval(callback: () => void, delay: number): () => void {
    const host = timerHost('setInterval', 'clearInterval');
    const handle = host.setInterval(callback, delay);
    return () => host.clearInterval(handle);
}
