
import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import { pt, psnError } from '../localization/playstation';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import type { PlayStationPreview, PlayStationSyncService } from '../services/PlayStationSyncService';
import type { SearchResult } from '../services/integrations/types';
import { cleanPlayStationSearch } from '../services/playstation/search';

/** Keeps matching controls out of the import grid, and commits only on confirmation. */
export class PlayStationMatchModal extends Modal {
    private controller = new AbortController();
    private draft: PlayStationPreview;
    private candidates: SearchResult[];
    private accepted = false;
    private searchVersion = 0;
    constructor(app: App, row: PlayStationPreview, private service: PlayStationSyncService,
        private done: (draft?: PlayStationPreview) => void) {
        super(app); this.draft = { ...row }; this.candidates = row.source ? [row.source] : [];
    }
    onOpen(): void {
        this.modalEl.addClass('lorebase-psn-match-modal');
        const root = this.contentEl; root.addClass('lorebase-psn-dialog');
        root.createEl('h2', { text: pt('matchTitle') });
        root.createDiv({ cls: 'lorebase-psn-dialog-subtitle', text: this.draft.entry.name });
        const target = root.createDiv({ cls: 'lorebase-psn-dialog-field' });
        target.createEl('label', { text: pt('target') });
        const controls = target.createDiv();
        createLorebaseDropdown(controls, [{ value: 'choose', label: pt('chooseTarget') }, { value: 'new', label: pt('newNote') },
            ...this.service.targets().map(record => ({ value: record.path, label: record.title + ' · ' + record.path }))],
        this.draft.targetChosen ? this.draft.path || 'new' : 'choose', value => {
            if (value === 'choose') return;
            try { this.service.bind(this.draft, value === 'new' ? undefined : value); message.textContent = ''; paint(); }
            catch (error) { message.textContent = psnError(error); }
        }, { floating: true, maxPanelHeight: 220 });
        const message = root.createDiv({ cls: 'lorebase-psn-dialog-message', attr: { role: 'status', 'aria-live': 'polite' } });
        let results: HTMLElement | undefined;
        const paint = () => {
            confirm.disabled = !this.draft.targetChosen || !(this.draft.path || this.draft.source || this.draft.psnOnly);
            if (!results) return;
            results.empty();
            for (const source of this.candidates) {
                const selected = this.draft.source?.id === source.id && !this.draft.psnOnly;
                const option = results.createEl('button', { cls: 'lorebase-psn-match-result', attr: { type: 'button', 'aria-pressed': String(selected) } });
                if (source.image) option.createEl('img', { attr: { src: source.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } });
                const copy = option.createSpan(); copy.createEl('strong', { text: source.title });
                copy.createSpan({ text: [source.year, source.format, source.provider.toUpperCase()].filter(Boolean).join(' · ') });
                setIcon(option.createSpan({ cls: 'lorebase-psn-match-check', attr: { 'aria-hidden': 'true' } }), selected ? 'check' : 'plus');
                option.addEventListener('click', () => { this.draft.source = source; this.draft.psnOnly = false; paint(); });
            }
            psnOnly?.setAttribute('aria-pressed', String(this.draft.psnOnly));
        };
        let psnOnly: HTMLButtonElement | undefined;
        if (this.draft.metadataProvider !== 'psn') {
            const field = root.createDiv({ cls: 'lorebase-psn-dialog-field' });
            field.createEl('label', { text: pt('metadata') + ' · ' + this.draft.metadataProvider.toUpperCase() });
            const searchRow = field.createDiv({ cls: 'lorebase-psn-dialog-search' });
            const search = searchRow.createEl('input', { attr: { type: 'search', 'aria-label': pt('searchTitle'), placeholder: pt('searchTitle') } });
            search.value = cleanPlayStationSearch(this.draft.entry.name);
            const run = async () => {
                if (!search.value.trim()) { search.focus(); return; }
                const version = ++this.searchVersion; find.disabled = true; message.textContent = pt('find') + '…';
                try {
                    const candidates = await this.service.candidates(this.draft, this.controller.signal, search.value.trim());
                    if (this.controller.signal.aborted || version !== this.searchVersion) return;
                    this.candidates = candidates; paint(); message.textContent = candidates.length ? '' : pt('empty');
                } catch (error) { if (!this.controller.signal.aborted && version === this.searchVersion) message.textContent = psnError(error); }
                finally { if (!this.controller.signal.aborted && version === this.searchVersion) find.disabled = false; }
            };
            const find = searchRow.createEl('button', { attr: { type: 'button', 'aria-label': pt('find'), title: pt('find') } });
            setIcon(find, 'search'); find.addEventListener('click', () => { void run(); });
            search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void run(); } });
            results = root.createDiv({ cls: 'lorebase-psn-match-results', attr: { 'aria-label': pt('choose') } });
            psnOnly = root.createEl('button', { cls: 'lorebase-psn-only-choice', text: pt('psnOnly'), attr: { type: 'button' } });
            psnOnly.addEventListener('click', () => { this.draft.source = undefined; this.draft.psnOnly = true; paint(); });
        }
        const footer = root.createDiv({ cls: 'lorebase-psn-dialog-footer' });
        const cancel = footer.createEl('button', { text: t('commonCancel'), attr: { type: 'button' } }); cancel.addEventListener('click', () => this.close());
        const confirm = footer.createEl('button', { cls: 'mod-cta', text: pt('useMatch'), attr: { type: 'button' } });
        confirm.addEventListener('click', () => { if (!confirm.disabled) { this.accepted = true; this.close(); } });
        paint();
    }
    onClose(): void { this.controller.abort(); this.contentEl.empty(); this.done(this.accepted ? this.draft : undefined); }
}
