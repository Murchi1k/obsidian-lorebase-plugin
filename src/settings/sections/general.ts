import { Setting, SliderComponent, ToggleComponent } from 'obsidian';
import { CARD_SIZES, COLOR_PRESETS, DEFAULT_COVER, DEFAULT_GAME_TAG_PRESETS, DEFAULT_SETTINGS, HORIZONTAL_CARD_SIZES, RATING_EMOJI, STATUS_CONFIG } from '../../constants';
import { i18n, t } from '../../localization';
import type { BadgePosition, Language, LorebaseSettings, ParticleEffect, RatingBadgeMode } from '../../types';
import { ICON_GENERAL, LABEL_RU } from './constants';
import { addLorebaseDropdown, LorebaseDropdownHandle } from './customDropdown';
import type { SettingsSectionContext } from './types';

type BadgeKey = keyof LorebaseSettings['badges'];
type OverlayFieldKey = keyof LorebaseSettings['overlayTextLayout'];

const BADGE_KEYS: BadgeKey[] = ['status', 'rating', 'favorite'];
const BADGES_PERSIST_DEBOUNCE_MS = 120;
const VISUAL_REFRESH_DEBOUNCE_MS = 40;
const MAX_PREVIEW_CARD_WIDTH = 340;
const FAVORITE_BADGE_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function createSvgPathIcon(pathD: string, options: { fill?: string; stroke?: string; width?: string; height?: string } = {}): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', options.fill ?? 'none');
    svg.setAttribute('stroke', options.stroke ?? 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (options.width) svg.setAttribute('width', options.width);
    if (options.height) svg.setAttribute('height', options.height);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
}

export function renderGeneralSettings(context: SettingsSectionContext, container: HTMLElement): void {
    context.createSectionHeader(container, ICON_GENERAL, t('settingsGeneral'));

    const languageSetting = new Setting(container)
        .setName(t('settingsLanguage'))
        .setDesc(t('settingsDescLanguage'));
    addLorebaseDropdown<Language>(
        languageSetting,
        [
            { value: 'en', label: 'English' },
            { value: 'ru', label: LABEL_RU },
        ],
        context.plugin.settings.language,
        async (value) => {
            context.plugin.settings.language = value;
            i18n.setLanguage(value);
            await context.plugin.saveSettings();
            context.display();
            context.plugin.refreshViews();
        }
    );

    let intensitySlider: SliderComponent;
    let particleIntensitySetting: Setting;

    const particleSetting = new Setting(container)
        .setName(t('settingsParticle'));
    addLorebaseDropdown<ParticleEffect>(
        particleSetting,
        [
            { value: 'none', label: t('settingsParticleNone') },
            { value: 'sakura', label: t('settingsParticleSakura') },
            { value: 'snow', label: t('settingsParticleSnow') },
        ],
        context.plugin.settings.particleEffect,
        async (value) => {
            context.plugin.settings.particleEffect = value;
            await context.plugin.saveSettings();
            const isNone = value === 'none';
            intensitySlider?.setDisabled(isNone);
            particleIntensitySetting?.settingEl.toggleClass('is-disabled', isNone);
        }
    );

    particleIntensitySetting = new Setting(container)
        .setName(t('settingsParticleIntensity'))
        .addSlider(slider => {
            intensitySlider = slider;
            slider
                .setLimits(20, 150, 1)
                .setValue(context.plugin.settings.particleIntensity)
                .setDynamicTooltip()
                .setDisabled(context.plugin.settings.particleEffect === 'none')
                .onChange(async (value) => {
                    context.plugin.settings.particleIntensity = value;
                    await context.plugin.saveSettings();
                });
        });

    if (context.plugin.settings.particleEffect === 'none') {
        particleIntensitySetting.settingEl.addClass('is-disabled');
    }

    new Setting(container)
        .setName(t('settingsColor'))
        .setDesc(t('settingsDescColor'))
        .addColorPicker(picker => {
            picker
                .setValue(context.plugin.settings.accentColor)
                .onChange(async (value) => {
                    context.plugin.settings.accentColor = value;
                    await context.plugin.saveSettings();
                    context.applyAccentColor(value);
                });
        });

    const presetsContainer = container.createDiv({ cls: 'lorebase-color-presets' });
    for (const color of COLOR_PRESETS) {
        const swatch = presetsContainer.createDiv({ cls: 'lorebase-color-swatch' });
        swatch.setCssStyles({ backgroundColor: color });
        if (context.plugin.settings.accentColor === color) {
            swatch.addClass('selected');
        }
        swatch.addEventListener('click', async () => {
            context.plugin.settings.accentColor = color;
            await context.plugin.saveSettings();
            context.applyAccentColor(color);
            presetsContainer.querySelectorAll('.lorebase-color-swatch').forEach(el => el.removeClass('selected'));
            swatch.addClass('selected');
        });
    }

    renderStatusLabelAndPlanSettings(context, container);

    const renderBadgesPreview = renderBadgesEditor(context, container);
    renderBadgeOptions(context, container, renderBadgesPreview);
}

