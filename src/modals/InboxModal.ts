import { App, Modal, setIcon } from 'obsidian';
import type { LorebaseSettings } from '../types';
import { inboxText as text } from '../localization/inbox';
import { InboxService, checkInboxAbort, type InboxScan } from '../services/InboxService';
import { InboxImporter, inboxRating, type InboxImportResult, type InboxMatch } from '../services/inbox/InboxImporter';
import { getRatingMax } from '../utils/rating';
import type { InboxCandidate } from '../services/inbox/parser';
import type { TemplateKind } from '../services/integrations/types';
import type { InlineSyncPresentation } from './inlineSync';
import { addMobileModalClose } from '../components/MobileModalChrome';

interface Draft {
    entry: InboxCandidate;
    notes: string;
    match: InboxMatch | null;
    manual: boolean;
    selected: boolean;
    expanded: boolean;
    musicKind: 'album' | 'track';
    error: string;
    ratingInput: string;
    invalidRating: boolean;
    committed?: InboxImportResult;
}
const kinds: TemplateKind[] = ['games', 'anime', 'movies', 'series', 'books', 'manga', 'music'];

export class InboxPanel {
    private controller = new AbortController();
    private data: InboxScan = { pending: [], handled: [], unreadable: [] };
    private drafts = new Map<string, Draft>();
    private handled = false;
    private filter = '';
    private busy = false;
    private stopped = false;
    private scanVersion = 0;
    private error = '';
    private added = 0;
    private footer?: HTMLElement;
    private detach: () => void;
    constructor(private app: App, private host: HTMLElement, private service: InboxService, private importer: InboxImporter,
        private settings: () => LorebaseSettings, private fallback: TemplateKind, signal: AbortSignal, private onCreated: () => void) {
        const abort = (): void => this.dispose();
        signal.addEventListener('abort', abort, { once: true });
        importer.signal.addEventListener('abort', abort, { once: true });
        this.detach = () => { signal.removeEventListener('abort', abort); importer.signal.removeEventListener('abort', abort); };
        if (signal.aborted || importer.signal.aborted) this.dispose(); else void this.load();
    }
    dispose(): void { this.scanVersion++; this.stopped = true; this.controller.abort(); this.detach?.(); }
    private get alive(): boolean { return !this.controller.signal.aborted; }
    private async load(): Promise<void> {
        const version = ++this.scanVersion;
        this.busy = true; this.error = '';
        this.host.replaceChildren();
        this.host.createDiv({ cls: 'lorebase-inbox-message', text: text('loading'), attr: { role: 'status' } });
        try {
            const data = await this.service.scan(this.fallback, this.controller.signal);
            if (!this.alive || version !== this.scanVersion) return;
            this.data = data;
            this.drafts = new Map(data.pending.map(entry => [entry.id, { entry, notes: entry.notes.join('\n'), match: null, manual: false, selected: false,
                expanded: false, musicKind: 'album', error: '', ratingInput: entry.rating10 === null ? '' : String(entry.rating10), invalidRating: false }]));
        } catch { if (this.alive) this.error = text('error'); }
        finally { if (this.alive && version === this.scanVersion) { this.busy = false; this.render(); } }
    }
    private button(parent: HTMLElement, label: string, action: () => void, icon?: string, iconOnly = false): HTMLButtonElement {
        const button = parent.createEl('button', { cls: 'lorebase-inbox-button' + (iconOnly ? ' is-icon' : ''),
            attr: { type: 'button', 'aria-label': label, title: label } });
        if (icon) setIcon(button.createSpan(), icon);
        if (!iconOnly) button.createSpan({ text: label });
        button.disabled = this.busy; button.addEventListener('click', action); return button;
    }
    private visible(entry: InboxCandidate): boolean {
        const query = this.filter.toLocaleLowerCase().trim();
        return !query || [entry.title, ...entry.origins.map(origin => origin.path + ' ' + origin.section), ...entry.notes].join(' ').toLocaleLowerCase().includes(query);
    }
    private resetMatch(draft: Draft): void { draft.match = null; draft.manual = false; draft.error = ''; }
    private ready(draft: Draft): boolean { return Boolean(draft.match || draft.manual || draft.committed); }
    private render(): void {
        if (!this.alive) return;
        const scroll = this.host.querySelector('.lorebase-inbox-list')?.scrollTop ?? 0;
        this.host.replaceChildren(); this.host.classList.add('lorebase-inbox');
        const bar = this.host.createDiv({ cls: 'lorebase-inbox-toolbar' });
        const tabs = bar.createDiv({ cls: 'lorebase-inbox-tabs' });
        for (const handled of [false, true]) {
            const count = handled ? this.data.handled.length : this.drafts.size;
            const button = this.button(tabs, `${text(handled ? 'handled' : 'pending')} ${count}`, () => { this.handled = handled; this.render(); });
            button.setAttribute('aria-pressed', String(this.handled === handled));
        }
        const search = bar.createEl('input', { cls: 'lorebase-inbox-search', attr: { type: 'search', placeholder: text('search'), 'aria-label': text('search') } });
        search.value = this.filter; search.disabled = this.busy;
        this.button(bar, text('refresh'), () => { void this.load(); }, 'refresh-cw', true);
        this.host.createEl('p', { cls: 'lorebase-inbox-hint', text: text('hint') });
        if (this.error) this.host.createDiv({ cls: 'lorebase-inbox-error', text: this.error, attr: { role: 'alert' } });
        if (this.data.unreadable.length) this.host.createDiv({ cls: 'lorebase-inbox-error', text: `${text('unreadable')}: ${this.data.unreadable.length}`, attr: { role: 'status' } });
        const list = this.host.createDiv({ cls: 'lorebase-inbox-list' });
        const renderList = (): void => {
            list.replaceChildren();
            const entries = this.handled ? this.data.handled : [...this.drafts.values()].map(draft => draft.entry);
            const visible = entries.filter(entry => this.visible(entry));
            if (!visible.length) list.createDiv({ cls: 'lorebase-inbox-message', text: text(this.handled ? 'handledEmpty' : 'empty') });
            for (const entry of visible) this.renderEntry(list, entry);
        };
        search.addEventListener('input', () => { this.filter = search.value; renderList(); this.renderFooter(); });
        renderList(); list.scrollTop = scroll;
        this.footer = this.host.createDiv({ cls: 'lorebase-inbox-footer' }); this.renderFooter();
    }
    private renderEntry(list: HTMLElement, entry: InboxCandidate): void {
        const draft = this.drafts.get(entry.id);
        const row = list.createDiv({ cls: 'lorebase-inbox-entry', attr: { 'data-inbox-id': entry.id } });
        const main = row.createDiv({ cls: 'lorebase-inbox-entry-main' });
        if (!this.handled && draft) {
            const selected = main.createEl('input', { cls: 'lorebase-inbox-select', attr: { type: 'checkbox', 'aria-label': text('select') + ': ' + entry.title } });
            selected.checked = draft.selected; selected.disabled = this.busy || Boolean(draft.committed);
            selected.addEventListener('change', () => { draft.selected = selected.checked; this.renderFooter(); });
        }
        const title = main.createDiv({ cls: 'lorebase-inbox-title' });
        if (this.handled) title.createEl('strong', { text: entry.title });
        else if (draft) {
            const name = title.createEl('input', { cls: 'lorebase-inbox-title-input', attr: { type: 'text', 'aria-label': text('name') } });
            name.value = entry.title; name.disabled = this.busy || Boolean(draft.committed);
            name.addEventListener('input', () => {
                entry.title = name.value.trim(); this.resetMatch(draft);
                row.querySelector('.lorebase-inbox-error')?.remove(); row.querySelector('.lorebase-inbox-match')?.remove();
                const actions = row.querySelector<HTMLElement>('.lorebase-inbox-actions');
                if (actions) this.renderEntryActions(actions, draft);
                this.renderFooter();
            });
        }
        const meta = title.createDiv({ cls: 'lorebase-inbox-meta' });
        const origin = entry.origins[0];
        if (origin) {
            const short = origin.path.split('/').pop()!.replace(/\.md$/i, '');
            const source = this.button(meta, `${short}:${origin.line}${entry.origins.length > 1 ? ` +${entry.origins.length - 1}` : ''}`, () => {
                void this.app.workspace.openLinkText(origin.path, '', true);
            }, 'file-text');
            source.classList.add('lorebase-inbox-source'); source.title = origin.path;
        }
        if (entry.rating10 !== null) meta.createSpan({ cls: 'lorebase-inbox-badge', text: `${entry.rating10}/10` });
        if (entry.isAdult) meta.createSpan({ cls: 'lorebase-inbox-badge', text: '18+' });
        if (draft?.notes || entry.notes.length) meta.createSpan({ cls: 'lorebase-inbox-note-preview', text: draft?.notes ?? entry.notes.join(' · ') });
        if (!this.handled && draft && (draft.match || draft.manual)) {
            const label = draft.match ? [draft.match.result.title, draft.match.result.year, draft.match.result.provider].filter(Boolean).join(' · ') : text('manualReady');
            title.createSpan({ cls: 'lorebase-inbox-match', text: label, attr: { title: label } });
        }
        const actions = main.createDiv({ cls: 'lorebase-inbox-actions' });
        if (this.handled) {
            this.button(actions, text('restore'), () => { void this.handle(async () => { await this.service.restore(entry); await this.load(); }); }, 'rotate-ccw', true);
            return;
        }
        if (!draft) return;
        this.renderEntryActions(actions, draft);
        if (draft.expanded) this.renderDetails(row, draft);
        if (draft.error) row.createDiv({ cls: 'lorebase-inbox-error', text: draft.error, attr: { role: 'alert' } });
        if (draft.committed) this.button(row, text('exists'), () => { void this.app.workspace.openLinkText(draft.committed!.file.path, '', true); });
    }
    private renderEntryActions(actions: HTMLElement, draft: Draft): void {
        actions.replaceChildren();
        const entry = draft.entry;
        const media = actions.createEl('select', { attr: { 'aria-label': text('media') } }); media.disabled = this.busy || Boolean(draft.committed);
        for (const kind of kinds) {
            if (!this.settings().enabledMedia[kind] && kind !== entry.kind) continue;
            media.createEl('option', { text: text(kind), attr: { value: kind } });
        }
        media.value = entry.kind;
        media.addEventListener('change', () => { entry.kind = media.value as TemplateKind; this.resetMatch(draft); this.render(); });
        if (entry.kind === 'music') {
            const kind = actions.createEl('select', { attr: { 'aria-label': text('music') } }); kind.disabled = this.busy || Boolean(draft.committed);
            for (const value of ['album', 'track'] as const) kind.createEl('option', { text: text(value), attr: { value } });
            kind.value = draft.musicKind;
            kind.addEventListener('change', () => { draft.musicKind = kind.value as 'album' | 'track'; this.resetMatch(draft); this.render(); });
        }
        const retry = Boolean(draft.error && this.ready(draft) || draft.committed);
        const label = retry ? 'retry' : this.ready(draft) ? 'addOne' : 'findShort';
        const add = this.button(actions, text(label), () => {
            if (this.ready(draft)) void this.addEntries([draft]); else void this.prepareEntries([draft]);
        }, retry ? 'rotate-cw' : this.ready(draft) ? 'plus' : 'search');
        add.classList.add('lorebase-inbox-add');
        add.dataset.shortLabel = text(label);
        if (!draft.committed) {
            if (this.ready(draft)) this.button(actions, text('findShort'), () => { void this.prepareEntries([draft]); }, 'search', true);
            const manual = this.button(actions, text('manual'), () => this.prepareManual([draft]), 'square-pen', true);
            manual.setAttribute('aria-pressed', String(draft.manual));
        }
        const expand = this.button(actions, text('details'), () => { draft.expanded = !draft.expanded; this.render(); }, draft.expanded ? 'chevron-up' : 'chevron-down', true);
        expand.setAttribute('aria-expanded', String(draft.expanded));
        if (!draft.committed) this.button(actions, text('dismiss'), () => { void this.handle(async () => {
            await this.service.record(entry, 'dismissed'); this.drafts.delete(entry.id); this.data.handled.push(entry);
        }); }, 'x', true);
    }
    private renderDetails(row: HTMLElement, draft: Draft): void {
        const entry = draft.entry;
        const details = row.createDiv({ cls: 'lorebase-inbox-details' });
        const notes = details.createEl('textarea', { attr: { rows: '2', 'aria-label': text('details'), placeholder: text('details') } });
        notes.value = draft.notes; notes.disabled = this.busy || Boolean(draft.committed);
        notes.addEventListener('input', () => { draft.notes = notes.value; });
        const fields = details.createDiv({ cls: 'lorebase-inbox-detail-fields' });
        const ratingLabel = fields.createEl('label', { text: text('rating') });
        const rating = ratingLabel.createEl('input', { attr: { type: 'number', min: '0', max: '10', step: 'any', 'aria-label': text('rating') } });
        rating.value = draft.ratingInput; rating.disabled = this.busy || Boolean(draft.committed);
        if (draft.invalidRating) rating.setCustomValidity(text('ratingInvalid'));
        const conversion = fields.createEl('small');
        const showRating = (): void => { conversion.textContent = entry.rating10 === null ? text('ratingHint')
            : `${entry.rating10}/10 → ${inboxRating(entry.rating10, this.settings().ratingScale) ?? '—'}/${getRatingMax(this.settings().ratingScale)}`; };
        showRating();
        rating.addEventListener('input', () => {
            draft.ratingInput = rating.value;
            const value = rating.value.trim() === '' ? null : Number(rating.value);
            draft.invalidRating = rating.validity.badInput || value !== null && (!Number.isFinite(value) || value < 0 || value > 10);
            rating.setCustomValidity(draft.invalidRating ? text('ratingInvalid') : '');
            if (!draft.invalidRating) { entry.rating10 = value; showRating(); }
        });
        if (['games', 'anime', 'manga'].includes(entry.kind)) {
            const label = fields.createEl('label', { text: text('adult') });
            const adult = label.createEl('input', { attr: { type: 'checkbox' } });
            adult.checked = entry.isAdult; adult.disabled = this.busy || Boolean(draft.committed);
            adult.addEventListener('change', () => { entry.isAdult = adult.checked; });
        }
        for (const url of entry.links) details.createEl('a', { text: url, attr: { href: url, target: '_blank', rel: 'noopener noreferrer' } });
        for (const origin of entry.origins) {
            const source = this.button(details, `${origin.path}:${origin.line}${origin.section ? ' · ' + origin.section : ''}`, () => {
                void this.app.workspace.openLinkText(origin.path, '', true);
            }, 'file-text'); source.classList.add('lorebase-inbox-source');
            details.createEl('div', { cls: 'lorebase-inbox-original', text: origin.text });
        }
    }
    private renderFooter(): void {
        if (!this.footer || !this.alive) return;
        this.footer.replaceChildren();
        if (!this.handled) {
            const visible = [...this.drafts.values()].filter(draft => this.visible(draft.entry) && !draft.committed);
            const label = this.footer.createEl('label', { cls: 'lorebase-inbox-select-all' });
            const all = label.createEl('input', { attr: { type: 'checkbox', 'aria-label': text('selectAll') } });
            all.checked = visible.length > 0 && visible.every(draft => draft.selected);
            all.indeterminate = !all.checked && visible.some(draft => draft.selected);
            all.disabled = this.busy || !visible.length;
            label.createSpan({ text: text('selectAll') });
            all.addEventListener('change', () => { for (const draft of visible) draft.selected = all.checked; this.render(); });
            const selected = [...this.drafts.values()].filter(draft => draft.selected);
            const actions = this.footer.createDiv({ cls: 'lorebase-inbox-bulk-actions' });
            if (this.busy) {
                const stop = this.button(actions, text('stop'), () => { this.stopped = true; stop.disabled = true; }, 'square');
                stop.disabled = this.stopped;
            } else {
                const manual = this.button(actions, `${text('manual')} (${selected.length})`, () => this.prepareManual(selected), 'square-pen', true);
                manual.disabled = !selected.length;
                const find = this.button(actions, `${text('findShort')} (${selected.length})`, () => { void this.prepareEntries(selected); }, 'search');
                find.disabled = !selected.some(draft => !draft.committed);
                const ready = selected.filter(draft => this.ready(draft));
                const add = this.button(actions, `${text('add')} (${ready.length})`, () => { void this.addEntries(ready); }, 'plus');
                add.classList.add('mod-cta'); add.disabled = !ready.length;
            }
        }
        if (this.added) this.footer.createSpan({ cls: 'lorebase-inbox-added', text: `${text('added')}: ${this.added}`, attr: { role: 'status' } });
    }
    private async handle(action: () => Promise<void>): Promise<void> {
        if (this.busy || !this.alive) return;
        this.busy = true; this.error = ''; this.render();
        try { await action(); }
        catch { if (this.alive) this.error = text('error'); }
        finally { if (this.alive) { this.busy = false; this.render(); } }
    }
    private prepareManual(entries: Draft[]): void {
        if (this.busy || !this.alive) return;
        for (const draft of entries) {
            if (draft.committed) continue;
            if (!draft.entry.title.trim()) { draft.error = text('name'); continue; }
            draft.match = null; draft.manual = true; draft.selected = true; draft.error = '';
        }
        this.render();
    }
    private async prepareEntries(entries: Draft[]): Promise<void> {
        this.stopped = false;
        await this.handle(async () => {
            for (const draft of entries) {
                if (!this.alive || this.stopped) break;
                if (draft.committed) continue;
                if (!draft.entry.title.trim()) { draft.error = text('name'); continue; }
                const match = await this.importer.select(draft.entry, this.controller.signal, draft.musicKind);
                if (!this.alive || !match) break;
                draft.match = match; draft.manual = false; draft.selected = true; draft.error = '';
                this.render();
            }
        });
    }
    private async addEntries(entries: Draft[]): Promise<void> {
        if (this.busy || !this.alive) return;
        this.busy = true; this.stopped = false; this.error = ''; this.render();
        try {
            for (const draft of entries) {
                if (!this.alive || this.stopped) break;
                if (!this.ready(draft)) continue;
                draft.error = '';
                try {
                    if (!draft.entry.title.trim()) { draft.error = text('name'); continue; }
                    if (draft.invalidRating) { draft.error = text('ratingInvalid'); draft.expanded = true; continue; }
                    if (!draft.committed) {
                        if (!(await this.service.validate(draft.entry, this.controller.signal))) { draft.error = text('stale'); continue; }
                        checkInboxAbort(this.controller.signal);
                        if (this.stopped) break;
                        const existing = await this.importer.findExisting(draft.entry, draft.match);
                        checkInboxAbort(this.controller.signal);
                        if (!(await this.service.validate(draft.entry, this.controller.signal))) { draft.error = text('stale'); continue; }
                        const result = existing ? { file: existing, created: false }
                            : await this.importer.create(draft.entry, draft.match, draft.notes, this.controller.signal, draft.musicKind);
                        draft.committed = result;
                        if (result.created) { this.added++; this.onCreated(); }
                    }
                    // A completed vault write must get its receipt even if the panel just closed.
                    await this.service.record(draft.entry, 'added', draft.committed.file.path);
                    this.drafts.delete(draft.entry.id); this.data.handled.push(draft.entry);
                } catch { if (this.alive) draft.error = text('error'); }
                if (this.alive) this.render();
            }
        } finally { if (this.alive) { this.busy = false; this.render(); } }
    }
}

