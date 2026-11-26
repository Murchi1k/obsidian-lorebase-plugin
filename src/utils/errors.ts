export function asError(reason: unknown): Error {
    if (reason instanceof Error) return reason;
    return new Error(typeof reason === 'string' ? reason : 'Unexpected error');
}
