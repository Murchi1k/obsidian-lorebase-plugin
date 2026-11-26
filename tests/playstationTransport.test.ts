import { describe, expect, it, vi } from 'vitest';
import { buildSync } from 'esbuild';
import { Script, createContext } from 'node:vm';
import { EventEmitter } from 'node:events';

// Obsidian evaluates CommonJS plugins without a dynamic-import callback.
// Test the bundled transport there, rather than injecting the entire PSN request.
describe('PlayStation transport in the Obsidian plugin loader', () => {
    it('reads the Sony redirect through a CommonJS HTTPS module without dynamic import or a real credential', async () => {
        const compiled = buildSync({ entryPoints: ['src/services/playstation/api.ts'], bundle: true, write: false,
            platform: 'node', format: 'cjs', target: 'es2018', external: ['https', 'obsidian'] }).outputFiles[0].text;
        const resume = vi.fn(), sent = vi.fn();
        const request = vi.fn((_url: string, _options: unknown, respond: (value: unknown) => void) => {
            const req = new EventEmitter() as EventEmitter & { end: () => void; setTimeout: () => void; destroy: (error: Error) => void };
            req.setTimeout = vi.fn();
            req.destroy = error => { req.emit('error', error); req.emit('close'); };
            req.end = () => { sent(); queueMicrotask(() => {
                respond({ statusCode: 302, headers: { location: 'com.scee.psxandroid.scecompcall://redirect/?code=test-code' }, resume });
                req.emit('close');
            }); };
            return req;
        });
        const exports = {}, module = { exports };
        const context = createContext({ module, exports, process: { versions: { node: 'test' } },
            AbortController, DOMException, URL, URLSearchParams, setTimeout, clearTimeout,
            require: (name: string) => {
                if (name === 'https') return { request };
                if (name === 'obsidian') return { requestUrl: () => { throw Error('Unexpected requestUrl call'); } };
                throw Error('Unexpected module ' + name);
            } });
        new Script(compiled).runInContext(context);
        const result = await (module.exports as any).psnRequest('https://ca.account.sony.com/api/authz/v3/oauth/authorize',
            new AbortController().signal, { redirect: false, headers: { Cookie: 'npsso=test-placeholder' } });
        expect(result).toMatchObject({ status: 302, headers: { location: 'com.scee.psxandroid.scecompcall://redirect/?code=test-code' } });
        expect(request).toHaveBeenCalledOnce(); expect(sent).toHaveBeenCalledOnce(); expect(resume).toHaveBeenCalledOnce();
    });
});
