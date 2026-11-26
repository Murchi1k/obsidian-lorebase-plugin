import { App, Modal, setIcon } from 'obsidian';
import { tt, traktError } from '../localization/trakt';
import type { TraktSyncService } from '../services/TraktSyncService';
import type { TraktSyncSettings } from '../services/trakt/types';

export class TraktLoginModal extends Modal {
    private controller = new AbortController();
    private resolve?: (value: TraktSyncSettings | null) => void;
    private settled = false;
    constructor(app: App, private service: TraktSyncService) { super(app); }
    openAndGetValue(): Promise<TraktSyncSettings | null> { return new Promise(resolve => { this.resolve = resolve; this.open(); }); }
    onOpen(): void { this.modalEl.addClass('lorebase-trakt-login-container'); this.contentEl.addClass('lorebase-trakt-login'); void this.start(); }
    onClose(): void { this.controller.abort(); this.finish(null); this.contentEl.empty(); }
    private finish(value: TraktSyncSettings | null): void { if (this.settled) return; this.settled = true; this.resolve?.(value); if (value) this.close(); }
    private async start(): Promise<void> {
        const root = this.contentEl; root.empty();
        const heading = root.createDiv({ cls: 'lorebase-trakt-header' });
        setIcon(heading.createSpan({ cls: 'lorebase-trakt-header-icon', attr: { 'aria-hidden': 'true' } }), 'link');
        const title = heading.createDiv(); title.createEl('h2', { text: tt('connect') }); title.createDiv({ cls: 'lorebase-trakt-message', text: tt('loginHint') });
        const status = root.createDiv({ cls: 'lorebase-trakt-waiting', attr: { role: 'status' } });
        const waiting = (message: string) => { status.empty(); setIcon(status.createSpan({ cls: 'lorebase-trakt-spinner', attr: { 'aria-hidden': 'true' } }), 'loader-circle'); status.createSpan({ text: message }); };
        const fail = (message: string) => {
            status.empty(); status.addClass('is-error'); setIcon(status.createSpan({ attr: { 'aria-hidden': 'true' } }), 'circle-alert'); status.createSpan({ text: message });
            const retry = root.createDiv({ cls: 'lorebase-trakt-actions' }).createEl('button', { cls: 'lorebase-trakt-button', text: tt('newCode'), attr: { type: 'button' } }); retry.addEventListener('click', () => void this.start());
        };
        waiting(tt('loading'));
        try {
            const login = await this.service.beginLogin(this.controller.signal); if (this.controller.signal.aborted) return;
            const url = new URL(login.url);
            if (url.protocol !== 'https:' || !['trakt.tv', 'app.trakt.tv', 'auth.trakt.tv'].includes(url.hostname) || url.username || url.password) throw new Error('TRAKT_INVALID_CODE');
            const steps = root.createDiv({ cls: 'lorebase-trakt-login-steps' });
            const activation = steps.createDiv({ cls: 'lorebase-trakt-login-step' }); activation.createSpan({ cls: 'lorebase-trakt-step-number', text: '1', attr: { 'aria-hidden': 'true' } });
            const activationCopy = activation.createDiv({ cls: 'lorebase-trakt-step-copy' }); activationCopy.createEl('strong', { text: tt('activateStep') }); activationCopy.createDiv({ cls: 'lorebase-trakt-address', text: `${url.host}${url.pathname}` });
            const open = activation.createEl('button', { cls: 'lorebase-trakt-button lorebase-trakt-open', attr: { type: 'button' } }); open.createSpan({ text: tt('open') }); setIcon(open.createSpan({ attr: { 'aria-hidden': 'true' } }), 'external-link'); open.addEventListener('click', () => window.open(login.url, '_blank', 'noopener,noreferrer'));
            const entry = steps.createDiv({ cls: 'lorebase-trakt-login-step' }); entry.createSpan({ cls: 'lorebase-trakt-step-number', text: '2', attr: { 'aria-hidden': 'true' } }); entry.createEl('strong', { text: tt('enterCode') });
            const codePanel = steps.createDiv({ cls: 'lorebase-trakt-code-panel' });
            const code = codePanel.createDiv({ cls: 'lorebase-trakt-code', text: login.code });
            const copy = codePanel.createEl('button', { cls: 'lorebase-trakt-copy', attr: { type: 'button', title: tt('copy'), 'aria-label': tt('copy') } }); setIcon(copy, 'copy');
            copy.addEventListener('click', () => {
                void Promise.resolve().then(() => navigator.clipboard.writeText(login.code)).then(() => {
                    if (!this.controller.signal.aborted) { setIcon(copy, 'check'); copy.setAttribute('aria-label', tt('copied')); copy.setAttribute('title', tt('copied')); }
                }).catch(() => {
                    if (this.controller.signal.aborted) return;
                    const range = root.ownerDocument.createRange(); range.selectNodeContents(code); const selection = root.ownerDocument.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
                });
            });
            root.appendChild(status); waiting(tt('waiting'));
            while (Date.now() < login.expiresAt && !this.controller.signal.aborted) {
                await this.delay(login.interval * 1000); if (Date.now() >= login.expiresAt) break;
                const connected = await login.poll(this.controller.signal); if (connected && !this.controller.signal.aborted) { this.finish(connected); return; }
            }
            if (!this.controller.signal.aborted) fail(tt('expired'));
        } catch (error) { if (!this.controller.signal.aborted) fail(traktError(error, 'auth')); }
    }
    private delay(ms: number): Promise<void> {
        const view = this.contentEl.ownerDocument.defaultView ?? window;
        return new Promise((resolve, reject) => {
            const signal = this.controller.signal, abort = () => { view.clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
            const timer = view.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
            signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
        });
    }
}
