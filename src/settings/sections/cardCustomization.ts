import { setIcon } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../constants';
import { i18n, t } from '../../localization';
import { CARD_MEDIA_KEYS, getCardProfile, type ConfigurableCardMedia } from '../../services/media/cardProfiles';
import type { BadgePosition, CardOrientation, MediaType } from '../../types';
import { createCardPreview, type BadgeField, type TextField } from './cardPreview';
import { renderCardSizeSettings } from './cardSizing';
import { renderCardBadgeSettings } from './cardBadges';
import { renderChoiceButtons } from './choiceButtons';
import { getCardTypeSettingsTitle, MEDIA_SETTINGS_OPTIONS, renderCardTypeSettings, type LibraryMediaKey } from './library';
import { renderMediaSwitch } from './mediaSwitch';
import { renderMusicCardSettings } from './music';
import { renderPartPosterSetting } from './partPosters';
import type { MediaTypeKey, SettingsSectionContext } from './types';

type Pane = 'size' | 'badges' | 'appearance' | 'types';
type Request = { media: LibraryMediaKey; pane?: Pane };
const selections = new WeakMap<object, Request>();
const orientations = new WeakMap<object, CardOrientation>();
type PreviewMode = 'hidden' | 'normal' | 'expanded';
const previewModes = new WeakMap<object, PreviewMode>();
const mediaTypes = Object.keys(CARD_MEDIA_KEYS) as MediaType[];
const configurable = mediaTypes.filter((media): media is ConfigurableCardMedia => media !== 'music');

const label = (en: string, ru: string, uk: string, zh: string): string => (
    { en, ru, uk, 'zh-CN': zh }[i18n.getLanguage()]
);

export function requestCardSettings(plugin: object, media: MediaTypeKey, focus?: 'types' | 'progress'): void {
    selections.set(plugin, { media, pane: focus === 'types' ? 'types' : focus === 'progress' || media === 'books' ? 'appearance' : undefined });
}

