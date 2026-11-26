import { App, Modal } from 'obsidian';
import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';
import { PeopleService } from '../services/PeopleService';
import type { CastMember, PersonCredit, PersonDetails } from '../services/integrations/providers/tmdbPeople';
import { peopleElement as el, peopleButton as button, peopleImage, peopleIcon, peopleHelp } from '../components/peopleUi';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import { getMediaWorkTypeColor, getMediaWorkTypeLabel } from '../utils/mediaWorkType';
import { i18n } from '../localization';
import { pt } from '../localization/people';
import { formatPersonDate, formatPersonAge, personAge } from '../utils/peopleDisplay';

export class PersonFilmographyModal extends Modal {
    private alive = false;
    private generation = 0;
    private cleanup: Array<() => void> = [];
    private person?: PersonDetails;
    private media = 'all'; private role = 'acting'; private query = ''; private page = 0;
    private results?: HTMLElement; private paging?: HTMLElement;
    private pending = new Set<string>();
    private findInLibrary?: ReturnType<PeopleService['libraryIndex']>;
    private refreshTimer?: ReturnType<typeof setTimeout>;
    constructor(app: App, private service: PeopleService, private actor: CastMember | string, private languageMedia: 'movie' | 'series', private currentRole = '') { super(app); }
    onOpen(): void {
        if (!areOnlineExtrasEnabled()) { this.close(); return; }
        this.cleanup.push(onOnlineExtrasChange(enabled => { if (!enabled) this.close(); }));
        this.alive = true; this.modalEl.classList.add('lorebase-person-modal');
        const changed = this.app.metadataCache.on('changed', () => this.scheduleLibraryRefresh());
        this.cleanup.push(() => this.app.metadataCache.offref(changed));
        const deleted = this.app.vault.on('delete', () => this.scheduleLibraryRefresh());
        const renamed = this.app.vault.on('rename', () => this.scheduleLibraryRefresh());
        this.cleanup.push(() => this.app.vault.offref(deleted), () => this.app.vault.offref(renamed));
        if (typeof this.actor === 'string') void this.search(this.actor); else void this.load(this.actor);
    }
    onClose(): void { this.alive = false; this.generation++; if (this.refreshTimer) clearTimeout(this.refreshTimer); this.refreshTimer = undefined; this.findInLibrary = undefined; this.cleanup.splice(0).forEach(fn => fn()); this.contentEl.replaceChildren(); }
    private scheduleLibraryRefresh(): void {
        if (!this.alive || !this.person || this.refreshTimer) return;
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined; this.findInLibrary = undefined;
            if (this.alive) this.renderCredits();
        }, 100);
    }
    private loading(): void { this.contentEl.replaceChildren(); el(this.contentEl, 'p', '', pt('loading')); }
    private error(retry: () => void): void {
        this.contentEl.replaceChildren(); el(this.contentEl, 'p', '', this.service.configured() ? pt('failed') : pt('setup'));
        button(this.contentEl, pt('retry'), retry);
    }
    private async search(name: string): Promise<void> {
        const version = ++this.generation; this.loading();
        try {
            const matches = await this.service.search(name, this.languageMedia);
            if (!this.alive || version !== this.generation) return;
            this.contentEl.replaceChildren(); el(this.contentEl, 'h2', '', pt('choose'));
            el(this.contentEl, 'p', 'lorebase-person-muted', name);
            const grid = el(this.contentEl, 'div', 'lorebase-cast-grid');
            if (!matches.length) el(grid, 'p', '', pt('noPeople'));
            for (const actor of matches) {
                const card = button(grid, '', () => { this.actor = actor; void this.load(actor); }, 'lorebase-cast-card');
                card.title = actor.name;
                peopleImage(el(card, 'div', 'lorebase-cast-photo'), actor.photo, actor.name);
                const name = el(card, 'strong', '', actor.name); el(card, 'small', '', actor.role);
                void this.service.actorName(actor, this.languageMedia).then(localized => {
                    if (!this.alive || !card.isConnected) return;
                    name.textContent = localized; card.title = localized;
                    const image = card.querySelector('img'); if (image) image.alt = localized;
                }).catch(() => { /* Preserve the source name. */ });
            }
        } catch { if (this.alive && version === this.generation) this.error(() => { void this.search(name); }); }
    }
    private async load(actor: CastMember): Promise<void> {
        const version = ++this.generation; this.loading();
        try {
            const person = await this.service.person(actor.id, this.languageMedia);
            if (!this.alive || version !== this.generation) return;
            this.person = person; this.renderPerson();
        } catch { if (this.alive && version === this.generation) this.error(() => { void this.load(actor); }); }
    }
    private renderPerson(): void {
        const person = this.person!; this.contentEl.replaceChildren();
        const top = el(this.contentEl, 'div', 'lorebase-person-header');
        peopleImage(el(top, 'div', 'lorebase-person-photo'), person.photo, person.name);
        const text = el(top, 'div', 'lorebase-person-info');
        const heading = el(text, 'div', 'lorebase-person-heading'); el(heading, 'h2', '', person.name);
        const source = el(heading, 'a', 'lorebase-person-source', 'TMDB'); peopleIcon(source, 'external-link'); source.title = pt('source'); source.setAttribute('aria-label', pt('source'));
        source.href = `https://www.themoviedb.org/person/${person.id}`; source.target = '_blank'; source.rel = 'noopener noreferrer';
        if (this.currentRole) {
            const current = el(text, 'div', 'lorebase-person-current-role'); current.title = `${pt('currentRole')}: ${this.currentRole}`;
            peopleIcon(current, 'user-round'); el(current, 'span', '', `${pt('currentRole')}: `); el(current, 'strong', '', this.currentRole);
        }
        const locale = this.service.language(this.languageMedia);
        const facts = el(text, 'div', 'lorebase-person-facts');
        for (const [label, value, icon] of [[pt('birthday'), person.birthday, 'cake'], [pt('deathday'), person.deathday, 'calendar'], [pt('birthplace'), person.birthplace, 'map-pin']]) {
            if (!value) continue;
            const fact = el(facts, 'div', 'lorebase-person-fact'); peopleIcon(fact, icon);
            const info = el(fact, 'div'); el(info, 'span', 'lorebase-person-fact-label', label);
            const line = el(info, 'div', 'lorebase-person-fact-value');
            el(line, 'span', '', icon === 'map-pin' ? value : formatPersonDate(value, locale));
            if (icon === 'cake') {
                const age = personAge(person.birthday, person.deathday);
                if (age !== null) {
                    const badge = el(line, 'span', 'lorebase-person-age', formatPersonAge(age, locale));
                    badge.title = pt(person.deathday ? 'ageAtDeath' : 'age');
                }
            }
        }
        const bio = el(text, 'details', 'lorebase-person-biography'); el(bio, 'summary', '', pt('biography'));
        el(bio, 'p', '', person.biography || pt('noBiography'));
        peopleHelp(this.contentEl);
        el(this.contentEl, 'h3', 'lorebase-filmography-heading', pt('filmography'));
        const filters = el(this.contentEl, 'div', 'lorebase-filmography-filters');
        const search = el(filters, 'div', 'lorebase-filmography-search'); peopleIcon(search, 'search');
        const query = el(search, 'input'); query.type = 'search'; query.placeholder = pt('search'); query.setAttribute('aria-label', pt('search')); query.value = this.query;
        query.addEventListener('input', () => { this.query = query.value; this.page = 0; this.renderCredits(); });
        for (const [key, current, options, change] of [
            ['media', this.media, [['all', pt('all')], ['movie', pt('movies')], ['series', pt('series')]], (value: string) => this.media = value],
            ['role', this.role, [['all', pt('allRoles')], ['acting', pt('acting')], ['crew', pt('crew')]], (value: string) => this.role = value],
        ] as const) {
            const host = el(filters, 'div', 'lorebase-filmography-filter'); host.dataset.filter = key;
            createLorebaseDropdown(host, options.map(([value, label]) => ({ value, label })), current, value => {
                change(value); this.page = 0; this.renderCredits();
            }, { floating: true, minPanelWidth: key === 'role' ? 200 : 170, panelClass: 'lorebase-people-dropdown-panel' });
            const panel = host.querySelector('.lorebase-settings-dropdown-panel')!;
            this.cleanup.push(() => panel.dispatchEvent(new Event('lorebase-dropdown-close')));
        }
        this.results = el(this.contentEl, 'div', 'lorebase-filmography-grid'); this.paging = el(this.contentEl, 'div', 'lorebase-filmography-paging');
        this.renderCredits();
    }
    private renderCredits(): void {
        if (!this.results || !this.paging || !this.person) return;
        const query = this.query.trim().toLocaleLowerCase();
        const credits = this.person.credits.filter(credit => (this.media === 'all' || credit.media === this.media)
            && (this.role === 'all' || (this.role === 'acting' ? credit.acting : credit.crew)) && (!query || credit.title.toLocaleLowerCase().includes(query)));
        this.page = Math.min(this.page, Math.max(0, Math.ceil(credits.length / 24) - 1));
        this.results.replaceChildren(); this.paging.replaceChildren(); const find = this.findInLibrary ??= this.service.libraryIndex();
        if (!credits.length) el(this.results, 'p', '', pt('noCredits'));
        for (const credit of credits.slice(this.page * 24, (this.page + 1) * 24)) {
            const card = el(this.results, 'article', 'lorebase-filmography-card');
            card.title = [credit.title, credit.year, credit.role].filter(Boolean).join(' · ');
            peopleImage(el(card, 'div', 'lorebase-filmography-poster'), credit.image || '', credit.title);
            const workType = credit.media === 'movie' ? 'Movie' : 'Series';
            const badge = el(card, 'span', 'lorebase-filmography-type', getMediaWorkTypeLabel(credit.media, workType, i18n.getLanguage()));
            badge.style.setProperty('--lorebase-type-color', getMediaWorkTypeColor(credit.media, workType));
            const key = `${credit.media}:${credit.id}`, existing = find(credit);
            const label = `${this.pending.has(key) ? pt('adding') : existing ? pt('exists') : pt('add')}: ${credit.title}`;
            const add = button(card, '', () => {
                if (existing) { void this.app.workspace.openLinkText(existing.path, ''); return; }
                void this.add(credit);
            }, 'lorebase-filmography-action');
            add.setAttribute('aria-label', label); add.title = label;
            const actionIcon = el(add, 'span', 'lorebase-filmography-action-icon');
            peopleIcon(actionIcon, this.pending.has(key) ? 'loader-circle' : existing ? 'check' : 'plus');
            add.disabled = this.pending.has(key); add.classList.toggle('is-in-library', Boolean(existing));
            card.classList.toggle('is-in-library', Boolean(existing));
            const body = el(card, 'div', 'lorebase-filmography-caption');
            el(body, 'strong', 'lorebase-filmography-title', credit.title);
            el(body, 'small', 'lorebase-filmography-meta', [existing ? pt('library') : '', credit.year].filter(Boolean).join(' · '));
            const role = el(body, 'div', 'lorebase-filmography-role');
            const character = this.role !== 'crew' && credit.acting;
            const roleText = (character ? credit.character : credit.job) || credit.role;
            role.classList.toggle('is-empty', !roleText);
            if (roleText) {
                peopleIcon(role, character ? 'user-round' : 'clapperboard');
                el(role, 'span', 'lorebase-filmography-role-label', `${pt(character ? 'character' : 'job')}:`);
                el(role, 'strong', '', roleText);
                add.title = `${label}\n${pt(character ? 'character' : 'job')}: ${roleText}`;
            }
        }
        if (credits.length > 24) {
            const previous = button(this.paging, '', () => this.changePage(-1), 'lorebase-people-page-button');
            peopleIcon(previous, 'chevron-left'); el(previous, 'span', '', pt('previous')); previous.disabled = this.page === 0;
            const info = el(this.paging, 'div', 'lorebase-people-page-info'); info.setAttribute('aria-live', 'polite');
            el(info, 'strong', '', `${pt('page')} ${this.page + 1} / ${Math.ceil(credits.length / 24)}`);
            el(info, 'small', '', `${this.page * 24 + 1}–${Math.min((this.page + 1) * 24, credits.length)} / ${credits.length}`);
            const next = button(this.paging, '', () => this.changePage(1), 'lorebase-people-page-button');
            el(next, 'span', '', pt('next')); peopleIcon(next, 'chevron-right'); next.disabled = (this.page + 1) * 24 >= credits.length;
        }
    }
    private changePage(direction: number): void {
        this.page += direction; this.renderCredits();
        this.results?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }
    private async add(credit: PersonCredit): Promise<void> {
        const key = `${credit.media}:${credit.id}`; if (this.pending.has(key)) return;
        this.pending.add(key); this.renderCredits();
        let failed = false;
        try { failed = !await this.service.add(credit); } catch { failed = true; }
        finally { this.pending.delete(key); this.findInLibrary = undefined; if (this.alive) { this.renderCredits(); if (failed) el(this.paging!, 'span', 'lorebase-person-error', pt('addFailed')); } }
    }
}
