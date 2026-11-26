import { mt } from '../../localization/music';
import { Notice, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../constants';
import { i18n, t } from '../../localization';
import { MangaWorkTypesEditor } from '../../components/MangaWorkTypesEditor';
import { AnimeCountriesEditor } from '../../components/AnimeCountriesEditor';
import { FolderSuggest } from '../../components/FolderSuggest';
import { ICON_MEDIA } from './constants';
import { renderLocalImageSettings } from './experiment';
import { renderMediaSwitch } from './mediaSwitch';
import type { MediaTypeKey, SettingsSectionContext } from './types';
import { MEDIA_SETTINGS_ICONS } from '../../mediaPresentation';

export type LibraryMediaKey = MediaTypeKey | 'music';
export const MEDIA_SETTINGS_OPTIONS: Array<{
    key: LibraryMediaKey;
    label: () => string;
    icon: string;
}> = [
    { key: 'games', label: () => t('settingsGames'), icon: MEDIA_SETTINGS_ICONS.games },
    { key: 'anime', label: () => t('settingsAnime'), icon: MEDIA_SETTINGS_ICONS.anime },
    { key: 'movies', label: () => t('settingsMovies'), icon: MEDIA_SETTINGS_ICONS.movies },
    { key: 'series', label: () => t('settingsSeries'), icon: MEDIA_SETTINGS_ICONS.series },
    { key: 'books', label: () => t('settingsBooks'), icon: MEDIA_SETTINGS_ICONS.books },
    { key: 'manga', label: () => t('settingsManga'), icon: MEDIA_SETTINGS_ICONS.manga },
    { key: 'music', label: () => mt('music'), icon: 'music' },
];

export function renderMediaSettings(context: SettingsSectionContext, container: HTMLElement): void {
    context.createSectionHeader(container, ICON_MEDIA, t('settingsMedia'));

    const { plugin } = context;
    const root = container.createDiv({ cls: 'lorebase-media-settings lorebase-media-directory' });
    root.createDiv({ cls: 'lorebase-settings-section-description', text: t('settingsMediaDesc') });
    const directory = root.createEl('section', { cls: 'lorebase-media-card' });
    const header = directory.createDiv({ cls: 'lorebase-media-card-header' });
    const heading = header.createEl('h3');
    setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), 'library');
    heading.createSpan({ text: t('settingsMediaLibraries') });
    const counter = header.createSpan({ cls: 'lorebase-media-count', attr: { role: 'status' } });
    const list = directory.createDiv({ cls: 'lorebase-media-library-list' });

    const enabled = plugin.settings.enabledMedia;
    const updateCount = (): void => {
        const count = MEDIA_SETTINGS_OPTIONS.filter(option => enabled[option.key]).length;
        counter.setText(t('settingsMediaShown').replace('{count}', String(count)).replace('{total}', String(MEDIA_SETTINGS_OPTIONS.length)));
    };
    const save = async (): Promise<void> => {
        await plugin.saveSettings();
        plugin.refreshViews();
    };
    for (const { key, label, icon } of MEDIA_SETTINGS_OPTIONS) {
        const name = label();
        const row = list.createDiv({ cls: 'lorebase-media-library-row is-' + key });
        row.toggleClass('is-hidden-library', !enabled[key]);
        const top = row.createDiv({ cls: 'lorebase-media-library-top' });
        const identity = top.createDiv({ cls: 'lorebase-media-library-identity' });
        setIcon(identity.createSpan({ cls: 'lorebase-media-library-icon', attr: { 'aria-hidden': 'true' } }), icon);
        identity.createSpan({ cls: 'lorebase-media-library-name', text: name });
        const visibility = top.createDiv({ cls: 'lorebase-media-library-visibility' });
        renderMediaSwitch(visibility, name + ' · ' + t('settingsMediaVisibility'), enabled[key], value => {
            if (!value && !MEDIA_SETTINGS_OPTIONS.some(option => option.key !== key && enabled[option.key])) {
                new Notice(t('settingsMediaKeepOne'));
                return false;
            }
            enabled[key] = value;
            row.toggleClass('is-hidden-library', !value);
            updateCount();
            void save();
            return true;
        });
        renderLibraryFolder(context, row, key, name, save);
    }
    updateCount();
    directory.createDiv({ cls: 'lorebase-media-folder-help', text: t('settingsMediaFolderHelp') });

    const extras = root.createDiv({ cls: 'lorebase-media-extras' });
    const adult = extras.createEl('section', { cls: 'lorebase-media-card lorebase-media-adult' });
    const adultHeader = adult.createDiv({ cls: 'lorebase-media-card-header' }).createEl('h3');
    setIcon(adultHeader.createSpan({ attr: { 'aria-hidden': 'true' } }), 'shield');
    adultHeader.createSpan({ text: t('settingsShowAdult') });
    adult.createDiv({ cls: 'lorebase-media-card-description', text: t('settingsDescShowAdult') });
    const filters = adult.createDiv({ cls: 'lorebase-media-adult-filters' });
    for (const [key, name] of [['games', t('settingsGames')], ['anime', t('settingsAnime')], ['manga', t('settingsManga')]] as const) {
        const row = filters.createDiv({ cls: 'lorebase-media-adult-option' });
        row.createSpan({ text: name });
        renderMediaSwitch(row, name + ' · ' + t('settingsShowAdult'), plugin.settings[key].showAdultInAll, value => {
            plugin.settings[key].showAdultInAll = value;
            void save();
            return true;
        });
    }
    renderLocalImageSettings(context, extras);
}

