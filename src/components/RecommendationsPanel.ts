import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';
import type { RecommendationsService, RecommendationTitle } from '../services/RecommendationsService';

import { onlineExtrasText } from '../localization/onlineExtras';
import { peopleElement as el, peopleButton, peopleIcon, peopleImage } from './peopleUi';
import { rt } from '../localization/recommendations';

export class RecommendationsPanel {
    private alive = true;
    private generation = 0;
    private stopExtrasWatch: () => void;
    private loading = false;
    private body: HTMLElement;
    private source: HTMLElement;
    private count: HTMLElement;
    constructor(host: HTMLElement, private item: RecommendationTitle, private service: RecommendationsService) {
        const details = el(host, 'details', 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-recommendations');
        details.open = true; details.dataset.mobilePane = 'general';
        const summary = el(details, 'summary', 'lorebase-editmode-panel-title');
        peopleIcon(summary, 'chevron-right', 'lorebase-panel-chevron'); el(summary, 'span', '', rt('title'));
        this.count = el(summary, 'small', 'lorebase-recommendations-count');
        const help = el(details, 'details', 'lorebase-people-help lorebase-recommendations-help');
        const helpSummary = el(help, 'summary'); peopleIcon(helpSummary, 'cloud-download');
        this.source = el(helpSummary, 'strong', '', this.item.type === 'anime' ? this.item.integrationProvider === 'shikimori' ? 'Shikimori' : 'AniList' : 'TMDB');
        el(helpSummary, 'span', '', rt('online')); peopleIcon(helpSummary, 'info', 'lorebase-people-help-info');
        el(help, 'p', '', rt('storage'));
        this.body = el(details, 'div', 'lorebase-recommendations-body');
        const updateExtras = () => {
            details.hidden = !areOnlineExtrasEnabled();
            this.generation++; this.loading = false; this.body.replaceChildren();
            if (areOnlineExtrasEnabled()) void this.load();
        };
        this.stopExtrasWatch = onOnlineExtrasChange(updateExtras);
        updateExtras();
    }
    destroy(): void { this.stopExtrasWatch(); this.alive = false; this.generation++; }
    private async load(): Promise<void> {
        if (!areOnlineExtrasEnabled()) { this.body.replaceChildren(); el(this.body, 'span', 'lorebase-person-muted', onlineExtrasText('disabled')); return; }
        if (!this.alive || this.loading) return;
        const generation = ++this.generation;
        this.loading = true; this.body.replaceChildren(); el(this.body, 'span', 'lorebase-person-muted', rt('loading'));
        try {
            const result = await this.service.load(this.item); if (!this.alive || generation !== this.generation) return;
            this.body.replaceChildren(); this.source.textContent = result.source;
            const items = result.items.slice(0, 7); this.count.textContent = String(items.length);
            if (!items.length) { el(this.body, 'span', 'lorebase-person-muted', rt('empty')); return; }
            const row = el(this.body, 'div', 'lorebase-recommendations-row');
            const status = el(this.body, 'div', 'lorebase-recommendations-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            const find = this.service.libraryIndex(this.item, result.source);
            for (const item of items) {
                const card = el(row, 'article', 'lorebase-recommendation-card');
                const link = el(card, 'a', 'lorebase-recommendation-link'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
                link.title = `${item.title} · ${rt('open')}`; link.setAttribute('aria-label', link.title);
                const poster = el(link, 'div', 'lorebase-recommendation-poster');
                peopleImage(poster, item.image, item.title);
                if (item.year) el(poster, 'small', 'lorebase-recommendation-year', item.year);
                el(link, 'strong', '', item.title);
                let existing = find(item), pending = false;
                const update = () => {
                    action.replaceChildren(); peopleIcon(action, pending ? 'loader-circle' : existing ? 'check' : 'plus');
                    const label = rt(pending ? 'adding' : existing ? 'openLibrary' : 'add'); action.title = label; action.setAttribute('aria-label', `${label}: ${item.title}`);
                    action.disabled = pending; action.setAttribute('aria-busy', String(pending)); action.classList.toggle('is-pending', pending); card.classList.toggle('is-in-library', Boolean(existing));
                };
                const action = peopleButton(card, '', () => {
                    if (pending || !this.alive) return; status.textContent = '';
                    existing = this.service.libraryIndex(this.item, result.source)(item);
                    if (existing) { update(); void this.service.open(existing).catch(() => { if (this.alive) status.textContent = rt('openFailed'); }); return; }
                    pending = true; update();
                    void this.service.add(this.item, result.source, item).then(file => {
                        existing = file; if (!file && this.alive) status.textContent = rt('addFailed');
                    }).catch(() => { if (this.alive) status.textContent = rt('addFailed'); })
                        .finally(() => { pending = false; if (this.alive) update(); });
                }, 'lorebase-recommendation-add');
                update();
            }
        } catch (error) {
            if (!this.alive || generation !== this.generation) return;
            const code = error instanceof Error ? error.message : '', key = code === 'RECOMMENDATIONS_SOURCE' ? 'source' : code === 'RECOMMENDATIONS_TMDB' ? 'tmdb' : code === 'RECOMMENDATIONS_SETUP' ? 'setup' : 'failed';
            this.body.replaceChildren(); el(this.body, 'span', 'lorebase-person-muted', rt(key));
            if (key === 'failed') peopleButton(this.body, rt('retry'), () => void this.load(), 'lorebase-recommendations-retry');
        } finally { if (generation === this.generation) this.loading = false; }
    }
}