function renderBadgesEditor(context: SettingsSectionContext, container: HTMLElement): () => void {
    container.createDiv({ cls: 'lorebase-card-customization-heading', text: `🔧 ${t('settingsBadges')}` });
    container.createDiv({ cls: 'lorebase-badges-editor-hint', text: t('settingsBadgesEditorHint') });
    let previewMode: 'game' | 'anime' = 'game';
    container.dataset.previewMode = previewMode;
    container.dataset.previewOrientation = 'vertical';

    const editor = container.createDiv({ cls: 'lorebase-badges-editor' });
    const card = editor.createDiv({ cls: 'lorebase-card lorebase-badges-editor-card lorebase-overlay-edit-card' });
    const imageContainer = card.createDiv({ cls: 'lorebase-card-image' });
    const imageWrapper = imageContainer.createDiv({ cls: 'lorebase-card-image-wrapper' });
    imageWrapper.createEl('img', {
        attr: {
            src: DEFAULT_COVER,
            alt: 'LOREBASE Preview',
            loading: 'lazy',
        },
    });

    const overlay = imageContainer.createDiv({ cls: 'lorebase-card-overlay' });
    const previewTitle = overlay.createDiv({ cls: 'lorebase-card-title lorebase-overlay-editable is-title', text: 'LOREBASE Preview Card' });
    const previewYear = overlay.createDiv({ cls: 'lorebase-card-year lorebase-overlay-editable is-year', text: '2026' });
    const previewFormat = overlay.createDiv({ cls: 'lorebase-card-year lorebase-card-format lorebase-overlay-editable is-format', text: 'TV' });
    const previewDescriptionGame = Array.from({ length: 70 }, (_, index) => {
        const line = String(index + 1).padStart(2, '0');
        return `${line}. Preview description line for layout testing.`;
    }).join('\n');
    const previewDescriptionAnime = Array.from({ length: 70 }, (_, index) => {
        const line = String(index + 1).padStart(2, '0');
        return `${line}. Anime synopsis line for hover preview and clipping checks.`;
    }).join('\n');
    const previewDescription = overlay.createDiv({
        cls: 'lorebase-card-description lorebase-overlay-editable is-description is-preview-description',
        text: previewDescriptionGame,
    });
    const previewAnimeProgress = imageContainer.createDiv({ cls: 'lorebase-card-metacritic lorebase-preview-anime-progress is-hidden' });
    const previewSeasonBadge = previewAnimeProgress.createSpan({ cls: 'lorebase-card-progress-season is-only', text: 'S 2/3' });
    const previewEpisodeBadge = previewAnimeProgress.createSpan({ cls: 'lorebase-card-progress-ep', text: 'EP 8/12' });

    const positions: BadgePosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const zoneLabels: Record<BadgePosition, string> = {
        'top-left': t('settingsBadgesPosTopLeft'),
        'top-right': t('settingsBadgesPosTopRight'),
        'bottom-left': t('settingsBadgesPosBottomLeft'),
        'bottom-right': t('settingsBadgesPosBottomRight'),
    };
    const zones = new Map<BadgePosition, HTMLElement>();
    let persistTimer: number | null = null;
    let persistInFlight = false;
    let persistQueued = false;
    type OverlayProfileKey = 'games' | 'anime';
    type OverlayOrientationKey = 'vertical' | 'horizontal';
    let previewOrientation: OverlayOrientationKey = 'vertical';

    const getActiveOverlayProfile = (): OverlayProfileKey => previewMode === 'anime' ? 'anime' : 'games';
    const getActiveOverlayOrientation = (): OverlayOrientationKey => previewOrientation;

    const getDefaultLayout = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey = getActiveOverlayOrientation()
    ): LorebaseSettings['overlayTextLayout'] => {
        if (profile === 'anime') {
            return orientation === 'horizontal'
                ? DEFAULT_SETTINGS.animeHorizontalOverlayTextLayout
                : DEFAULT_SETTINGS.animeOverlayTextLayout;
        }
        return orientation === 'horizontal'
            ? DEFAULT_SETTINGS.horizontalOverlayTextLayout
            : DEFAULT_SETTINGS.overlayTextLayout;
    };

    const getDefaultVisibility = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey = getActiveOverlayOrientation()
    ): LorebaseSettings['overlayTextVisibility'] => {
        if (profile === 'anime') {
            return orientation === 'horizontal'
                ? DEFAULT_SETTINGS.animeHorizontalOverlayTextVisibility
                : DEFAULT_SETTINGS.animeOverlayTextVisibility;
        }
        return orientation === 'horizontal'
            ? DEFAULT_SETTINGS.horizontalOverlayTextVisibility
            : DEFAULT_SETTINGS.overlayTextVisibility;
    };

    const getOverlayLayout = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey = getActiveOverlayOrientation()
    ): LorebaseSettings['overlayTextLayout'] => {
        if (profile === 'anime') {
            return orientation === 'horizontal'
                ? context.plugin.settings.animeHorizontalOverlayTextLayout
                : context.plugin.settings.animeOverlayTextLayout;
        }
        return orientation === 'horizontal'
            ? context.plugin.settings.horizontalOverlayTextLayout
            : context.plugin.settings.overlayTextLayout;
    };

    const getOverlayVisibility = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey = getActiveOverlayOrientation()
    ): LorebaseSettings['overlayTextVisibility'] => {
        if (profile === 'anime') {
            return orientation === 'horizontal'
                ? context.plugin.settings.animeHorizontalOverlayTextVisibility
                : context.plugin.settings.animeOverlayTextVisibility;
        }
        return orientation === 'horizontal'
            ? context.plugin.settings.horizontalOverlayTextVisibility
            : context.plugin.settings.overlayTextVisibility;
    };

    const getDescriptionLines = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey = getActiveOverlayOrientation()
    ): number => {
        if (profile === 'anime') {
            return orientation === 'horizontal'
                ? context.plugin.settings.animeHorizontalDescriptionLines
                : context.plugin.settings.animeDescriptionLines;
        }
        return orientation === 'horizontal'
            ? context.plugin.settings.horizontalDescriptionLines
            : context.plugin.settings.descriptionLines;
    };

    const getBadges = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey = getActiveOverlayOrientation()
    ): LorebaseSettings['badges'] => {
        if (profile === 'anime') {
            return orientation === 'horizontal'
                ? context.plugin.settings.animeHorizontalBadges
                : context.plugin.settings.animeBadges;
        }
        return orientation === 'horizontal'
            ? context.plugin.settings.horizontalBadges
            : context.plugin.settings.badges;
    };

    const setDescriptionLines = (
        profile: OverlayProfileKey,
        value: number,
        orientation: OverlayOrientationKey = getActiveOverlayOrientation()
    ): void => {
        if (profile === 'anime') {
            if (orientation === 'horizontal') {
                context.plugin.settings.animeHorizontalDescriptionLines = value;
                return;
            }
            context.plugin.settings.animeDescriptionLines = value;
            return;
        }
        if (orientation === 'horizontal') {
            context.plugin.settings.horizontalDescriptionLines = value;
            return;
        }
        context.plugin.settings.descriptionLines = value;
    };

    const overlayProfiles: OverlayProfileKey[] = ['games', 'anime'];
    const overlayOrientations: OverlayOrientationKey[] = ['vertical', 'horizontal'];

    const forPreviewTargets = (fn: (profile: OverlayProfileKey, orientation: OverlayOrientationKey) => void): void => {
        const active = getActiveOverlayProfile();
        const orientation = getActiveOverlayOrientation();
        if (!context.plugin.settings.overlayApplyToAllMedia) {
            fn(active, orientation);
            return;
        }
        for (const profile of overlayProfiles) {
            for (const targetOrientation of overlayOrientations) {
                fn(profile, targetOrientation);
            }
        }
    };

    const cloneLayout = (value: LorebaseSettings['overlayTextLayout']): LorebaseSettings['overlayTextLayout'] => ({
        title: Object.assign({}, value.title),
        year: Object.assign({}, value.year),
        format: Object.assign({}, value.format),
        description: Object.assign({}, value.description),
    });

    const cloneVisibility = (value: LorebaseSettings['overlayTextVisibility']): LorebaseSettings['overlayTextVisibility'] => ({
        title: value.title,
        year: value.year,
        format: value.format,
        description: value.description,
    });

    const cloneBadges = (value: LorebaseSettings['badges']): LorebaseSettings['badges'] => ({
        status: Object.assign({}, value.status),
        rating: Object.assign({}, value.rating),
        favorite: Object.assign({}, value.favorite),
    });

    const setOverlayLayout = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey,
        layout: LorebaseSettings['overlayTextLayout']
    ): void => {
        if (profile === 'anime') {
            if (orientation === 'horizontal') context.plugin.settings.animeHorizontalOverlayTextLayout = layout;
            else context.plugin.settings.animeOverlayTextLayout = layout;
            return;
        }
        if (orientation === 'horizontal') context.plugin.settings.horizontalOverlayTextLayout = layout;
        else context.plugin.settings.overlayTextLayout = layout;
    };

    const setOverlayVisibility = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey,
        visibility: LorebaseSettings['overlayTextVisibility']
    ): void => {
        if (profile === 'anime') {
            if (orientation === 'horizontal') context.plugin.settings.animeHorizontalOverlayTextVisibility = visibility;
            else context.plugin.settings.animeOverlayTextVisibility = visibility;
            return;
        }
        if (orientation === 'horizontal') context.plugin.settings.horizontalOverlayTextVisibility = visibility;
        else context.plugin.settings.overlayTextVisibility = visibility;
    };

    const setBadges = (
        profile: OverlayProfileKey,
        orientation: OverlayOrientationKey,
        badges: LorebaseSettings['badges']
    ): void => {
        if (profile === 'anime') {
            if (orientation === 'horizontal') context.plugin.settings.animeHorizontalBadges = badges;
            else context.plugin.settings.animeBadges = badges;
            return;
        }
        if (orientation === 'horizontal') context.plugin.settings.horizontalBadges = badges;
        else context.plugin.settings.badges = badges;
    };

    const copyTargetState = (
        sourceProfile: OverlayProfileKey,
        sourceOrientation: OverlayOrientationKey,
        targetProfile: OverlayProfileKey,
        targetOrientation: OverlayOrientationKey
    ): void => {
        setOverlayLayout(targetProfile, targetOrientation, cloneLayout(getOverlayLayout(sourceProfile, sourceOrientation)));
        setOverlayVisibility(targetProfile, targetOrientation, cloneVisibility(getOverlayVisibility(sourceProfile, sourceOrientation)));
        setBadges(targetProfile, targetOrientation, cloneBadges(getBadges(sourceProfile, sourceOrientation)));
        setDescriptionLines(targetProfile, getDescriptionLines(sourceProfile, sourceOrientation), targetOrientation);
    };

    const syncProfilesFromActive = (): void => {
        if (!context.plugin.settings.overlayApplyToAllMedia) return;
        const active = getActiveOverlayProfile();
        const orientation = getActiveOverlayOrientation();
        for (const profile of overlayProfiles) {
            for (const targetOrientation of overlayOrientations) {
                copyTargetState(active, orientation, profile, targetOrientation);
            }
        }
    };

    let visualRefreshTimer: number | null = null;

    const scheduleVisualRefresh = (): void => {
        if (visualRefreshTimer !== null) {
            window.clearTimeout(visualRefreshTimer);
        }
        visualRefreshTimer = window.setTimeout(() => {
            visualRefreshTimer = null;
            window.requestAnimationFrame(() => {
                context.plugin.refreshViewsVisuals();
            });
        }, VISUAL_REFRESH_DEBOUNCE_MS);
    };

    const flushPersistPreviewChanges = async (): Promise<void> => {
        if (persistInFlight) {
            persistQueued = true;
            return;
        }
        persistInFlight = true;
        try {
            await context.plugin.saveSettings();
        } catch (error) {
            console.error('Failed to persist preview changes', error);
        } finally {
            persistInFlight = false;
            if (persistQueued) {
                persistQueued = false;
                void flushPersistPreviewChanges();
            }
        }
    };
    const persistPreviewChanges = (): void => {
        scheduleVisualRefresh();
        if (persistTimer !== null) {
            window.clearTimeout(persistTimer);
        }
        persistTimer = window.setTimeout(() => {
            persistTimer = null;
            void flushPersistPreviewChanges();
        }, BADGES_PERSIST_DEBOUNCE_MS);
    };
    const setBadgeDragging = (isDragging: boolean): void => {
        card.toggleClass('is-badge-dragging', isDragging);
        if (!isDragging) {
            zones.forEach((zone) => zone.removeClass('is-over'));
        }
    };
    const overlayElements: Record<OverlayFieldKey, HTMLElement> = {
        title: previewTitle,
        year: previewYear,
        format: previewFormat,
        description: previewDescription,
    };
    const overlayLabels: Record<OverlayFieldKey, string> = {
        title: t('templateFieldName'),
        year: t('year'),
        format: t('templateFieldFormat'),
        description: t('editDescription'),
    };
    let activeOverlayField: OverlayFieldKey | null = null;

    const normalizeOverlayPercent = (value: number, fallback: number): number => {
        if (!Number.isFinite(value)) return fallback;
        const rounded = Math.round(value * 10) / 10;
        if (rounded < -20 || rounded > 120) return fallback;
        return rounded;
    };

    const clampOverlayPoint = (
        field: OverlayFieldKey,
        x: number,
        y: number
    ): { x: number; y: number } => {
        const maxX = field === 'description' ? 66 : 84;
        const minX = 2;
        const minY = 2;
        const maxY = 92;
        return {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y)),
        };
    };

    const applySnap = (field: OverlayFieldKey, x: number, y: number): { x: number; y: number } => {
        const xZones: Record<OverlayFieldKey, number[]> = {
            title: [5, 7, 10, 14],
            year: [5, 7, 10, 14],
            format: [26, 30, 34, 40],
            description: [2, 7, 10, 14],
        };
        const yZones: Record<OverlayFieldKey, number[]> = {
            title: [6.5, 10, 14, 18],
            year: [15, 19, 24, 30],
            format: [15, 19, 24, 30],
            description: [24, 32, 40, 50, 62, 74, 84],
        };
        const snapAxis = (value: number, zones: number[], threshold = 1.8): number => {
            const nearest = zones.reduce((best, zone) => (
                Math.abs(zone - value) < Math.abs(best - value) ? zone : best
            ), zones[0]);
            return Math.abs(nearest - value) <= threshold ? nearest : value;
        };
        return {
            x: snapAxis(x, xZones[field], 1.6),
            y: snapAxis(y, yZones[field], 2.1),
        };
    };

    const overlayHint = container.createDiv({
        cls: 'lorebase-overlay-edit-hint',
        text: t('settingsOverlayHint'),
    });
    const overlayControls = container.createDiv({ cls: 'lorebase-overlay-controls' });
    const overlayReadout = overlayControls.createDiv({ cls: 'lorebase-overlay-readout' });
    const overlayReset = overlayControls.createEl('button', {
        cls: 'lorebase-overlay-reset-btn',
        text: t('resetConfirm'),
        attr: { type: 'button' },
    });
    const previewModeSetting = new Setting(container)
        .setName(t('settingsPreviewMode'));
    addLorebaseDropdown<'game' | 'anime'>(
        previewModeSetting,
        [
            { value: 'game', label: t('settingsPreviewGame') },
            { value: 'anime', label: t('settingsPreviewAnime') },
        ],
        previewMode,
        (value) => {
            const nextMode = value === 'anime' ? 'anime' : 'game';
            if (nextMode === previewMode) return;
            previewMode = nextMode;
            container.dataset.previewMode = previewMode;
            container.dispatchEvent(new CustomEvent('lorebase-preview-mode-change', { detail: previewMode }));
            applyPreviewMode();
            renderPreview();
            applyOverlayLayout();
            applyOverlayVisibility();
        }
    );
    const previewOrientationSetting = new Setting(container)
        .setName(t('settingsOrientation'));
    addLorebaseDropdown<OverlayOrientationKey>(
        previewOrientationSetting,
        [
            { value: 'vertical', label: t('settingsOrientationVertical') },
            { value: 'horizontal', label: t('settingsOrientationHorizontal') },
        ],
        previewOrientation,
        (value) => {
            const nextOrientation = value === 'horizontal' ? 'horizontal' : 'vertical';
            if (nextOrientation === previewOrientation) return;
            previewOrientation = nextOrientation;
            container.dataset.previewOrientation = previewOrientation;
            container.dispatchEvent(new CustomEvent('lorebase-preview-orientation-change', { detail: previewOrientation }));
            applyPreviewMode();
            renderPreview();
            applyOverlayLayout();
            applyOverlayVisibility();
        }
    );
    new Setting(container)
        .setName(t('settingsOverlayApplyAllMedia'))
        .setDesc(t('settingsOverlayApplyAllMediaDesc'))
        .addToggle(toggle => {
            toggle
                .setValue(context.plugin.settings.overlayApplyToAllMedia)
                .onChange((value) => {
                    const wasEnabled = context.plugin.settings.overlayApplyToAllMedia;
                    context.plugin.settings.overlayApplyToAllMedia = value;
                    if (value && !wasEnabled) {
                        syncProfilesFromActive();
                        renderPreview();
                        applyOverlayLayout();
                        applyOverlayVisibility();
                    }
                    persistPreviewChanges();
                });
        });

    const normalizeDescriptionLines = (value: number): number => {
        if (!Number.isFinite(value)) return DEFAULT_SETTINGS.descriptionLines;
        return Math.max(1, Math.min(70, Math.round(value)));
    };
    const applyDescriptionClamp = (): void => {
        const profile = getActiveOverlayProfile();
        const lines = normalizeDescriptionLines(getDescriptionLines(profile));
        setDescriptionLines(profile, lines);
        previewDescription.setCssStyles({
            display: '-webkit-box',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'pre-line',
            webkitBoxOrient: 'vertical',
        });
        previewDescription.style.setProperty('-webkit-line-clamp', String(lines));
        previewDescription.style.setProperty('line-clamp', String(lines));
    };

    const applyOverlayVisibility = (): void => {
        const profile = getActiveOverlayProfile();
        const visibility = getOverlayVisibility(profile);
        const isAnimePreview = previewMode === 'anime';
        (Object.keys(overlayElements) as OverlayFieldKey[]).forEach((field) => {
            const hiddenByMode = field === 'format' && !isAnimePreview;
            const visible = !hiddenByMode && visibility[field];
            const el = overlayElements[field];
            el.setCssStyles({ display: hiddenByMode ? 'none' : '' });
            el.toggleClass('is-disabled-preview', !visible);
        });
    };

    const setActiveOverlayField = (field: OverlayFieldKey | null): void => {
        activeOverlayField = field;
        (Object.keys(overlayElements) as OverlayFieldKey[]).forEach((key) => {
            overlayElements[key].toggleClass('is-active-target', key === field);
        });
        updateOverlayReadout();
    };

    const updateOverlayReadout = (): void => {
        if (!activeOverlayField) {
            overlayReadout.textContent = t('settingsOverlayReadoutIdle');
            return;
        }
        const profile = getActiveOverlayProfile();
        const layout = getOverlayLayout(profile);
        const visibility = getOverlayVisibility(profile);
        const point = layout[activeOverlayField];
        const defaultPoint = getDefaultLayout(profile)[activeOverlayField];
        const x = normalizeOverlayPercent(point.x, defaultPoint.x);
        const y = normalizeOverlayPercent(point.y, defaultPoint.y);
        const visibilityLabel = visibility[activeOverlayField] ? 'ON' : 'OFF';
        const linesInfo = activeOverlayField === 'description'
            ? ` | lines ${normalizeDescriptionLines(getDescriptionLines(profile))}`
            : '';
        overlayReadout.textContent = `${overlayLabels[activeOverlayField]} (${visibilityLabel}): X ${x}% / Y ${y}%${linesInfo}`;
    };

    const getActiveMediaSettings = (): LorebaseSettings['games'] => (
        previewMode === 'anime'
            ? context.plugin.settings.anime
            : context.plugin.settings.games
    );

    const parseCssPixels = (value: string, fallback: number): number => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return parsed;
    };

    const clampDimension = (value: number, min: number, max: number, fallback: number): number => {
        if (!Number.isFinite(value)) return fallback;
        return Math.max(min, Math.min(max, Math.round(value)));
    };

    const clampImageRatio = (value: number, fallback: number): number => {
        if (!Number.isFinite(value) || value <= 0) return fallback;
        return Math.max(0.4, Math.min(2.2, Math.round(value * 100) / 100));
    };

    const getPreviewDimensions = (
        settings: LorebaseSettings['games'],
        orientation: OverlayOrientationKey
    ): { width: number; height: number } => {
        if (orientation === 'horizontal') {
            const horizontalWidth = settings.customCardSize
                ? clampDimension(settings.customHorizontalCardMinWidth, 240, 700, DEFAULT_SETTINGS.games.customHorizontalCardMinWidth)
                : DEFAULT_SETTINGS.games.customHorizontalCardMinWidth;
            const horizontalHeight = settings.customCardSize
                ? clampDimension(settings.customHorizontalCardHeight, 120, 520, DEFAULT_SETTINGS.games.customHorizontalCardHeight)
                : parseCssPixels(HORIZONTAL_CARD_SIZES[settings.cardSize].height, DEFAULT_SETTINGS.games.customHorizontalCardHeight);
            return { width: horizontalWidth, height: horizontalHeight };
        }

        const presetWidth = parseCssPixels(CARD_SIZES[settings.cardSize].maxWidth, MAX_PREVIEW_CARD_WIDTH);
        const width = settings.customCardSize
            ? clampDimension(settings.customCardMinWidth, 140, 480, DEFAULT_SETTINGS.games.customCardMinWidth)
            : Math.min(presetWidth, MAX_PREVIEW_CARD_WIDTH);
        const minHeight = settings.customCardSize
            ? clampDimension(settings.customCardMinHeight, 180, 900, DEFAULT_SETTINGS.games.customCardMinHeight)
            : parseCssPixels(CARD_SIZES[settings.cardSize].minHeight, DEFAULT_SETTINGS.games.customCardMinHeight);
        const ratio = settings.customCardSize
            ? clampImageRatio(settings.customCardImageRatio, DEFAULT_SETTINGS.games.customCardImageRatio)
            : 2 / 3;
        return { width, height: Math.max(minHeight, Math.round(width / ratio)) };
    };

    const applyPreviewDimensions = (): void => {
        const settings = getActiveMediaSettings();
        const isHorizontal = previewOrientation === 'horizontal';
        const dimensions = getPreviewDimensions(settings, previewOrientation);
        card.toggleClass('lorebase-card-horizontal', isHorizontal);
        card.setCssStyles({
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            maxWidth: isHorizontal ? '100%' : `${dimensions.width}px`,
            minWidth: isHorizontal ? `${dimensions.width}px` : '',
            minHeight: isHorizontal ? `${dimensions.height}px` : '0',
        });
        imageContainer.setCssStyles({ height: '100%' });
    };

    const getOverlayDragReferenceHeight = (): number => {
        const height = overlay.getBoundingClientRect().height;
        return Number.isFinite(height) && height > 0 ? height : 380;
    };

    const applyOverlayLayout = (): void => {
        const profile = getActiveOverlayProfile();
        const layout = getOverlayLayout(profile);
        const defaults = getDefaultLayout(profile);
        (Object.keys(overlayElements) as OverlayFieldKey[]).forEach((field) => {
            const point = layout[field];
            const defaultPoint = defaults[field];
            const normalizedX = normalizeOverlayPercent(point.x, defaultPoint.x);
            const normalizedY = normalizeOverlayPercent(point.y, defaultPoint.y);
            const clamped = clampOverlayPoint(field, normalizedX, normalizedY);
            point.x = clamped.x;
            point.y = clamped.y;

            const el = overlayElements[field];
            el.style.setProperty('--overlay-x', `${clamped.x}%`);
            el.style.setProperty('--overlay-y', `${clamped.y}%`);
            if (field === 'description') {
                el.style.setProperty('--overlay-max-width', `${Math.max(30, 92 - clamped.x)}%`);
            } else {
                el.style.removeProperty('--overlay-max-width');
            }
        });
        applyDescriptionClamp();
        updateOverlayReadout();
    };

    let overlayLayoutFrame: number | null = null;
    const scheduleOverlayLayout = (): void => {
        if (overlayLayoutFrame !== null) return;
        overlayLayoutFrame = window.requestAnimationFrame(() => {
            overlayLayoutFrame = null;
            applyOverlayLayout();
        });
    };
    const flushOverlayLayoutNow = (): void => {
        if (overlayLayoutFrame !== null) {
            window.cancelAnimationFrame(overlayLayoutFrame);
            overlayLayoutFrame = null;
        }
        applyOverlayLayout();
    };

    const bindOverlayDrag = (field: OverlayFieldKey): void => {
        const element = overlayElements[field];
        element.addEventListener('mouseenter', () => {
            setActiveOverlayField(field);
        });
        if (field === 'description') {
            element.addEventListener('mousemove', (event: MouseEvent) => {
                const rect = element.getBoundingClientRect();
                const inResizeCorner = event.clientX >= rect.right - 14 && event.clientY >= rect.bottom - 14;
                element.toggleClass('is-resize-corner', inResizeCorner);
            });
            element.addEventListener('mouseleave', () => element.removeClass('is-resize-corner'));
        }
        element.addEventListener('dblclick', (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            setActiveOverlayField(field);
            const nextVisible = !getOverlayVisibility(getActiveOverlayProfile())[field];
            forPreviewTargets((profile, orientation) => {
                getOverlayVisibility(profile, orientation)[field] = nextVisible;
            });
            applyOverlayVisibility();
            updateOverlayReadout();
            persistPreviewChanges();
        });
        element.addEventListener('mousedown', (event: MouseEvent) => {
            if (event.button !== 0) return;
            if (!getOverlayVisibility(getActiveOverlayProfile())[field]) return;

            if (field === 'description') {
                const rect = element.getBoundingClientRect();
                const inResizeCorner = event.clientX >= rect.right - 14 && event.clientY >= rect.bottom - 14;
                if (inResizeCorner) {
                    event.preventDefault();
                    event.stopPropagation();

                    setActiveOverlayField('description');
                    const startLines = normalizeDescriptionLines(getDescriptionLines(getActiveOverlayProfile()));
                    const startMouseY = event.clientY;

                    const onResizeMove = (moveEvent: MouseEvent): void => {
                        const deltaY = moveEvent.clientY - startMouseY;
                        const nextLines = normalizeDescriptionLines(startLines + Math.round(deltaY / 12));
                        forPreviewTargets((profile, orientation) => {
                            setDescriptionLines(profile, nextLines, orientation);
                        });
                        scheduleOverlayLayout();
                    };

                    const onResizeUp = (): void => {
                        document.removeEventListener('mousemove', onResizeMove);
                        document.removeEventListener('mouseup', onResizeUp);
                        element.removeClass('is-resize-corner');
                        flushOverlayLayoutNow();
                        persistPreviewChanges();
                    };

                    document.addEventListener('mousemove', onResizeMove);
                    document.addEventListener('mouseup', onResizeUp);
                    return;
                }
            }

            event.preventDefault();
            event.stopPropagation();

            setActiveOverlayField(field);
            const activeProfile = getActiveOverlayProfile();
            const point = getOverlayLayout(activeProfile)[field];
            const startMouseX = event.clientX;
            const startMouseY = event.clientY;
            const rect = overlay.getBoundingClientRect();
            const dragReferenceHeight = getOverlayDragReferenceHeight();
            const defaultPoint = getDefaultLayout(activeProfile)[field];
            const startX = normalizeOverlayPercent(point.x, defaultPoint.x);
            const startY = normalizeOverlayPercent(point.y, defaultPoint.y);

            const onMouseMove = (moveEvent: MouseEvent): void => {
                const nextX = startX + ((moveEvent.clientX - startMouseX) / rect.width) * 100;
                const nextY = startY + ((moveEvent.clientY - startMouseY) / dragReferenceHeight) * 100;
                const snapped = applySnap(field, nextX, nextY);
                const clamped = clampOverlayPoint(field, snapped.x, snapped.y);
                forPreviewTargets((profile, orientation) => {
                    const targetPoint = getOverlayLayout(profile, orientation)[field];
                    targetPoint.x = clamped.x;
                    targetPoint.y = clamped.y;
                });
                scheduleOverlayLayout();
            };

            const onMouseUp = (): void => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                flushOverlayLayoutNow();
                persistPreviewChanges();
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    };

    (Object.keys(overlayElements) as OverlayFieldKey[]).forEach((field) => bindOverlayDrag(field));

    overlayReset.addEventListener('click', () => {
        forPreviewTargets((profile, orientation) => {
            const layout = getOverlayLayout(profile, orientation);
            const layoutDefaults = getDefaultLayout(profile, orientation);
            layout.title = Object.assign({}, layoutDefaults.title);
            layout.year = Object.assign({}, layoutDefaults.year);
            layout.format = Object.assign({}, layoutDefaults.format);
            layout.description = Object.assign({}, layoutDefaults.description);

            const visibility = getOverlayVisibility(profile, orientation);
            const visibilityDefaults = getDefaultVisibility(profile, orientation);
            visibility.title = visibilityDefaults.title;
            visibility.year = visibilityDefaults.year;
            visibility.format = visibilityDefaults.format;
            visibility.description = visibilityDefaults.description;

            const defaultLines = profile === 'anime'
                ? (orientation === 'horizontal'
                    ? DEFAULT_SETTINGS.animeHorizontalDescriptionLines
                    : DEFAULT_SETTINGS.animeDescriptionLines)
                : (orientation === 'horizontal'
                    ? DEFAULT_SETTINGS.horizontalDescriptionLines
                    : DEFAULT_SETTINGS.descriptionLines);
            setDescriptionLines(profile, normalizeDescriptionLines(defaultLines), orientation);

            const badgeDefaults = profile === 'anime'
                ? (orientation === 'horizontal'
                    ? DEFAULT_SETTINGS.animeHorizontalBadges
                    : DEFAULT_SETTINGS.animeBadges)
                : (orientation === 'horizontal'
                    ? DEFAULT_SETTINGS.horizontalBadges
                    : DEFAULT_SETTINGS.badges);
            const badges = getBadges(profile, orientation);
            badges.status = Object.assign({}, badgeDefaults.status);
            badges.rating = Object.assign({}, badgeDefaults.rating);
            badges.favorite = Object.assign({}, badgeDefaults.favorite);
        });
        renderPreview();
        applyOverlayLayout();
        applyOverlayVisibility();
        container.dispatchEvent(new CustomEvent('lorebase-preview-state-change', { detail: previewMode }));
        persistPreviewChanges();
    });

    const badgeElements = new Map<BadgeKey, HTMLButtonElement>();

    const renderBadgeContent = (
        badge: HTMLButtonElement,
        badgeKey: BadgeKey,
        activeBadges: LorebaseSettings['badges']
    ): void => {
        badge.replaceChildren();

        if (badgeKey === 'status') {
            const previewStatus = previewMode === 'anime' ? 'watching' : 'playing';
            const statusBadge = document.createElement('div');
            statusBadge.className = `lorebase-card-status lorebase-status-${previewStatus}`;
            const iconPath = STATUS_CONFIG[previewStatus].pathD;
            statusBadge.appendChild(createSvgPathIcon(iconPath));
            if (activeBadges.status.iconOnly) {
                statusBadge.classList.add('is-icon-only');
            } else {
                const statusLabel = previewMode === 'anime' ? t('statusWatching') : t('statusPlaying');
                statusBadge.createSpan({ text: statusLabel });
            }
            badge.appendChild(statusBadge);
            return;
        }

        if (badgeKey === 'rating') {
            const ratingBadge = document.createElement('div');
            ratingBadge.className = 'lorebase-card-rating';
            if (activeBadges.rating.mode === 'emoji') {
                ratingBadge.classList.add('is-emoji');
                ratingBadge.textContent = RATING_EMOJI[4];
            } else {
                ratingBadge.textContent = '\u26054';
            }
            badge.appendChild(ratingBadge);
            return;
        }

        const favoriteBadge = document.createElement('div');
        favoriteBadge.className = 'lorebase-card-favorite-badge';
        if (activeBadges.favorite.subtlePulse) {
            favoriteBadge.classList.add('is-subtle-pulse');
        }
        favoriteBadge.appendChild(createSvgPathIcon(FAVORITE_BADGE_PATH, { fill: '#ffffff', stroke: 'none', width: '12', height: '12' }));
        badge.appendChild(favoriteBadge);
    };

    const getOrCreateBadgeElement = (badgeKey: BadgeKey): HTMLButtonElement => {
        const existing = badgeElements.get(badgeKey);
        if (existing) return existing;

        const badge = document.createElement('button');
        badge.type = 'button';
        badge.draggable = true;
        badge.className = 'lorebase-badges-editor-chip';

        badge.addEventListener('click', () => {
            const activeBadges = getBadges(getActiveOverlayProfile());
            const nextEnabled = !activeBadges[badgeKey].enabled;
            forPreviewTargets((profile, orientation) => {
                getBadges(profile, orientation)[badgeKey].enabled = nextEnabled;
            });
            renderPreview();
            persistPreviewChanges();
        });

        badge.addEventListener('dragstart', (event) => {
            event.dataTransfer?.setData('text/plain', badgeKey);
            event.dataTransfer?.setDragImage(badge, 8, 8);
            badge.classList.add('is-dragging');
            setBadgeDragging(true);
        });

        badge.addEventListener('dragend', () => {
            badge.classList.remove('is-dragging');
            setBadgeDragging(false);
        });

        badgeElements.set(badgeKey, badge);
        return badge;
    };

    positions.forEach((position) => {
        const zone = imageContainer.createDiv({
            cls: 'lorebase-badges-editor-zone',
            attr: { 'data-label': zoneLabels[position] }
        });
        zone.addClass(`is-${position}`);
        zone.addEventListener('dragover', (event) => {
            event.preventDefault();
            zone.addClass('is-over');
        });
        zone.addEventListener('dragleave', () => zone.removeClass('is-over'));
        zone.addEventListener('drop', (event) => {
            event.preventDefault();
            zone.removeClass('is-over');
            setBadgeDragging(false);
            const badgeKey = event.dataTransfer?.getData('text/plain') as BadgeKey;
            if (!BADGE_KEYS.includes(badgeKey)) return;
            let changed = false;
            forPreviewTargets((profile, orientation) => {
                const badgeSettings = getBadges(profile, orientation)[badgeKey];
                if (badgeSettings.position !== position) {
                    badgeSettings.position = position;
                    changed = true;
                }
            });
            if (!changed) return;
            renderPreview();
            persistPreviewChanges();
        });
        zones.set(position, zone);
    });

    const applyPreviewMode = (): void => {
        const isAnime = previewMode === 'anime';
        card.toggleClass('is-anime', isAnime);
        applyPreviewDimensions();
        previewTitle.textContent = isAnime ? 'LOREBASE Anime Preview' : 'LOREBASE Preview Card';
        previewYear.textContent = '2026';
        previewFormat.textContent = 'TV';
        previewFormat.setCssStyles({ display: isAnime ? '' : 'none' });
        if (!isAnime && activeOverlayField === 'format') {
            setActiveOverlayField(null);
        }
        previewDescription.textContent = isAnime ? previewDescriptionAnime : previewDescriptionGame;
        const showSeason = context.plugin.settings.anime.showAnimeSeasonProgress;
        const showEpisode = context.plugin.settings.anime.showAnimeEpisodeProgress;
        const showProgress = isAnime && (showSeason || showEpisode);
        previewAnimeProgress.toggleClass('is-hidden', !showProgress);
        const hasEpisodeBadge = showProgress && showEpisode;
        previewSeasonBadge.setCssStyles({ display: showProgress && showSeason ? '' : 'none' });
        previewEpisodeBadge.setCssStyles({ display: showProgress && showEpisode ? 'inline' : 'none' });
        previewSeasonBadge.toggleClass('is-hover-only', showProgress && showSeason && hasEpisodeBadge);
        previewSeasonBadge.toggleClass('is-only', showProgress && showSeason && !hasEpisodeBadge);
    };

    const renderPreview = (): void => {
        const activeBadges = getBadges(getActiveOverlayProfile());
        card.toggleClass(
            'lorebase-card-favorite-pulse',
            activeBadges.favorite.enabled && activeBadges.favorite.subtlePulse
        );
        BADGE_KEYS.forEach((badgeKey) => {
            const settings = activeBadges[badgeKey];
            const zone = zones.get(settings.position);
            if (!zone) return;

            const badge = getOrCreateBadgeElement(badgeKey);
            badge.setAttribute('aria-pressed', String(settings.enabled));
            badge.classList.toggle('is-disabled', !settings.enabled);
            renderBadgeContent(badge, badgeKey, activeBadges);
            if (badge.parentElement !== zone) {
                zone.appendChild(badge);
            }
        });
        zones.forEach((zone) => {
            zone.toggleClass('has-badge', zone.children.length > 0);
        });
    };

    applyPreviewMode();
    renderPreview();
    applyOverlayLayout();
    applyOverlayVisibility();
    overlayHint.addClass('is-ready');
    return () => {
        applyPreviewMode();
        renderPreview();
        applyOverlayLayout();
        applyOverlayVisibility();
    };
}

function renderStatusLabelAndPlanSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const group = context.createCollapsibleGroup(
        container,
        t('settingsStatusPlans'),
        t('settingsStatusPlansDesc'),
        false
    );

    const gameStatuses: Array<{ key: keyof LorebaseSettings['statusLabels']['games']; label: string }> = [
        { key: 'completed', label: t('statusPlayed') },
        { key: 'playing', label: t('statusPlaying') },
        { key: 'dropped', label: t('statusDropped') },
        { key: 'not_started', label: t('statusNotStarted') },
        { key: 'sandbox', label: t('statusSandbox') },
    ];

    const animeStatuses: Array<{ key: keyof LorebaseSettings['statusLabels']['anime']; label: string }> = [
        { key: 'planned', label: t('statusPlanned') },
        { key: 'watching', label: t('statusWatching') },
        { key: 'completed', label: t('statusCompleted') },
        { key: 'dropped', label: t('statusDropped') },
        { key: 'paused', label: t('statusPaused') },
    ];

    group.body.createDiv({ cls: 'lorebase-card-customization-heading', text: t('settingsGameStatusLabels') });
    for (const status of gameStatuses) {
        new Setting(group.body)
            .setName(status.label)
            .addText(text => {
                text
                    .setPlaceholder(status.label)
                    .setValue(context.plugin.settings.statusLabels.games[status.key] ?? '')
                    .onChange(async (value) => {
                        const trimmed = value.trim();
                        if (trimmed) {
                            context.plugin.settings.statusLabels.games[status.key] = trimmed;
                        } else {
                            delete context.plugin.settings.statusLabels.games[status.key];
                        }
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });
    }

    group.body.createDiv({ cls: 'lorebase-card-customization-heading', text: t('settingsAnimeStatusLabels') });
    for (const status of animeStatuses) {
        new Setting(group.body)
            .setName(status.label)
            .addText(text => {
                text
                    .setPlaceholder(status.label)
                    .setValue(context.plugin.settings.statusLabels.anime[status.key] ?? '')
                    .onChange(async (value) => {
                        const trimmed = value.trim();
                        if (trimmed) {
                            context.plugin.settings.statusLabels.anime[status.key] = trimmed;
                        } else {
                            delete context.plugin.settings.statusLabels.anime[status.key];
                        }
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });
    }

    new Setting(group.body)
        .setName(t('settingsGamePlanTags'))
        .setDesc(t('settingsGamePlanTagsDesc'))
        .addTextArea(text => {
            text
                .setValue(context.plugin.settings.tagPresets.games.map((preset) => getPlanPresetLabel(preset.id, preset.label)).join('\n'))
                .onChange(async (value) => {
                    const labels = value
                        .split(/\r?\n/)
                        .map((entry) => entry.trim())
                        .filter(Boolean);
                    context.plugin.settings.tagPresets.games = labels.map((label, index) => {
                        const defaultPreset = DEFAULT_GAME_TAG_PRESETS[index];
                        const tag = label.replace(/^#+/, '').toLowerCase();
                        return {
                            id: defaultPreset?.id ?? tag.replace(/\s+/g, '-'),
                            label,
                            tag: defaultPreset?.tag ?? tag,
                            icon: defaultPreset?.icon,
                        };
                    });
                    await context.plugin.saveSettings();
                    context.plugin.refreshViews();
                });
        });

}

function getPlanPresetLabel(id: string, fallback: string): string {
    const labels: Record<string, string> = {
        'check-later': t('planCheckLater'),
        'play-soon': t('planPlaySoon'),
        'wait-early-access': t('planWaitEarlyAccess'),
        'next-playthrough': t('planNextInQueue'),
    };
    return labels[id] ?? fallback;
}

function renderBadgeOptions(
    context: SettingsSectionContext,
    container: HTMLElement,
    renderBadgesPreview: () => void
): void {
    type BadgeProfileKey = 'games' | 'anime';
    type BadgeOrientationKey = 'vertical' | 'horizontal';

    const getActiveProfile = (): BadgeProfileKey => (
        container.dataset.previewMode === 'anime' ? 'anime' : 'games'
    );

    const getActiveOrientation = (): BadgeOrientationKey => (
        container.dataset.previewOrientation === 'horizontal' ? 'horizontal' : 'vertical'
    );

    const getBadgeSettings = (
        profile: BadgeProfileKey,
        orientation: BadgeOrientationKey = getActiveOrientation()
    ): LorebaseSettings['badges'] => {
        if (profile === 'anime') {
            return orientation === 'horizontal'
                ? context.plugin.settings.animeHorizontalBadges
                : context.plugin.settings.animeBadges;
        }
        return orientation === 'horizontal'
            ? context.plugin.settings.horizontalBadges
            : context.plugin.settings.badges;
    };

    const badgeProfiles: BadgeProfileKey[] = ['games', 'anime'];
    const badgeOrientations: BadgeOrientationKey[] = ['vertical', 'horizontal'];

    const forBadgeTargets = (fn: (profile: BadgeProfileKey, orientation: BadgeOrientationKey) => void): void => {
        const active = getActiveProfile();
        const orientation = getActiveOrientation();
        if (!context.plugin.settings.overlayApplyToAllMedia) {
            fn(active, orientation);
            return;
        }
        for (const profile of badgeProfiles) {
            for (const targetOrientation of badgeOrientations) {
                fn(profile, targetOrientation);
            }
        }
    };

    const refreshVisualsSoon = (): void => {
        window.requestAnimationFrame(() => {
            context.plugin.refreshViewsVisuals();
        });
    };

    let syncingControls = false;
    let statusIconOnlyToggle: ToggleComponent | null = null;
    let favoritePulseToggle: ToggleComponent | null = null;
    let ratingModeDropdown: LorebaseDropdownHandle<RatingBadgeMode> | null = null;

    const syncBadgeOptionControls = (): void => {
        syncingControls = true;
        const badges = getBadgeSettings(getActiveProfile());
        statusIconOnlyToggle?.setValue(badges.status.iconOnly);
        favoritePulseToggle?.setValue(badges.favorite.subtlePulse);
        ratingModeDropdown?.setValue(badges.rating.mode);
        syncingControls = false;
    };

    new Setting(container)
        .setName(t('settingsBadgesStatusIconOnly'))
        .addToggle(toggle => {
            statusIconOnlyToggle = toggle;
            const badges = getBadgeSettings(getActiveProfile());
            toggle
                .setValue(badges.status.iconOnly)
                .onChange((value) => {
                    if (syncingControls) return;
                    forBadgeTargets((profile, orientation) => {
                        getBadgeSettings(profile, orientation).status.iconOnly = value;
                    });
                    renderBadgesPreview();
                    refreshVisualsSoon();
                    void context.plugin.saveSettings();
                });
        });

    new Setting(container)
        .setName(t('settingsBadgesFavoritePulse'))
        .addToggle(toggle => {
            favoritePulseToggle = toggle;
            const badges = getBadgeSettings(getActiveProfile());
            toggle
                .setValue(badges.favorite.subtlePulse)
                .onChange((value) => {
                    if (syncingControls) return;
                    forBadgeTargets((profile, orientation) => {
                        getBadgeSettings(profile, orientation).favorite.subtlePulse = value;
                    });
                    renderBadgesPreview();
                    refreshVisualsSoon();
                    void context.plugin.saveSettings();
                });
        });

    const ratingModeSetting = new Setting(container)
        .setName(t('settingsBadgesRatingMode'));
    const badges = getBadgeSettings(getActiveProfile());
    ratingModeDropdown = addLorebaseDropdown<RatingBadgeMode>(
        ratingModeSetting,
        [
            { value: 'star', label: t('settingsBadgesRatingModeStar') },
            { value: 'emoji', label: t('settingsBadgesRatingModeEmoji') },
        ],
        badges.rating.mode,
        (value) => {
            if (syncingControls) return;
            forBadgeTargets((profile, orientation) => {
                getBadgeSettings(profile, orientation).rating.mode = value;
            });
            renderBadgesPreview();
            refreshVisualsSoon();
            void context.plugin.saveSettings();
        }
    );

    const seasonProgressSetting = new Setting(container)
        .setName(t('settingsAnimeSeasonProgress'))
        .addToggle(toggle => {
            toggle
                .setValue(context.plugin.settings.anime.showAnimeSeasonProgress)
                .onChange((value) => {
                    context.plugin.settings.anime.showAnimeSeasonProgress = value;
                    renderBadgesPreview();
                    refreshVisualsSoon();
                    void context.plugin.saveSettings();
                });
        });

    const episodeProgressSetting = new Setting(container)
        .setName(t('settingsAnimeEpisodeProgress'))
        .addToggle(toggle => {
            toggle
                .setValue(context.plugin.settings.anime.showAnimeEpisodeProgress)
                .onChange((value) => {
                    context.plugin.settings.anime.showAnimeEpisodeProgress = value;
                    renderBadgesPreview();
                    refreshVisualsSoon();
                    void context.plugin.saveSettings();
                });
        });

    const syncAnimeProgressSettingsVisibility = (): void => {
        const isAnimePreview = container.dataset.previewMode === 'anime';
        seasonProgressSetting.settingEl.setCssStyles({ display: isAnimePreview ? '' : 'none' });
        episodeProgressSetting.settingEl.setCssStyles({ display: isAnimePreview ? '' : 'none' });
    };

    const syncPreviewLinkedControls = (): void => {
        syncAnimeProgressSettingsVisibility();
        syncBadgeOptionControls();
    };

    container.addEventListener('lorebase-preview-mode-change', syncPreviewLinkedControls);
    container.addEventListener('lorebase-preview-orientation-change', syncPreviewLinkedControls);
    container.addEventListener('lorebase-preview-state-change', syncPreviewLinkedControls);
    syncPreviewLinkedControls();
}