export function mountInbox(app: App, presentation: InlineSyncPresentation, service: InboxService, importer: InboxImporter,
    settings: () => LorebaseSettings, kind: TemplateKind, onCreated: () => void): InboxPanel {
    return new InboxPanel(app, presentation.host, service, importer, settings, kind, presentation.signal, onCreated);
}

export class InboxModal extends Modal {
    private lifetime = new AbortController();
    private panel?: InboxPanel;
    private unload = (): void => this.close();
    constructor(app: App, private service: InboxService, private importer: InboxImporter, private settings: () => LorebaseSettings,
        private kind: TemplateKind, private onCreated: () => void) { super(app); }
    onOpen(): void {
        this.importer.signal.addEventListener('abort', this.unload, { once: true });
        this.modalEl.classList.add('lorebase-inbox-modal');
        const header = this.contentEl.createDiv({ cls: 'lorebase-select-header' });
        header.createEl('h2', { text: text('title') }); addMobileModalClose(this.modalEl, header, () => this.close());
        const host = this.contentEl.createDiv();
        this.panel = new InboxPanel(this.app, host, this.service, this.importer, this.settings, this.kind, this.lifetime.signal, this.onCreated);
    }
    onClose(): void { this.importer.signal.removeEventListener('abort', this.unload); this.lifetime.abort(); this.panel?.dispose(); this.contentEl.replaceChildren(); }
}
