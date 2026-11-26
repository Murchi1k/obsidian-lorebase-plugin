import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';
import { onlineExtrasText } from '../localization/onlineExtras';
import { App, setIcon } from 'obsidian';
import { i18n } from '../localization';
import { mt } from '../localization/music';
import type { MusicItem, LorebaseSettings } from '../types';
import { DEFAULT_COVER } from '../constants';
import { MusicCatalog } from '../services/MusicCatalog';
import { MusicService } from '../services/MusicService';
import { ArtistDiscographyModal, musicCompactCount } from '../modals/ArtistDiscographyModal';

export class MusicDiscoveryPanel {
    private generation = 0;
    private alive = true;
    private stats: HTMLElement;
    private artist: HTMLElement;
    private catalog: MusicCatalog;
    private refreshButton: HTMLButtonElement;
    private stopExtrasWatch: () => void;
    constructor(private app: App, parent: HTMLElement, private draft: MusicItem, private settings: LorebaseSettings, private service: MusicService) {
        this.catalog = new MusicCatalog(() => settings.music.lastfmApiKey, provider => settings.music.providerEnabled?.[provider] !== false);
        const panel = parent.createEl('section', { cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-music-listening-panel' });
        const header = panel.createDiv({ cls: 'lorebase-music-sidebar-header' });
        header.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: mt('listeningTitle') });
        header.createSpan({ cls: 'lorebase-music-stats-source', text: 'Last.fm' });
        const refresh = header.createEl('button', { cls: 'lorebase-music-sidebar-refresh', attr: { type: 'button', 'aria-label': mt('refresh'), title: mt('refresh') } });
        this.refreshButton = refresh;
        setIcon(refresh, 'refresh-cw');
        this.stats = panel.createDiv({ cls: 'lorebase-music-listening-body', attr: { 'aria-live': 'polite' } });
        this.artist = parent.createEl('section', { cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-music-artist-panel' });
        const updateExtras = () => {
            panel.hidden = this.artist.hidden = !areOnlineExtrasEnabled();
            void this.load(refresh);
        };
        this.stopExtrasWatch = onOnlineExtrasChange(updateExtras);
        this.paintStats();
        refresh.addEventListener('click', () => { void this.load(refresh); });
        void this.load(refresh);
    }
    private paintStats(message?: string): void {
        this.stats.empty();
        const stats = this.draft.listeningStats;
        if (stats) {
            for (const [key, label, icon] of [['listeners', 'listeners', 'users'], ['plays', 'plays', 'headphones']] as const) {
                const row = this.stats.createDiv({ cls: 'lorebase-music-count-row' });
                setIcon(row.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
                row.createSpan({ text: mt(label) });
                row.createEl('strong', { text: stats[key] === null ? '—' : musicCompactCount(stats[key]), attr: { title: stats[key]?.toLocaleString(i18n.getLanguage()) || '' } });
            }
        } else this.stats.createDiv({ cls: 'lorebase-music-sidebar-hint', text: message || mt('noStats') });
    }
    private async load(button: HTMLButtonElement): Promise<void> {
        if (!areOnlineExtrasEnabled()) {
            this.generation++;
            button.disabled = true;
            this.paintStats(onlineExtrasText('disabled'));
            this.artist.setText(onlineExtrasText('disabled'));
            return;
        }
        const generation = ++this.generation;
        const identity = `${this.draft.artist}\n${this.draft.displayName}`;
        const current = () => this.alive && generation === this.generation && identity === `${this.draft.artist}\n${this.draft.displayName}`;
        button.disabled = true;
        const key = this.settings.music.providerEnabled?.lastfm !== false && this.settings.music.lastfmApiKey.trim();
        if (!this.draft.listeningStats) this.paintStats(mt(key ? 'loading' : 'statsHelp'));
        this.artist.setText(mt('loading'));
        const results = await Promise.allSettled([
            key ? this.catalog.listeningStats(this.draft) : Promise.resolve(undefined),
            this.draft.artist.trim() ? this.catalog.artist(this.draft.artist, this.draft.deezerArtistId, this.draft.musicKind === 'album' ? this.draft.displayName : undefined) : Promise.resolve(null),
        ]);
        if (!current()) { if (this.alive) button.disabled = false; return; }
        button.disabled = false;
        if (results[0].status === 'fulfilled') {
            if (key) this.draft.listeningStats = results[0].value;
            this.paintStats(key ? undefined : mt('statsHelp'));
        } else this.paintStats(mt('error'));
        this.artist.empty();
        const artist = results[1].status === 'fulfilled' ? results[1].value : null;
        this.artist.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: mt('artist') });
        if (artist) {
            const card = this.artist.createEl('button', { cls: 'lorebase-music-artist-card', attr: { type: 'button', 'aria-label': `${mt('artistHint')}: ${artist.name}` } });
            const image = card.createEl('img', { attr: { src: artist.image || DEFAULT_COVER, alt: '', decoding: 'async', referrerpolicy: 'no-referrer' } });
            image.addEventListener('error', () => { image.src = DEFAULT_COVER; }, { once: true });
            const info = card.createSpan();
            info.createEl('strong', { text: artist.name });
            const count = artist.listeners ?? artist.fans;
            if (count !== null) info.createSpan({ text: `${musicCompactCount(count)} ${mt(artist.listeners === null ? 'fans' : 'listeners').toLocaleLowerCase()} · ${artist.listeners === null ? 'Deezer' : 'Last.fm'}` });
            info.createSpan({ cls: 'lorebase-music-artist-link', text: mt(artist.id ? 'artistHint' : 'artistMissing') });
            setIcon(card.createSpan({ cls: 'lorebase-music-artist-arrow' }), 'chevron-right');
            card.disabled = !artist.id;
            if (artist.id) this.draft.deezerArtistId = artist.id;
            card.addEventListener('click', () => new ArtistDiscographyModal(this.app, artist, this.catalog, this.service).open());
        } else this.artist.createDiv({ cls: 'lorebase-music-sidebar-hint', text: mt('artistMissing') });
        this.artist.createDiv({ cls: 'lorebase-music-online-notice', text: mt('onlineShort'), attr: { title: mt('onlineMusic') } });
    }
    refreshIdentity(): void {
        this.draft.listeningStats = undefined;
        this.draft.deezerArtistId = undefined;
        this.paintStats();
        void this.load(this.refreshButton);
    }
    destroy(): void { this.stopExtrasWatch(); this.alive = false; this.generation++; }
}
