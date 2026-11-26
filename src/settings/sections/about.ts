
import { setIcon } from 'obsidian';
import { mt } from '../../localization/music';
import { i18n, t } from '../../localization';
import { getAboutContent, getAboutDetails } from './aboutContent';
import type { SettingsSectionContext } from './types';

const AUTHOR_URL = 'https://github.com/Murchi1k';
const LOGO_URL = 'https://github.com/user-attachments/assets/9a3b0b05-7dec-44b4-a950-a4cbca5ed3d3';
const ATTRIBUTION_SOURCES = [
    { name: 'TMDB', url: 'https://www.themoviedb.org', note: 'video', group: 'video' },
    { name: 'RAWG', url: 'https://rawg.io', note: 'games', group: 'games' },
    { name: 'Steam', url: 'https://store.steampowered.com', note: 'games', group: 'games' },
    { name: 'SteamGridDB', url: 'https://www.steamgriddb.com', note: 'gameArtwork', group: 'games' },
    { name: 'IGDB', url: 'https://www.igdb.com', note: 'games', group: 'games' },
    { name: 'AniList', url: 'https://anilist.co', note: 'animeManga', group: 'animeManga' },
    { name: 'Shikimori', url: 'https://shikimori.one', note: 'animeManga', group: 'animeManga' },
    { name: 'Open Library', url: 'https://openlibrary.org', note: 'books', group: 'books' },
    { name: 'Hardcover', url: 'https://hardcover.app', note: 'books', group: 'books' },
    { name: 'Google Books', url: 'https://books.google.com', note: 'books', group: 'books' },
    { name: 'MangaUpdates', url: 'https://www.mangaupdates.com', note: 'mangaRatings', group: 'animeManga' },
    { name: 'MangaDex', url: 'https://mangadex.org', note: 'mangaArtwork', group: 'animeManga' },
    { name: 'TVmaze', url: 'https://www.tvmaze.com', note: 'series', group: 'video' },
    { name: 'OMDb', url: 'https://www.omdbapi.com', note: 'video', group: 'video' },
    { name: 'Kitsu', url: 'https://kitsu.app', note: 'anime', group: 'animeManga' },
    { name: 'HowLongToBeat', url: 'https://howlongtobeat.com', note: 'gameTime', group: 'games' },
    { name: 'Deezer', url: 'https://www.deezer.com', note: 'music', group: 'music' },
    { name: 'MusicBrainz', url: 'https://musicbrainz.org', note: 'music', group: 'music' },
    { name: 'Last.fm', url: 'https://www.last.fm', note: 'music', group: 'music' },
    { name: 'Cover Art Archive', url: 'https://coverartarchive.org', note: 'musicArtwork', group: 'music' },
    { name: 'Steam', url: 'https://store.steampowered.com', note: 'sync', group: 'sync' },
    { name: 'AniList', url: 'https://anilist.co', note: 'sync', group: 'sync' },
    { name: 'Trakt', url: 'https://trakt.tv', note: 'sync', group: 'sync' },
    { name: 'PlayStation', url: 'https://www.playstation.com', note: 'sync', group: 'sync' },
] as const;

