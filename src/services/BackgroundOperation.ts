import { requestWithDeadline } from './integrations/requestDeadline';

export function isOperationCancelled(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

/** Owns only this service's work; closing it never changes another service's transport. */
export class OperationLifetime {
    private readonly lifetime = new AbortController();
    dispose(): void { this.lifetime.abort(); }
    begin(identity: () => string = () => '', parent?: AbortSignal, cancelled?: () => boolean, expectedIdentity?: string): BackgroundOperation {
        return new BackgroundOperation(identity, [this.lifetime.signal, ...(parent ? [parent] : [])], cancelled, expectedIdentity);
    }
}

/** A captured identity plus a signal protects every asynchronous boundary and write callback. */
export class BackgroundOperation {
    private readonly controller = new AbortController();
    private readonly initial: string;
    private readonly detach: Array<() => void> = [];
    readonly signal = this.controller.signal;
    constructor(private readonly identity: () => string, parents: readonly AbortSignal[], private readonly cancelled?: () => boolean, expectedIdentity?: string) {
        this.initial = expectedIdentity ?? identity();
        for (const parent of parents) {
            const abort = (): void => this.controller.abort();
            parent.addEventListener('abort', abort, { once: true });
            this.detach.push(() => parent.removeEventListener('abort', abort));
            if (parent.aborted) abort();
        }
    }
    check = (): void => {
        if (!this.signal.aborted) {
            try { if (this.cancelled?.() || this.identity() !== this.initial) this.controller.abort(); }
            catch { this.controller.abort(); }
        }
        if (this.signal.aborted) { const error = new Error('The operation was cancelled or its account/settings changed.'); error.name = 'AbortError'; throw error; }
    };
    async wait<T>(work: () => PromiseLike<T>): Promise<T> {
        this.check();
        // Detect in-place account edits while a transport is still pending, without logging identity values.
        const timer = setInterval(() => { try { this.check(); } catch { /* check aborts the waiting promise */ } }, 100);
        try { const value = await requestWithDeadline(work, undefined, this.signal); this.check(); return value; }
        finally { clearInterval(timer); }
    }
    close(): void { this.detach.splice(0).forEach(remove => remove()); this.controller.abort(); }
}
