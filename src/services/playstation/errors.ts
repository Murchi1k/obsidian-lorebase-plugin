export type PsnAuthStage = 'authorization' | 'token' | 'identity' | 'profile' | 'played' | 'trophies' | 'purchases';

// Keep diagnostics limited to a known error code, step and HTTP status.
// Sony response bodies and credentials must never appear in UI errors.
export class PsnApiError extends Error {
    constructor(code: string, readonly stage?: PsnAuthStage, readonly status?: number) {
        super(code);
        this.name = 'PsnApiError';
    }
}
