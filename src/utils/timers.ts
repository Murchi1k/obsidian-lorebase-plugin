// Background operations use the plugin window so a closed popout cannot cancel a request deadline.
export function scheduleTimeout(callback: () => void, delay: number): () => void {
    const host = window;
    const handle = host.setTimeout(callback, delay);
    return () => host.clearTimeout(handle);
}

export function scheduleInterval(callback: () => void, delay: number): () => void {
    const host = window;
    const handle = host.setInterval(callback, delay);
    return () => host.clearInterval(handle);
}