function renderLibraryFolder(
    context: SettingsSectionContext, row: HTMLElement, key: LibraryMediaKey, name: string, save: () => Promise<void>
): void {
    const settings = context.plugin.settings[key];
    const folder = row.createDiv({ cls: 'lorebase-media-library-folder' });
    const edit = folder.createEl('button', {
        cls: 'lorebase-media-path',
        attr: {
            type: 'button', 'aria-label': t('settingsMediaFolderEdit') + ' · ' + name,
            'aria-expanded': 'false', 'aria-controls': 'lorebase-media-folder-' + key,
        },
    });
    setIcon(edit.createSpan({ cls: 'lorebase-media-path-icon', attr: { 'aria-hidden': 'true' } }), 'folder');
    const path = edit.createSpan({ cls: 'lorebase-media-path-label' });
    setIcon(edit.createSpan({ cls: 'lorebase-media-path-edit', attr: { 'aria-hidden': 'true' } }), 'pencil');
    const updatePath = (): void => {
        path.setText(settings.folderPath || t('settingsFolder'));
        edit.title = settings.folderPath || t('settingsMediaFolderEdit');
    };
    updatePath();

    const editor = folder.createEl('form', {
        cls: 'lorebase-media-path-editor', attr: { id: 'lorebase-media-folder-' + key },
    });
    editor.hidden = true;
    const input = editor.createEl('input', {
        type: 'text', attr: { placeholder: DEFAULT_SETTINGS[key].folderPath, 'aria-label': t('settingsFolder') + ' · ' + name, spellcheck: 'false' },
    });
    const confirm = editor.createEl('button', {
        cls: 'lorebase-media-path-save',
        attr: { type: 'submit', 'aria-label': t('settingsMediaFolderSave'), title: t('settingsMediaFolderSave') },
    });
    setIcon(confirm, 'check');
    const cancel = editor.createEl('button', {
        attr: { type: 'button', 'aria-label': t('deleteCancel'), title: t('deleteCancel') },
    });
    setIcon(cancel, 'x');

    const close = (): void => {
        editor.hidden = true;
        edit.hidden = false;
        edit.setAttribute('aria-expanded', 'false');
        edit.focus();
        suggestion.close();
    };
    const commit = (value: string): void => {
        if (editor.hidden) return;
        const next = value.trim();
        close();
        if (settings.folderPath === next) return;
        settings.folderPath = next;
        updatePath();
        void save();
    };
    const suggestion = new FolderSuggest(context.app, input, commit);
    edit.addEventListener('click', () => {
        input.value = settings.folderPath;
        edit.setAttribute('aria-expanded', 'true');
        editor.hidden = false;
        edit.hidden = true;
        input.focus();
        input.select();
    });
    editor.addEventListener('submit', event => {
        event.preventDefault();
        commit(input.value);
    });
    editor.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.stopPropagation();
        close();
    });
    cancel.addEventListener('click', close);
}

const typeNames = {
    en: { games: 'Game types', movies: 'Movie types', series: 'Series types', manga: 'Manga types', anime: 'Anime countries' },
    ru: { games: 'Типы игр', movies: 'Типы фильмов', series: 'Типы сериалов', manga: 'Типы манги', anime: 'Страны аниме' },
    uk: { games: 'Типи ігор', movies: 'Типи фільмів', series: 'Типи серіалів', manga: 'Типи манґи', anime: 'Країни аніме' },
    'zh-CN': { games: '游戏类型', movies: '电影类型', series: '剧集类型', manga: '漫画类型', anime: '动漫国家' },
};

export function getCardTypeSettingsTitle(media: Exclude<MediaTypeKey, 'books'>): string {
    return typeNames[i18n.getLanguage()][media];
}

export function renderCardTypeSettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    media: MediaTypeKey,
    updatePreview: () => void,
): void {
    if (media === 'books') return;
    const panel = container.createDiv({ cls: 'lorebase-media-work-types-settings' });
    const editor = panel.createDiv();
    const onChanged = (): void => { context.onMangaWorkTypesChanged?.(); updatePreview(); };
    if (media === 'anime') {
        new AnimeCountriesEditor(editor, context.plugin, onChanged);
    } else {
        new MangaWorkTypesEditor(editor, context.plugin, onChanged,
            media === 'games' ? 'game' : media === 'movies' ? 'movie' : media === 'series' ? 'series' : 'manga');
    }
}
