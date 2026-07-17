import { setIcon } from 'obsidian';
import { t } from '../../localization';
import type { SettingsSectionContext } from './types';

const REPOSITORY_URL = 'https://github.com/Murchi1k/obsidian-lorebase-plugin';
const CHANGELOG_URL = `${REPOSITORY_URL}/blob/main/README.md#-changelog`;
const DOCUMENTATION_URL = `${REPOSITORY_URL}#readme`;
const AUTHOR_URL = 'https://github.com/Murchi1k';
const LOGO_URL = 'https://github.com/user-attachments/assets/9a3b0b05-7dec-44b4-a950-a4cbca5ed3d3';
const ATTRIBUTION_SOURCES = [
    { name: 'TMDB', mark: 'TM', url: 'https://www.themoviedb.org', note: 'Movies, series metadata and images' },
    { name: 'RAWG', mark: 'RA', url: 'https://rawg.io', note: 'Game metadata and images' },
    { name: 'Steam', mark: 'ST', url: 'https://store.steampowered.com', note: 'Steam game metadata' },
    { name: 'SteamGridDB', mark: 'SG', url: 'https://www.steamgriddb.com', note: 'Game artwork' },
    { name: 'IGDB', mark: 'IG', url: 'https://www.igdb.com', note: 'Game metadata and images' },
    { name: 'AniList', mark: 'AL', url: 'https://anilist.co', note: 'Anime metadata and images' },
    { name: 'Shikimori', mark: 'SH', url: 'https://shikimori.one', note: 'Anime metadata and images' },
    { name: 'Hardcover', mark: 'HC', url: 'https://hardcover.app', note: 'Book metadata and cover images' },
    { name: 'Google Books', mark: 'GB', url: 'https://books.google.com', note: 'Book metadata and cover images' },
    { name: 'Jikan', mark: 'JK', url: 'https://jikan.moe', note: 'Manga metadata from MyAnimeList' },
    { name: 'MangaDex', mark: 'MD', url: 'https://mangadex.org', note: 'Manga metadata and cover images' },
    { name: 'TVmaze', mark: 'TV', url: 'https://www.tvmaze.com', note: 'Series metadata and images' },
    { name: 'OMDb', mark: 'OM', url: 'https://www.omdbapi.com', note: 'Movie and series metadata' },
] as const;

export function renderAboutSection(context: SettingsSectionContext, container: HTMLElement): void {
    context.createSectionHeader(container, 'lucide:info', t('settingsAbout'));

    const card = container.createDiv({ cls: 'lorebase-about-card' });
    const header = card.createDiv({ cls: 'lorebase-about-header' });
    header.createEl('img', {
        cls: 'lorebase-about-logo',
        attr: {
            src: LOGO_URL,
            alt: `${context.plugin.manifest.name} logo`,
            loading: 'lazy',
        },
    });
    const identity = header.createDiv({ cls: 'lorebase-about-identity' });
    identity.createDiv({ cls: 'lorebase-about-name', text: context.plugin.manifest.name });
    identity.createDiv({
        cls: 'lorebase-about-version',
        text: `${t('settingsAboutVersion')} ${context.plugin.manifest.version}`,
    });

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

    const links = container.createDiv({ cls: 'lorebase-about-links-card' });
    links.createDiv({ cls: 'lorebase-about-block-title', text: t('settingsAboutLinks') });
    const linkGrid = links.createDiv({ cls: 'lorebase-about-link-grid' });
    createLinkButton(linkGrid, 'github', t('settingsAboutGitHub'), REPOSITORY_URL);
    createLinkButton(linkGrid, 'file-clock', t('settingsAboutChangelog'), CHANGELOG_URL);
    createLinkButton(linkGrid, 'book-open', t('settingsAboutDocumentation'), DOCUMENTATION_URL);

    const attribution = container.createDiv({ cls: 'lorebase-about-attribution-card' });
    const attributionHeader = attribution.createDiv({ cls: 'lorebase-about-attribution-header' });
    const attributionIcon = attributionHeader.createSpan({ cls: 'lorebase-about-attribution-header-icon' });
    setIcon(attributionIcon, 'database');
    const attributionTitle = attributionHeader.createDiv();
    attributionTitle.createDiv({ cls: 'lorebase-about-block-title', text: t('settingsAboutAttribution') });
    attributionTitle.createDiv({ cls: 'lorebase-about-block-desc', text: t('settingsAboutAttributionDesc') });
    const notice = attribution.createDiv({ cls: 'lorebase-about-attribution-notice' });
    const noticeIcon = notice.createSpan({ cls: 'lorebase-about-attribution-notice-icon' });
    setIcon(noticeIcon, 'shield-check');
    notice.createSpan({ text: t('settingsAboutAttributionTmdbNotice') });
    const attributionGrid = attribution.createDiv({ cls: 'lorebase-about-attribution-grid' });
    ATTRIBUTION_SOURCES.forEach((source) => {
        createAttributionItem(attributionGrid, source.name, source.mark, source.note, source.url);
    });

}

function createAttributionItem(container: HTMLElement, name: string, mark: string, note: string, href: string): void {
    const item = container.createEl('a', {
        cls: 'lorebase-about-attribution-item',
        attr: { href, target: '_blank', rel: 'noopener' },
    });
    item.addEventListener('click', (event) => {
        event.preventDefault();
        window.open(href, '_blank', 'noopener');
    });
    item.createSpan({ cls: 'lorebase-about-attribution-mark', text: mark });
    const text = item.createSpan({ cls: 'lorebase-about-attribution-text' });
    text.createSpan({ cls: 'lorebase-about-attribution-name', text: name });
    text.createSpan({ cls: 'lorebase-about-attribution-note', text: note });
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
            attr: { href, target: '_blank', rel: 'noopener' },
        });
        link.addEventListener('click', (event) => {
            event.preventDefault();
            window.open(href, '_blank', 'noopener');
        });
        return;
    }
    text.createDiv({ cls: 'lorebase-about-meta-value', text: value });
}

function createLinkButton(container: HTMLElement, iconName: string, label: string, href: string): void {
    const button = container.createEl('button', {
        cls: 'lorebase-about-link-button',
        attr: { type: 'button' },
    });
    const icon = button.createSpan({ cls: 'lorebase-about-link-icon' });
    setIcon(icon, iconName);
    button.createSpan({ text: label });
    const externalIcon = button.createSpan({ cls: 'lorebase-about-link-external' });
    setIcon(externalIcon, 'external-link');
    button.addEventListener('click', () => window.open(href, '_blank', 'noopener'));
}