export function renderAboutSection(
    context: SettingsSectionContext,
    container: HTMLElement
): void {
    const content = getAboutContent(i18n.getLanguage());
    const details = getAboutDetails(i18n.getLanguage());
    context.createSectionHeader(container, 'lucide:info', t('settingsAbout'));

    const card = container.createDiv({ cls: 'lorebase-about-card lorebase-about-overview' });
    const header = card.createDiv({ cls: 'lorebase-about-header' });
    const brand = header.createDiv({ cls: 'lorebase-about-brand-mark' });
    setIcon(brand.createSpan({ cls: 'lorebase-about-brand-fallback', attr: { 'aria-hidden': 'true' } }), 'box');
    const logo = brand.createEl('img', {
        cls: 'lorebase-about-logo',
        attr: {
            src: LOGO_URL,
            alt: `${context.plugin.manifest.name} logo`,
            loading: 'lazy',
        },
    });
    logo.addEventListener('load', () => brand.addClass('has-logo'));
    if (logo.complete && logo.naturalWidth) brand.addClass('has-logo');
    const identity = header.createDiv({ cls: 'lorebase-about-identity' });
    identity.createDiv({ cls: 'lorebase-about-name', text: context.plugin.manifest.name });
    identity.createSpan({ cls: 'lorebase-about-version', text: `v${context.plugin.manifest.version}`,
        attr: { 'aria-label': `${t('settingsAboutVersion')} ${context.plugin.manifest.version}` } });

    const documentation = header.createDiv({ cls: 'lorebase-about-documentation' });
    const docButton = documentation.createEl('button', { cls: 'lorebase-about-link-button is-coming-soon', attr: {
        type: 'button', 'aria-disabled': 'true', title: details.docsSoon,
    } });
    docButton.disabled = true;
    setIcon(docButton.createSpan({ cls: 'lorebase-about-link-icon' }), 'book-open');
    docButton.createSpan({ text: t('settingsAboutDocumentation') });
    docButton.createSpan({ cls: 'lorebase-about-soon', text: details.soon });

    card.createDiv({ cls: 'lorebase-about-description', text: t('settingsAboutDesc') });

    const meta = card.createDiv({ cls: 'lorebase-about-meta' });
    createMetaItem(meta, 'user-round', t('settingsAboutAuthor'), context.plugin.manifest.author, AUTHOR_URL);
    createMetaItem(meta, 'blocks', t('settingsAboutObsidian'), `${context.plugin.manifest.minAppVersion}+`);
    createMetaItem(
        meta,
        'monitor',
        t('settingsAboutPlatforms'),
        t('settingsAboutDesktop')
    );

    const attribution = container.createDiv({ cls: 'lorebase-about-attribution-card lorebase-about-sources' });
    const attributionHeader = attribution.createDiv({ cls: 'lorebase-about-attribution-header' });
    const attributionIcon = attributionHeader.createSpan({ cls: 'lorebase-about-attribution-header-icon' });
    setIcon(attributionIcon, 'database');
    const attributionTitle = attributionHeader.createDiv();
    attributionTitle.createDiv({ cls: 'lorebase-about-block-title', text: t('settingsAboutAttribution') });
    attributionTitle.createDiv({ cls: 'lorebase-about-block-desc', text: details.sources });
    const notices = attribution.createDiv({ cls: 'lorebase-about-legal' });
    const rights = notices.createDiv({ cls: 'lorebase-about-rights-notice', attr: { role: 'note' } });
    const rightsTitle = rights.createDiv({ cls: 'lorebase-about-notice-heading' });
    setIcon(rightsTitle.createSpan({ cls: 'lorebase-about-rights-icon', attr: { 'aria-hidden': 'true' } }), 'copyright');
    rightsTitle.createEl('strong', { text: details.rightsTitle });
    rights.createEl('p', { text: details.rights });
    rights.createEl('p', { text: details.rightsUsage });
    rights.createEl('p', { text: details.independence });
    const notice = notices.createDiv({ cls: 'lorebase-about-tmdb-notice', attr: { role: 'note' } });
    const tmdbTitle = notice.createDiv({ cls: 'lorebase-about-notice-heading' });
    tmdbTitle.createEl('strong', { text: details.tmdbTitle });
    notice.createEl('p', { text: details.tmdb });
    if (i18n.getLanguage() !== 'en') notice.createEl('p', {
        cls: 'lorebase-about-tmdb-original',
        text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    });
    const directory = attribution.createDiv({ cls: 'lorebase-about-source-directory' });
    const groups = [
        { key: 'games', label: t('settingsGames'), icon: 'gamepad-2' },
        { key: 'animeManga', label: `${t('settingsAnime')} / ${t('settingsManga')}`, icon: 'sparkles' },
        { key: 'video', label: `${t('settingsMovies')} / ${t('settingsSeries')}`, icon: 'clapperboard' },
        { key: 'books', label: t('settingsBooks'), icon: 'book-open' },
        { key: 'music', label: mt('music'), icon: 'music' },
        { key: 'sync', label: 'Sync', icon: 'refresh-cw' },
    ] as const;
    for (const group of groups) {
        const row = directory.createDiv({ cls: 'lorebase-about-source-group' });
        const heading = row.createEl('h3');
        setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), group.icon);
        heading.createSpan({ text: group.label });
        const links = row.createDiv({ cls: 'lorebase-about-source-links' });
        for (const source of ATTRIBUTION_SOURCES.filter(source => source.group === group.key)) {
            createAttributionItem(links, source.name, content.sources[source.note], source.url);
        }
    }
    attribution.appendChild(notices);

}

function createAttributionItem(container: HTMLElement, name: string, note: string, href: string): void {
    const item = container.createEl('a', {
        cls: 'lorebase-about-attribution-item',
        attr: { href, target: '_blank', rel: 'noopener noreferrer', title: `${name}\n${href}\n${note}`, 'aria-label': `${name} · ${note}` },
    });
    item.addEventListener('click', (event) => {
        event.preventDefault();
        window.open(href, '_blank', 'noopener');
    });
    const text = item.createSpan({ cls: 'lorebase-about-attribution-text' });
    text.createSpan({ cls: 'lorebase-about-attribution-name', text: name });
    const icon = item.createSpan({ cls: 'lorebase-about-attribution-external' });
    setIcon(icon, 'external-link');
}

function createMetaItem(
    container: HTMLElement,
    iconName: string,
    label: string,
    value: string,
    href?: string
): void {
    const item = container.createDiv({ cls: 'lorebase-about-meta-item' });
    const icon = item.createSpan({ cls: 'lorebase-about-meta-icon' });
    setIcon(icon, iconName);
    const text = item.createDiv({ cls: 'lorebase-about-meta-text' });
    text.createDiv({ cls: 'lorebase-about-meta-label', text: label });
    if (href) {
        const link = text.createEl('a', {
            cls: 'lorebase-about-meta-value',
            text: value,
            attr: { href, target: '_blank', rel: 'noopener', title: href },
        });
        link.addEventListener('click', (event) => {
            event.preventDefault();
            window.open(href, '_blank', 'noopener');
        });
        return;
    }
    text.createDiv({ cls: 'lorebase-about-meta-value', text: value });
}
