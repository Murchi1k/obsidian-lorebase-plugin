import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';
import type { App } from 'obsidian';

import { onlineExtrasText } from '../localization/onlineExtras';
import type { MovieItem, SeriesItem } from '../types';
import { PeopleService } from '../services/PeopleService';
import type { CastMember } from '../services/integrations/providers/tmdbPeople';
import { PersonFilmographyModal } from '../modals/PersonFilmographyModal';
import { peopleElement as el, peopleButton as button, peopleImage, peopleHelp, peopleIcon } from './peopleUi';
import { pt } from '../localization/people';

const MAIN_CAST_LIMIT = 24;

export class VideoCastPanel {
    private alive = true; private loaded = false; private loading = false; private limit = 12;
    private generation = 0;
    private stopExtrasWatch: () => void;
    private cast: CastMember[] = [];
    private secondaryOpen = false;
    private details: HTMLDetailsElement;
    private body: HTMLElement;
    constructor(private app: App, host: HTMLElement, private item: MovieItem | SeriesItem, private service: PeopleService) {
        this.details = el(host, 'details', 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-video-cast');
        this.details.dataset.mobilePane = 'general';
        const summary = el(this.details, 'summary', 'lorebase-editmode-panel-title');
        peopleIcon(summary, 'chevron-right', 'lorebase-panel-chevron'); el(summary, 'span', '', pt('actors'));
        peopleHelp(this.details);
        this.body = el(this.details, 'div', 'lorebase-cast-body');
        const updateExtras = () => {
            this.details.hidden = !areOnlineExtrasEnabled();
            this.generation++; this.loaded = false; this.loading = false; this.body.replaceChildren();
            if (areOnlineExtrasEnabled() && this.details.open) void this.load();
        };
        this.stopExtrasWatch = onOnlineExtrasChange(updateExtras);
        updateExtras();
        this.details.addEventListener('toggle', () => { if (this.details.open && !this.loaded && !this.loading) void this.load(); });
    }
    destroy(): void { this.stopExtrasWatch(); this.alive = false; this.generation++; }
    private async load(): Promise<void> {
        if (!areOnlineExtrasEnabled()) { this.body.replaceChildren(); el(this.body, 'p', 'lorebase-person-muted', onlineExtrasText('disabled')); return; }
        const generation = ++this.generation;
        this.loading = true; this.body.replaceChildren(); el(this.body, 'p', 'lorebase-person-muted', pt('loading'));
        try {
            const cast = await this.service.cast(this.item);
            if (!this.alive || generation !== this.generation) return;
            this.cast = cast ?? (this.item.actors || '').split(/[,;]+/).map(name => name.trim()).filter(Boolean)
                .map(name => ({ id: '', name, photo: '', role: '' }));
            this.loaded = true; this.render();
        } catch {
            if (!this.alive || generation !== this.generation) return;
            this.body.replaceChildren(); el(this.body, 'p', 'lorebase-person-muted', this.service.configured() ? pt('failed') : pt('setup'));
            button(this.body, pt('retry'), () => { void this.load(); });
        } finally { if (generation === this.generation) this.loading = false; }
    }
    private render(): void {
        this.body.replaceChildren();
        if (!this.cast.length) { el(this.body, 'p', 'lorebase-person-muted', pt('empty')); return; }
        const main = el(this.body, 'div', 'lorebase-cast-group');
        const heading = el(main, 'div', 'lorebase-cast-group-heading', `${pt('mainCast')} · ${Math.min(MAIN_CAST_LIMIT, this.cast.length)}`);
        heading.title = pt('castOrder');
        el(heading, 'small', 'lorebase-cast-order-note', pt('castOrderShort'));
        this.renderActors(main, this.cast.slice(0, MAIN_CAST_LIMIT));
        const others = this.cast.slice(MAIN_CAST_LIMIT);
        if (!others.length) return;
        const secondary = el(this.body, 'details', 'lorebase-cast-secondary'); secondary.open = this.secondaryOpen;
        const summary = el(secondary, 'summary', 'lorebase-cast-group-heading', `${pt('otherCast')} · ${others.length}`); summary.title = pt('castOrder');
        const content = el(secondary, 'div');
        secondary.addEventListener('toggle', () => {
            if (!this.alive || !areOnlineExtrasEnabled()) return;
            this.secondaryOpen = secondary.open;
            if (secondary.open && !content.childElementCount) this.renderSecondary(content, others);
        });
        if (secondary.open) this.renderSecondary(content, others);
    }
    private renderSecondary(host: HTMLElement, actors: CastMember[]): void {
        host.replaceChildren(); this.renderActors(host, actors.slice(0, this.limit));
        if (actors.length > this.limit) button(host, pt('more'), () => { this.limit += 12; this.renderSecondary(host, actors); });
    }
    private renderActors(host: HTMLElement, actors: CastMember[]): void {
        const grid = el(host, 'div', 'lorebase-cast-grid');
        for (const actor of actors) {
            const card = button(grid, '', () => new PersonFilmographyModal(this.app, this.service, actor.id ? actor : actor.name, this.item.type, actor.role).open(), 'lorebase-cast-card');
            card.title = [actor.name, actor.role].filter(Boolean).join(' · ');
            card.setAttribute('aria-label', [actor.name, actor.role].filter(Boolean).join(' · '));
            peopleImage(el(card, 'div', 'lorebase-cast-photo'), actor.photo, actor.name);
            const name = el(card, 'strong', '', actor.name);
            if (actor.role) {
                const role = el(card, 'span', 'lorebase-cast-role'); peopleIcon(role, 'user-round'); el(role, 'small', '', actor.role);
            }
            void this.service.actorName(actor, this.item.type).then(localized => {
                if (!this.alive || !card.isConnected) return;
                name.textContent = localized;
                const image = card.querySelector('img'); if (image) image.alt = localized;
                card.title = [localized, actor.role].filter(Boolean).join(' · ');
                card.setAttribute('aria-label', card.title);
            }).catch(() => { /* Keep the source name when an alias is unavailable/offline. */ });
        }
    }
}