export function renderCardWorkspace(
    context: SettingsSectionContext, container: HTMLElement, renderStatuses: (container: HTMLElement, updatePreview: () => void) => void,
): void {
    const plugin = context.plugin;
    const settings = plugin.settings;
    const saved = selections.get(plugin);
    let media = saved?.media ?? 'games';
    let pane: Pane | undefined = saved?.pane ?? 'size';
    let orientation = orientations.get(plugin) ?? (settings[media].orientation === 'horizontal' ? 'horizontal' : 'vertical');
    let hover = true;
    let longText = false;
    let previewMode = previewModes.get(plugin) ?? 'normal';
    let previewDevice: 'desktop' | 'mobile' = window.matchMedia('(max-width: 520px)').matches ? 'mobile' : 'desktop';
    const mediaPicker = container.createDiv({ cls: 'lorebase-card-media-picker' });
    const previewLayout = container.createDiv({ cls: 'lorebase-card-preview-layout' });
    const workspace = container.createDiv({ cls: 'lorebase-card-workspace' });
    workspace.dataset.previewMode = previewMode;
    const rail = workspace.createDiv({ cls: 'lorebase-card-preview-stage' });
    rail.hidden = previewMode === 'hidden';
    const chrome = rail.createDiv({ cls: 'lorebase-card-mini-chrome' });
    const previewHeading = chrome.createDiv({ cls: 'lorebase-card-mini-heading' });
    const previewTitle = previewHeading.createDiv({ cls: 'lorebase-card-preview-title' });
    previewTitle.createEl('strong', { text: t('settingsPreview') });
    const previewHelp = previewTitle.createEl('details', { cls: 'lorebase-card-preview-help' });
    const helpButton = previewHelp.createEl('summary', { attr: { 'aria-label': t('settingsPreviewHelp'), title: t('settingsPreviewHelp') } });
    setIcon(helpButton, 'circle-help');
    const helpBody = previewHelp.createDiv({ cls: 'lorebase-card-preview-help-panel', attr: { role: 'dialog', 'aria-label': t('settingsPreviewHelp') } });
    helpBody.createDiv({ cls: 'setting-item-description', text: t('settingsBadgesEditorHint') });
    const textHint = helpBody.createDiv({ cls: 'setting-item-description', text: t('settingsOverlayHint') });
    previewHelp.addEventListener('toggle', () => { helpButton.setAttribute('aria-expanded', String(previewHelp.open)); });
    helpButton.setAttribute('aria-expanded', 'false');
    document.addEventListener('pointerdown', event => {
        if (previewHelp.open && event.target instanceof Node && !previewHelp.contains(event.target)) previewHelp.open = false;
    }, { signal: context.signal });
    previewHelp.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); previewHelp.open = false; helpButton.focus(); }
    });
    const previewHost = rail.createDiv();
    const previewTools = rail.createDiv({ cls: 'lorebase-card-preview-footer' });
    const previewActions = rail.createDiv({ cls: 'lorebase-card-preview-actions' });
    const controls = workspace.createDiv({ cls: 'lorebase-card-controls' });
    let body: HTMLElement;
    const panels = new Map<Pane, { root: HTMLDetailsElement; body: HTMLElement }>();
    const type = (): MediaType => mediaTypes.find(key => CARD_MEDIA_KEYS[key] === media) ?? 'game';
    const profile = () => getCardProfile(settings, type(), orientation);
    const forProfiles = (update: (target: ReturnType<typeof getCardProfile>) => void): void => {
        if (!settings.overlayApplyToAllMedia || type() === 'music') {
            update(profile());
            return;
        }
        for (const key of configurable) {
            update(getCardProfile(settings, key, orientation));
        }
    };
    const draw = (): void => {
        const key = type();
        const shelf = key === 'book' && Boolean(settings.books.bookshelfEffect);
        previewHelp.hidden = previewTools.hidden = previewActions.hidden = shelf;
        if (shelf) previewHelp.open = false;
        textHint.textContent = key === 'music'
            ? label('Drag the title or artist to move it. Guides help align the text. Double-click a field to show or hide it.', 'Перетаскивайте название или исполнителя. Направляющие помогут выровнять текст. Двойной клик по полю включает или скрывает его.', 'Перетягуйте назву чи виконавця. Напрямні допоможуть вирівняти текст. Подвійний клік вмикає або приховує поле.', '拖动标题或艺人文字，参考线帮助对齐。双击字段可显示或隐藏。')
            : t('settingsOverlayHint');
        const scopeControl = previewHelp.querySelector<HTMLElement>('.lorebase-card-editor-footer > .lorebase-card-editor-toggle');
        if (scopeControl?.parentElement) scopeControl.parentElement.style.display = key === 'music' ? 'none' : '';
        longTextRow.style.display = key === 'music' ? 'none' : '';
        const orientationControl = previewHeading.querySelector<HTMLElement>('.lorebase-settings-choices');
        if (orientationControl) orientationControl.style.display = shelf ? 'none' : '';
        rail.dataset.orientation = orientation;
        if (previewMode !== 'hidden') drawCard(key, orientation, hover, longText, previewDevice);
    };
    const commit = (): void => {
        draw();
        void plugin.saveSettings();
        plugin.refreshViewsVisuals();
    };
    const hidePreview = previewLayout.createEl('button', { attr: { type: 'button', 'data-preview-action': 'visibility' } });
    const expandPreview = previewLayout.createEl('button', { attr: { type: 'button', 'data-preview-action': 'expand' } });
    const updatePreviewControls = (): void => {
        const hidden = previewMode === 'hidden';
        previewLayout.dataset.hidden = String(hidden);
        if (hidden) workspace.before(previewLayout);
        else previewTitle.after(previewLayout);
        const visibilityLabel = hidden ? label('Show preview', 'Показать превью', 'Показати перегляд', '显示预览')
            : label('Hide preview', 'Скрыть превью', 'Сховати перегляд', '隐藏预览');
        hidePreview.empty();
        setIcon(hidePreview.createSpan({ attr: { 'aria-hidden': 'true' } }), hidden ? 'panel-left' : 'eye-off');
        if (hidden) hidePreview.createSpan({ text: visibilityLabel });
        hidePreview.setAttribute('title', visibilityLabel);
        hidePreview.setAttribute('aria-label', visibilityLabel);
        expandPreview.hidden = hidden;
        const expandLabel = previewMode === 'expanded' ? label('Restore preview size', 'Обычный размер превью', 'Звичайний розмір перегляду', '恢复预览大小')
            : label('Expand preview', 'Расширить превью', 'Розширити перегляд', '放大预览');
        expandPreview.empty();
        setIcon(expandPreview.createSpan({ attr: { 'aria-hidden': 'true' } }), previewMode === 'expanded' ? 'minimize-2' : 'maximize-2');
        expandPreview.setAttribute('title', expandLabel);
        expandPreview.setAttribute('aria-label', expandLabel);
        expandPreview.setAttribute('aria-pressed', String(previewMode === 'expanded'));
    };
    const setPreviewMode = (value: PreviewMode): void => {
        previewMode = value;
        previewModes.set(plugin, value);
        workspace.dataset.previewMode = value;
        rail.hidden = value === 'hidden';
        updatePreviewControls();
        draw();
    };
    hidePreview.addEventListener('click', () => setPreviewMode(previewMode === 'hidden' ? 'normal' : 'hidden'));
    expandPreview.addEventListener('click', () => setPreviewMode(previewMode === 'expanded' ? 'normal' : 'expanded'));
    updatePreviewControls();
    const moveText = (key: TextField, x: number, y: number): void => {
        forProfiles(target => {
            target.layout[key].x = x;
            target.layout[key].y = y;
        });
        commit();
    };
    const moveBadge = (key: BadgeField, position: BadgePosition): void => {
        if (key === 'communityRating') return;
        forProfiles(target => { target.badges[key].position = position; });
        commit();
    };
    const drawCard = createCardPreview(context, previewHost, {
        moveText,
        moveBadge,
        toggleText: key => {
            const visible = !profile().visibility[key];
            forProfiles(target => { target.visibility[key] = visible; });
            commit();
        },
        toggleBadge: key => {
            const enabled = !profile().badges[key].enabled;
            forProfiles(target => { target.badges[key].enabled = enabled; });
            commit();
            if (key === 'communityRating' && pane === 'badges') renderPanel();
        },
        resizeDescription: lines => {
            const key = type();
            const targets = (settings.overlayApplyToAllMedia ? configurable : [key]).flatMap(mediaType =>
                (['vertical', 'horizontal'] as const).map(direction => getCardProfile(settings, mediaType, direction)));
            if (targets.every(target => target.descriptionLines === lines)) return;
            targets.forEach(target => target.setDescriptionLines(lines));
            commit();
        },
    });
    const longTextLabel = label('Long sample text', 'Длинный пример описания', 'Довгий приклад опису', '长描述示例');
    const longTextRow = helpBody.createDiv({ cls: 'lorebase-card-editor-toggle' });
    longTextRow.createSpan({ text: longTextLabel });
    renderMediaSwitch(longTextRow, longTextLabel, longText, value => {
        longText = value;
        draw();
        return true;
    });

    const renderTools = (): void => {
        previewHeading.querySelector('.lorebase-settings-choices')?.remove();
        previewTools.empty();
        renderChoiceButtons(previewHeading, t('settingsOrientation'), [
            { value: 'vertical', label: label('Portrait', 'Вертикаль', 'Вертикаль', '竖版'), icon: 'rectangle-vertical' },
            { value: 'horizontal', label: label('Landscape', 'Горизонталь', 'Горизонталь', '横版'), icon: 'rectangle-horizontal' },
        ], orientation, value => {
            orientation = value;
            orientations.set(plugin, value);
            draw();
            renderPanel();
        });
        const textLabel = label('Show hover text', 'Показывать текст в превью', 'Показувати текст у перегляді', '显示悬停文字');
        previewTools.createSpan({ text: textLabel });
        renderMediaSwitch(previewTools, textLabel, hover, value => { hover = value; draw(); return true; });
    };

    const toggle = (parent: HTMLElement, title: string, enabled: boolean, update: (value: boolean) => void, hint?: string): void => {
        const row = parent.createDiv({ cls: 'lorebase-card-editor-toggle' });
        row.createSpan({ text: title });
        if (hint) row.title = hint;
        renderMediaSwitch(row, title, enabled, value => { update(value); commit(); return true; });
    };
    const editorGroup = (title?: string, icon = 'image'): HTMLElement => {
        const group = body.createDiv({ cls: 'lorebase-card-editor-group' });
        if (title) {
            const heading = group.createDiv({ cls: 'lorebase-card-appearance-heading' });
            setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
            heading.createEl('strong', { text: title });
        }
        return group;
    };
    const renderScope = (): void => {
        const footer = helpBody.createDiv({ cls: 'lorebase-card-editor-footer' });
        const copyProfile = (target: ReturnType<typeof getCardProfile>, source: ReturnType<typeof getCardProfile>): void => {
            for (const key of Object.keys(source.layout) as TextField[]) {
                Object.assign(target.layout[key], source.layout[key]);
                target.visibility[key] = source.visibility[key];
            }
            for (const key of Object.keys(source.badges) as BadgeField[]) Object.assign(target.badges[key], source.badges[key]);
            target.setDescriptionLines(source.descriptionLines);
        };
        const scope = label('Use the same layout for all media', 'Один макет для всех медиа', 'Один макет для всіх медіа', '所有媒体共用布局');
        toggle(footer, scope, settings.overlayApplyToAllMedia, value => {
            settings.overlayApplyToAllMedia = value;
            if (!value) return;
            for (const direction of ['vertical', 'horizontal'] as const) {
                const source = getCardProfile(settings, type(), direction);
                for (const key of configurable) copyProfile(getCardProfile(settings, key, direction), source);
            }
        });
        const reset = previewActions.createEl('button', {
            cls: 'lorebase-card-dimensions-reset lorebase-card-layout-reset',
            attr: { type: 'button' },
        });
        setIcon(reset.createSpan({ attr: { 'aria-hidden': 'true' } }), 'rotate-ccw');
        reset.createSpan({ text: label('Reset layout', 'Сбросить макет', 'Скинути макет', '重置布局') });
        reset.addEventListener('click', () => {
            const resetProfile = (key: ConfigurableCardMedia, direction: CardOrientation): void => {
                copyProfile(getCardProfile(settings, key, direction), getCardProfile(DEFAULT_SETTINGS, key, direction));
            };
            const key = type();
            if (settings.overlayApplyToAllMedia && key !== 'music') {
                for (const mediaType of configurable) for (const direction of ['vertical', 'horizontal'] as const) resetProfile(mediaType, direction);
            } else {
                resetProfile(key, orientation);
                const otherOrientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
                getCardProfile(settings, key, otherOrientation).setDescriptionLines(profile().descriptionLines);
            }
            commit();
            if (pane === 'badges') renderPanel();
        });
    };

    const renderAppearance = (): void => {
        if (media === 'music') { renderMusicCardSettings(context, body, draw); return; }
        const view = settings[media];
        if (media === 'anime' || media === 'series') renderPartPosterSetting(context, editorGroup(), media, draw);
        if (media === 'anime' || media === 'series' || media === 'books' || media === 'manga') {
            const progress = editorGroup(label('Text and progress', 'Текст и прогресс', 'Текст і прогрес', '文字与进度'), 'layout-template');
            const styles = progress.createDiv({ cls: 'lorebase-card-style-options' });
            renderChoiceButtons(styles, t('settingsCardStyle'), [
                { value: 'hover', label: label('On hover', 'При наведении', 'При наведенні', '悬停显示') },
                { value: 'progress', label: label('Below cover', 'Под обложкой', 'Під обкладинкою', '封面下方') },
            ], view.cardStyle, value => {
                view.cardStyle = value;
                commit();
                renderPanel();
            });
            styles.querySelectorAll('button').forEach((button, index) => {
                const sample = button.createSpan({ cls: `lorebase-card-style-sample ${index ? 'is-progress' : 'is-hover'}`, attr: { 'aria-hidden': 'true' } });
                button.prepend(sample);
            });
            if (view.cardStyle === 'hover') {
                const details = progress.createDiv({ cls: 'lorebase-card-progress-options' });
                if (media !== 'books') toggle(details, media === 'manga' ? label('Volumes', 'Тома', 'Томи', '卷数') : label('Seasons', 'Сезоны', 'Сезони', '季数'),
                    view.showAnimeSeasonProgress, value => { view.showAnimeSeasonProgress = value; }, t(media === 'manga' ? 'settingsVolumeProgress' : 'settingsSeasonProgress'));
                toggle(details, media === 'books' ? label('Pages', 'Страницы', 'Сторінки', '页数') : media === 'manga' ? label('Chapters', 'Главы', 'Розділи', '章节') : label('Episodes', 'Серии', 'Серії', '集数'),
                    view.showAnimeEpisodeProgress, value => { view.showAnimeEpisodeProgress = value; }, t(media === 'books' ? 'settingsPageProgress' : media === 'manga' ? 'settingsChapterProgress' : 'settingsEpisodeProgress'));
            }
        }
        if (media === 'books' || media === 'manga') {
            const cover = editorGroup(label('Cover effects', 'Оформление обложки', 'Оформлення обкладинки', '封面效果'));
            const coverOptions = [
                { value: 'plain', label: label('Plain', 'Обычная', 'Звичайна', '普通') },
                { value: 'hardcover', label: label('Hardcover', 'Твёрдая обложка', 'Тверда обкладинка', '精装') },
                ...(media === 'books' ? [{ value: 'shelf', label: t('settingsBookshelf') }] : []),
            ];
            const activeCover = media === 'books' && view.bookshelfEffect ? 'shelf' : view.bookCoverEffect ? 'hardcover' : 'plain';
            renderChoiceButtons(cover, t('settingsAppearance'), coverOptions, activeCover, value => {
                view.bookCoverEffect = value === 'hardcover';
                if (media === 'books') view.bookshelfEffect = value === 'shelf';
                commit();
                context.plugin.refreshViews();
            });
        }
    };

    const renderPanel = (): void => {
        if (!pane) return;
        const panel = panels.get(pane);
        if (!panel) return;
        body = panel.body;
        body.empty();
        body.toggleClass('lorebase-card-appearance', pane === 'appearance');
        if (pane === 'size') {
            renderCardSizeSettings(context, body, media, orientation, device => { previewDevice = device ?? previewDevice; draw(); }, previewDevice);
            if (media !== 'music') toggle(body,
                label('Scroll long descriptions', 'Прокручивать длинное описание', 'Прокручувати довгий опис', '滚动长描述'),
                settings.scrollCardDescriptions, value => { settings.scrollCardDescriptions = value; },
                label('For all media. Scroll the full text within the selected number of lines.',
                    'Для всех медиа. Полный текст прокручивается в пределах выбранного числа строк.',
                    'Для всіх медіа. Повний текст прокручується в межах вибраної кількості рядків.',
                    '适用于所有媒体。在选定行数范围内滚动查看完整文本。'));
        }
        if (pane === 'badges') renderCardBadgeSettings(context, body, type(), orientation, forProfiles, commit);
        if (pane === 'appearance') renderAppearance();
        if (pane === 'types' && media !== 'music') renderCardTypeSettings(context, body, media, draw);
    };
    const renderSections = (): void => {
        controls.empty();
        panels.clear();
        const choices: { value: Pane; label: string; icon: string }[] = [
            { value: 'size', label: t('settingsCardLayout'), icon: 'layout-grid' },
        ];
        choices.push(
            { value: 'badges', label: t('settingsCardBadges'), icon: 'badge' },
        );
        if (media !== 'games' && media !== 'movies') choices.push({ value: 'appearance', label: t('settingsAppearance'), icon: 'palette' });
        if (media !== 'music' && media !== 'books') choices.push({ value: 'types', label: getCardTypeSettingsTitle(media), icon: 'tags' });
        if (pane && !choices.some(choice => choice.value === pane)) pane = 'size';
        for (const choice of choices) {
            const group = context.createCollapsibleGroup(controls, choice.label, undefined, choice.value === pane);
            const root = group.root as HTMLDetailsElement;
            group.body.addClass('lorebase-card-pane-body');
            panels.set(choice.value, { root, body: group.body });
            const heading = root.querySelector('summary');
            if (!heading) continue;
            const icon = heading.createSpan({ cls: 'lorebase-card-section-icon', attr: { 'aria-hidden': 'true' } });
            setIcon(icon, choice.icon);
            heading.prepend(icon);
            heading.addEventListener('click', event => {
                event.preventDefault();
                if (pane) {
                    const previous = panels.get(pane);
                    if (previous) {
                        previous.root.open = false;
                        previous.body.empty();
                    }
                }
                pane = pane === choice.value ? undefined : choice.value;
                root.open = pane === choice.value;
                selections.set(plugin, { media, pane });
                renderPanel();
            });
        }
        renderPanel();
    };
    renderChoiceButtons(mediaPicker, t('settingsPreviewMode'), MEDIA_SETTINGS_OPTIONS.map(item => ({
        value: item.key, label: item.label(), icon: item.icon,
    })), media, value => {
        media = value;
        renderSections();
        selections.set(plugin, { media, pane });
        draw();
    });
    renderTools();
    renderScope();
    renderSections();
    draw();
    const statuses = context.createCollapsibleGroup(container, t('settingsStatusPlans'), t('settingsStatusPlansDesc'), false);
    statuses.root.addClass('lorebase-card-status-section');
    statuses.root.addEventListener('toggle', () => {
        if ((statuses.root as HTMLDetailsElement).open && !statuses.body.childElementCount) renderStatuses(statuses.body, draw);
    });
}
