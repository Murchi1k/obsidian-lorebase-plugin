import { renderCardWorkspace } from './cardCustomization';
import { onlineExtrasText } from '../../localization/onlineExtras';
import { renderStatusSettings } from './statuses';
import { LucideIconPickerModal } from '../../modals/LucideIconPickerModal';
import { setIcon } from 'obsidian';
import { COLOR_PRESETS, DEFAULT_GAME_TAG_PRESETS, PARTICLE_INTENSITY_MAX, PARTICLE_INTENSITY_MIN } from '../../constants';
import { i18n, t } from '../../localization';
import { mt } from '../../localization/music';
import { hasClassicRatingPreset } from '../../classicRatingPresets';
import { ratingPresetName } from '../../localization/ratingPresets';
import type { CardClickAction, ClassicRatingHoliday, ClassicRatingPreset, ClassicRatingSeason, CustomRatingDisplay, Language, MediaType, ParticleEffect, RatingScaleMode, TagPreset } from '../../types';
import { ICON_CARD_CUSTOMIZATION, ICON_GENERAL, LABEL_RU, LABEL_UK } from './constants';
import { createLorebaseDropdown } from '../../components/LorebaseDropdown';
import { renderChoiceButtons } from './choiceButtons';
import { renderMediaSwitch } from './mediaSwitch';
import { compactGameText } from '../../localization/compactGameEditor';
import { getRatingBadgeText, getRatingMax, getRatingStep, getRatingValues } from '../../utils/rating';
import { renderRatingBadgeContent } from '../../components/RatingBadgeContent';
import { renderResetSettings } from './reset';
import { normalizeObsidianTag } from '../settingsNormalization';
import type { SettingsSectionContext } from './types';

function generalLabel(en: string, ru: string, uk: string, zh: string): string {
    return ({ en, ru, uk, 'zh-CN': zh })[i18n.getLanguage()];
}

function generalHeading(container: HTMLElement, title: string, icon: string): HTMLElement {
    const heading = container.createDiv({ cls: 'lorebase-general-heading' });
    const name = heading.createEl('h3');
    setIcon(name.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
    name.createSpan({ text: title });
    return heading;
}

export function renderGeneralSettings(context: SettingsSectionContext, container: HTMLElement): void {
    context.createSectionHeader(container, ICON_GENERAL, t('settingsGeneral'));
    const workspace = container.createDiv({ cls: 'lorebase-general-workspace' });
    const appearance = workspace.createDiv({ cls: 'lorebase-general-group' });
    const settings = context.plugin.settings;
    const language = appearance.createDiv({
        cls: 'lorebase-general-panel lorebase-general-row',
        attr: { role: 'group', 'aria-label': t('settingsLanguage') },
    });
    generalHeading(language, t('settingsLanguage'), 'languages');
    createLorebaseDropdown<Language>(language.createDiv({ cls: 'lorebase-general-language' }), [
        { value: 'en', label: 'English' },
        { value: 'ru', label: LABEL_RU },
        { value: 'uk', label: LABEL_UK },
        { value: 'zh-CN', label: '简体中文' },
    ], settings.language, async value => {
        settings.language = value;
        i18n.setLanguage(value);
        await context.plugin.saveSettings();
        context.display();
        context.plugin.refreshViews();
    }, { floating: true });

    renderAccentSettings(context, appearance);
    renderParticleSettings(context, workspace);

    const behavior = workspace.createDiv({ cls: 'lorebase-general-group' });
    const network = behavior.createEl('section', { cls: 'lorebase-general-panel lorebase-general-row lorebase-online-extras-settings' });
    const networkHeading = generalHeading(network, onlineExtrasText('title'), 'globe');
    const networkHelp = networkHeading.createEl('details', { cls: 'lorebase-online-extras-help' });
    const networkHelpButton = networkHelp.createEl('summary', { attr: {
        'aria-label': generalLabel('About additional online features', 'О дополнительных онлайн-функциях',
            'Про додаткові онлайн-функції', '关于附加在线功能'),
    } });
    setIcon(networkHelpButton, 'circle-help');
    networkHelp.createDiv({ cls: 'lorebase-online-extras-help-body', text: onlineExtrasText('description') });
    networkHelp.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        networkHelp.open = false;
        networkHelpButton.focus({ preventScroll: true });
    });
    network.ownerDocument.addEventListener('pointerdown', event => {
        if (networkHelp.open && !event.composedPath().includes(networkHelp)) networkHelp.open = false;
    }, { signal: context.signal });
    renderMediaSwitch(network, onlineExtrasText('title'), settings.onlineExtrasEnabled, value => {
        settings.onlineExtrasEnabled = value;
        void context.plugin.saveSettings();
        return true;
    });
    const action = behavior.createEl('section', { cls: 'lorebase-general-panel lorebase-general-row' });
    const actionTitle = t('settingsCardClick');
    generalHeading(action, actionTitle, 'mouse-pointer-2');
    renderChoiceButtons<CardClickAction>(action.createDiv({ cls: 'lorebase-general-segments' }), actionTitle, [
        { value: 'open', label: generalLabel('Open note', 'Заметка', 'Нотатка', '打开笔记'), icon: 'file-text' },
        { value: 'edit', label: generalLabel('Edit card', 'Редактор', 'Редактор', '编辑卡片'), icon: 'pencil' },
    ], settings.cardClickAction ?? 'open', async value => {
        settings.cardClickAction = value;
        await context.plugin.saveSettings();
    });

    const editor = behavior.createEl('section', { cls: 'lorebase-general-panel lorebase-general-row' });
    const editorTitle = compactGameText('setting');
    generalHeading(editor, editorTitle, 'pencil');
    renderMediaSwitch(editor, editorTitle, settings.updatedEditor, value => {
        settings.updatedEditor = value;
        void context.plugin.saveSettings();
        return true;
    });
    renderRatingScaleSettings(context, behavior);
    renderResetSettings(context, workspace);
}

function renderAccentSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const { settings } = context.plugin;
    const colors = container.createEl('section', { cls: 'lorebase-general-panel' });
    generalHeading(colors, t('settingsColor'), 'palette');
    const palette = colors.createDiv({
        cls: 'lorebase-general-palette',
        attr: { role: 'group', 'aria-label': t('settingsColor') },
    });
    const customColorLabel = generalLabel('Custom color', 'Свой цвет', 'Власний колір', '自定义颜色');
    const swatches = COLOR_PRESETS.map(color => {
        const swatch = palette.createEl('button', {
            cls: 'lorebase-general-swatch',
            attr: { type: 'button', title: color, 'aria-label': color },
        });
        swatch.style.setProperty('--swatch', color);
        swatch.addEventListener('click', () => setColor(color));
        return { swatch, color };
    });
    const trigger = palette.createEl('button', {
        cls: 'lorebase-general-custom-color',
        attr: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'lorebase-general-color-form' },
    });
    const colorDot = trigger.createSpan({ cls: 'lorebase-general-color-dot', attr: { 'aria-hidden': 'true' } });
    trigger.createSpan({ text: customColorLabel });

    const form = colors.createEl('form', {
        cls: 'lorebase-general-color-form', attr: { id: 'lorebase-general-color-form' },
    });
    form.hidden = true;
    const picker = form.createEl('input', { type: 'color', attr: { 'aria-label': customColorLabel } });
    const hex = form.createEl('input', {
        type: 'text',
        attr: { 'aria-label': 'HEX', placeholder: '#A1B2C3', spellcheck: 'false', maxlength: '7', required: '' },
    });
    form.createEl('button', {
        text: generalLabel('Apply', 'Применить', 'Застосувати', '应用'), attr: { type: 'submit' },
    });
    const syncColor = (): void => {
        picker.value = settings.accentColor;
        hex.value = settings.accentColor;
        hex.setCustomValidity('');
        colorDot.style.setProperty('--swatch', settings.accentColor);
        for (const { swatch, color } of swatches) {
            swatch.setAttribute('aria-pressed', String(color.toLowerCase() === settings.accentColor.toLowerCase()));
        }
    };
    const setColor = (value: string): void => {
        settings.accentColor = value;
        syncColor();
        context.applyAccentColor(value);
        void context.plugin.saveSettings();
    };
    const toggleEditor = (open: boolean): void => {
        form.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        syncColor();
        if (open) {
            hex.focus();
            hex.select();
        } else trigger.focus();
    };
    trigger.addEventListener('click', () => toggleEditor(form.hidden));
    picker.addEventListener('input', () => {
        hex.value = picker.value;
        hex.setCustomValidity('');
    });
    hex.addEventListener('input', () => {
        hex.setCustomValidity('');
        const value = hex.value.trim().replace(/^#/, '');
        if (/^[0-9a-f]{6}$/i.test(value)) picker.value = '#' + value;
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        const value = hex.value.trim().replace(/^#/, '');
        if (!/^[0-9a-f]{6}$/i.test(value)) {
            hex.setCustomValidity(generalLabel('Enter a six-digit HEX color.', 'Введите HEX-цвет из шести знаков.',
                'Введіть HEX-колір із шести знаків.', '请输入六位十六进制颜色。'));
            hex.reportValidity();
            return;
        }
        setColor('#' + value.toLowerCase());
        toggleEditor(false);
    });
    form.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        toggleEditor(false);
    });
    syncColor();
}

function renderParticleSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const { settings } = context.plugin;
    const section = container.createEl('section', { cls: 'lorebase-general-panel lorebase-general-particles' });
    const title = t('settingsParticle');
    generalHeading(section, title, 'sparkles');
    const effects: { value: ParticleEffect; label: string }[] = [
        { value: 'none', label: t('settingsParticleNone') },
        { value: 'sakura', label: t('settingsParticleSakura') },
        { value: 'snow', label: t('settingsParticleSnow') },
        { value: 'leaves', label: t('settingsParticleLeaves') },
        { value: 'fireflies', label: t('settingsParticleFireflies') },
        { value: 'rain', label: t('settingsParticleRain') },
    ];
    const tiles = section.createDiv({ cls: 'lorebase-general-effect-grid', attr: { role: 'group', 'aria-label': title } });
    const buttons = effects.map(({ value, label }) => {
        const button = tiles.createEl('button', {
            cls: 'lorebase-general-effect',
            attr: { type: 'button', 'data-effect': value },
        });
        const scene = button.createSpan({ cls: 'lorebase-general-effect-scene', attr: { 'aria-hidden': 'true' } });
        if (value === 'none') setIcon(scene, 'circle-off');
        else {
            for (let index = 0; index < 5; index++) {
                scene.createSpan({ cls: 'lorebase-general-particle lorebase-particle-' + value });
            }
        }
        button.createSpan({ cls: 'lorebase-general-effect-label', text: label });
        button.addEventListener('click', () => {
            if (settings.particleEffect === value) return;
            settings.particleEffect = value;
            syncEffect();
            context.plugin.applyParticles();
            void context.plugin.saveSettings();
        });
        return { button, value };
    });
    const intensity = section.createDiv({ cls: 'lorebase-general-intensity' });
    renderGeneralRange(intensity, t('settingsParticleIntensity'), PARTICLE_INTENSITY_MIN, PARTICLE_INTENSITY_MAX,
        settings.particleIntensity, value => {
            settings.particleIntensity = value;
            context.plugin.applyParticles();
        }, () => { void context.plugin.saveSettings(); });
    const motionLabel = intensity.createEl('label', { cls: 'lorebase-particle-motion-option' });
    const motion = motionLabel.createEl('input', { type: 'checkbox' });
    motion.checked = settings.animateParticlesWithReducedMotion;
    motionLabel.createSpan({
        text: generalLabel('Animate despite reduced motion', 'Анимировать частицы при ограничении движения',
            'Анімувати частинки за обмеженого руху', '减少动态效果时仍播放粒子动画'),
    });
    motion.addEventListener('change', () => {
        settings.animateParticlesWithReducedMotion = motion.checked;
        syncEffect();
        context.plugin.applyParticles();
        void context.plugin.saveSettings();
    });
    const syncEffect = (): void => {
        const active = effects.some(effect => effect.value === settings.particleEffect) ? settings.particleEffect : 'none';
        for (const { button, value } of buttons) button.setAttribute('aria-pressed', String(value === active));
        intensity.hidden = active === 'none';
        section.toggleAttribute('data-animate-with-reduced-motion', settings.animateParticlesWithReducedMotion);
    };
    syncEffect();
}

function renderGeneralRange(
    container: HTMLElement, name: string, min: number, max: number, value: number,
    onInput: (value: number) => void, onCommit?: () => void
): void {
    const label = container.createEl('label', { cls: 'lorebase-general-range' });
    label.createSpan({ text: name });
    const input = label.createEl('input', { type: 'range', attr: { min: String(min), max: String(max), step: '1', 'aria-label': name } });
    input.value = String(value);
    const reading = label.createEl('output', { text: input.value });
    const updateFill = (): void => {
        input.style.setProperty('--range-fill', `${((input.valueAsNumber - min) / (max - min)) * 100}%`);
    };
    updateFill();
    input.addEventListener('input', () => {
        reading.value = input.value;
        updateFill();
        onInput(input.valueAsNumber);
    });
    if (onCommit) input.addEventListener('change', onCommit);
}

function renderRatingScaleSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const label = generalLabel;
    const scale = context.plugin.settings.ratingScale;
    const body = container.createEl('section', { cls: 'lorebase-general-panel lorebase-rating-scale-settings' });
    const title = label('User rating', 'Пользовательская оценка', 'Користувацька оцінка', '个人评分');
    const heading = generalHeading(body, title, 'star');
    heading.addClass('lorebase-general-row');
    renderChoiceButtons<RatingScaleMode>(heading.createDiv({ cls: 'lorebase-general-segments' }), title, [
        { value: 'classic', label: label('Classic', 'Классическая', 'Класична', '经典') },
        { value: 'custom', label: label('Custom', 'Своя', 'Власна', '自定义') },
    ], scale.mode, async value => {
        scale.mode = value;
        updateRatingPreview();
        await saveRating();
    });

    const classic = body.createDiv({ cls: 'lorebase-rating-classic-settings' });
    const presetRow = classic.createDiv({ cls: 'lorebase-general-row lorebase-rating-preset-row' });
    const presetLabel = label('Preset', 'Пресет', 'Пресет', '预设');
    presetRow.createSpan({ text: presetLabel });
    const presetPicker = presetRow.createDiv({ cls: 'lorebase-rating-preset-picker' });
    createLorebaseDropdown<ClassicRatingPreset>(presetPicker, [
        { value: 'standard', label: label('Standard', 'Стандартный', 'Стандартний', '标准') },
        { value: 'themed', label: label('Themed', 'Тематический', 'Тематичний', '主题') },
        { value: 'seasonal', label: label('Seasonal', 'Сезонный', 'Сезонний', '季节') },
        { value: 'holiday', label: label('Holiday', 'Праздничный', 'Святковий', '节日') },
    ], scale.classicPreset ?? 'standard', async value => {
        scale.classicPreset = value;
        updateRatingPreview();
        await saveRating();
    }, { floating: true, minPanelWidth: 180 });
    presetPicker.querySelector('button')?.setAttribute('aria-label', presetLabel);

    const standardPreview = classic.createDiv({
        cls: 'lorebase-rating-classic',
        attr: { role: 'group', 'aria-label': t('settingsPreview') },
    });
    standardPreview.createSpan({ text: t('settingsPreview') });
    const classicBadges = standardPreview.createDiv({ cls: 'lorebase-rating-classic-badges' });
    const classicMode = context.plugin.settings.badges.rating.mode;
    const classicScale = { ...scale, mode: 'classic' as const };
    for (let value = 1; value <= 5; value++) {
        const badge = classicBadges.createSpan({ cls: 'lorebase-rating-classic-badge' });
        badge.createSpan({
            cls: 'lorebase-rating-classic-symbol', text: getRatingBadgeText(value, classicScale, classicMode),
        });
        if (classicMode === 'emoji') badge.createSpan({ cls: 'lorebase-rating-classic-score', text: String(value) });
    }

    const themedPreview = classic.createDiv({
        cls: 'lorebase-rating-theme-preview',
        attr: { role: 'group', 'aria-label': t('settingsPreview') },
    });
    const mediaLabels: Record<MediaType, string> = {
        game: t('settingsGames'), anime: t('settingsAnime'), movie: t('settingsMovies'),
        series: t('settingsSeries'), music: mt('music'), book: t('settingsBooks'), manga: t('settingsManga'),
    };
    const mediaPicker = themedPreview.createDiv({ cls: 'lorebase-rating-theme-picker' });
    const seasonPicker = themedPreview.createDiv({ cls: 'lorebase-rating-theme-picker' });
    const holidayPicker = themedPreview.createDiv({ cls: 'lorebase-rating-theme-picker' });
    const levels = themedPreview.createDiv({ cls: 'lorebase-rating-theme-levels' });
    const previewMediaLabel = label('Preview media', 'Медиа для превью', 'Медіа для перегляду', '预览媒体');
    let previewMedia: MediaType = 'game';
    const renderThemePreview = (): void => {
        mediaPicker.hidden = scale.classicPreset !== 'themed';
        seasonPicker.hidden = scale.classicPreset !== 'seasonal';
        holidayPicker.hidden = scale.classicPreset !== 'holiday';
        seasonPicker.querySelector('button')?.setAttribute('title', ratingPresetName(scale.classicSeason ?? 'spring'));
        holidayPicker.querySelector('button')?.setAttribute('title', ratingPresetName(scale.classicHoliday ?? 'christmas'));
        mediaPicker.querySelector('button')?.setAttribute('title', ratingPresetName(previewMedia));
        levels.empty();
        themedPreview.dataset.media = previewMedia;
        for (let value = 1; value <= 5; value++) {
            const level = levels.createSpan({ cls: 'lorebase-rating-theme-level' });
            renderRatingBadgeContent(level, value, { ...scale, mode: 'classic' }, classicMode, previewMedia);
        }
    };
    createLorebaseDropdown<MediaType>(mediaPicker,
        (Object.keys(mediaLabels) as MediaType[]).map(value => ({ value, label: mediaLabels[value] })),
        previewMedia, value => { previewMedia = value; renderThemePreview(); }, { floating: true, minPanelWidth: 150 });
    mediaPicker.querySelector('button')?.setAttribute('aria-label', previewMediaLabel);
    createLorebaseDropdown<ClassicRatingSeason>(seasonPicker, [
        { value: 'spring', label: label('Spring', 'Весна', 'Весна', '春季') },
        { value: 'summer', label: label('Summer', 'Лето', 'Літо', '夏季') },
        { value: 'autumn', label: label('Autumn', 'Осень', 'Осінь', '秋季') },
        { value: 'winter', label: label('Winter', 'Зима', 'Зима', '冬季') },
    ], scale.classicSeason ?? 'spring', async value => {
        scale.classicSeason = value;
        renderThemePreview();
        await saveRating();
    }, { floating: true, minPanelWidth: 150 });
    seasonPicker.querySelector('button')?.setAttribute('aria-label', label('Season', 'Сезон', 'Сезон', '季节'));
    createLorebaseDropdown<ClassicRatingHoliday>(holidayPicker, [
        { value: 'christmas', label: label('Christmas', 'Рождество', 'Різдво', '圣诞节') },
        { value: 'halloween', label: label('Halloween', 'Хэллоуин', 'Гелловін', '万圣节') },
        { value: 'easter', label: label('Easter', 'Пасха', 'Великдень', '复活节') },
        { value: 'lights', label: label('Festival of Lights', 'Фестиваль огней', 'Фестиваль вогнів', '灯光节') },
    ], scale.classicHoliday ?? 'christmas', async value => {
        scale.classicHoliday = value;
        renderThemePreview();
        await saveRating();
    }, { floating: true, minPanelWidth: 190 });
    holidayPicker.querySelector('button')?.setAttribute('aria-label', label('Holiday', 'Праздник', 'Свято', '节日'));
    const stepLabel = label('Score step', 'Шаг оценки', 'Крок оцінки', '评分步长');
    const stepFormat = new Intl.NumberFormat(i18n.getLocale());
    const summary = body.createDiv({ cls: 'lorebase-rating-summary', attr: { role: 'status' } });
    const ruler = summary.createDiv({ cls: 'lorebase-rating-ruler' });
    const markers = ruler.createDiv({ cls: 'lorebase-rating-markers', attr: { 'aria-hidden': 'true' } });
    const range = ruler.createDiv({ cls: 'lorebase-rating-range', attr: { 'aria-hidden': 'true' } });
    const previewInput = ruler.createEl('input', { cls: 'lorebase-rating-preview-input', attr: {
        type: 'range', min: '1', 'aria-label': label('Try the rating scale', 'Попробовать шкалу оценки', 'Спробувати шкалу оцінки', '试用评分刻度'),
    } });
    const badge = summary.createDiv({ cls: 'lorebase-rating-example' });
    badge.createSpan({ text: t('settingsPreview') });
    const sample = badge.createSpan({ cls: 'lorebase-rating-sample' });
    const updateSample = (): void => {
        const value = previewInput.valueAsNumber;
        const max = getRatingMax(scale);
        ruler.style.setProperty('--rating-fill', `${((value - 1) / (max - 1)) * 100}%`);
        previewInput.setAttribute('aria-valuetext', `${stepFormat.format(value)} / ${max}`);
        sample.empty();
        renderRatingBadgeContent(sample, value, scale, context.plugin.settings.badges.rating.mode);
    };
    previewInput.addEventListener('input', updateSample);

    const custom = body.createDiv({ cls: 'lorebase-rating-options' });
    let displayIcon: HTMLElement;
    const updateRatingPreview = (): void => {
        custom.hidden = summary.hidden = scale.mode !== 'custom';
        classic.hidden = !custom.hidden;
        standardPreview.hidden = hasClassicRatingPreset(scale);
        themedPreview.hidden = !hasClassicRatingPreset(scale);
        renderThemePreview();
        const max = getRatingMax(scale);
        const step = getRatingStep(scale);
        previewInput.max = String(max);
        previewInput.step = String(step);
        previewInput.value = String(Math.round((max - step) * 10) / 10);
        markers.empty();
        range.empty();
        for (const value of getRatingValues(scale)) {
            const whole = Number.isInteger(value);
            const half = !whole && Number.isInteger(value * 2);
            const mark = markers.createSpan({ cls: `lorebase-rating-mark ${whole ? 'is-whole' : half ? 'is-half' : 'is-minor'}` });
            mark.style.setProperty('--mark-position', `${((value - 1) / (max - 1)) * 100}%`);
            if (whole) range.createSpan({ text: String(value) });
        }
        markers.createSpan({ cls: 'lorebase-rating-cursor' });
        updateSample();
        setIcon(displayIcon, scale.icon ?? 'star');
    };
    const saveRating = async (): Promise<void> => {
        await context.plugin.saveSettings();
        context.plugin.refreshViews();
    };

    renderGeneralRange(custom.createDiv(), label('Maximum score', 'Максимальная оценка', 'Максимальна оцінка', '最高分'),
        2, 10, scale.max, async value => {
            scale.max = value;
            updateRatingPreview();
            await saveRating();
        });

    const stepSetting = custom.createDiv({ cls: 'lorebase-general-option' });
    stepSetting.createSpan({ text: stepLabel });
    renderChoiceButtons<'1' | '0.5' | '0.1'>(stepSetting.createDiv({ cls: 'lorebase-general-segments' }), stepLabel, [
        { value: '1', label: '1' },
        { value: '0.5', label: stepFormat.format(0.5) },
        { value: '0.1', label: stepFormat.format(0.1) },
    ], scale.step === 0.1 ? '0.1' : scale.step === 0.5 ? '0.5' : '1', async value => {
        scale.step = value === '0.1' ? 0.1 : value === '0.5' ? 0.5 : 1;
        updateRatingPreview();
        await saveRating();
    });

    const displayLabel = label('Display on cards', 'Вид на карточках', 'Вигляд на картках', '卡片显示');
    const display = custom.createDiv({ cls: 'lorebase-general-option' });
    display.createSpan({ text: displayLabel });
    const controls = display.createDiv({ cls: 'lorebase-general-segments lorebase-rating-display-controls' });
    renderChoiceButtons<CustomRatingDisplay>(controls, displayLabel, [
        { value: 'number', label: label('Number', 'Число', 'Число', '数字') },
        { value: 'stars', label: label('Star', 'Звезда', 'Зірка', '星标'), icon: 'star' },
        { value: 'custom', label: label('Custom', 'Свой', 'Власний', '自定义'), icon: scale.icon ?? 'star' },
    ], scale.display, async value => {
        scale.display = value;
        updateRatingPreview();
        await saveRating();
    });
    const chooseIcon = label('Choose rating icon', 'Выбрать иконку оценки', 'Обрати іконку оцінки', '选择评分图标');
    const customButton = controls.querySelector<HTMLButtonElement>('.lorebase-settings-choices > button:last-child')!;
    customButton.addClass('lorebase-rating-display-custom');
    customButton.setAttribute('title', chooseIcon);
    displayIcon = customButton.querySelector('span')!;
    const caret = customButton.createSpan({ cls: 'lorebase-rating-display-caret', attr: { 'aria-hidden': 'true' } });
    setIcon(caret, 'chevron-down');
    customButton.addEventListener('click', () => {
        new LucideIconPickerModal(context.app, scale.icon ?? 'star', icon => {
            scale.icon = icon;
            updateRatingPreview();
            void saveRating();
        }).open();
    });
    updateRatingPreview();
}

export function renderCardCustomizationSettings(context: SettingsSectionContext, container: HTMLElement): void {
    context.createSectionHeader(container, ICON_CARD_CUSTOMIZATION, t('settingsBadges'));
    renderCardWorkspace(context, container, (body, updatePreview) => renderStatusLabelAndPlanSettings(context, body, updatePreview));
}

function renderStatusLabelAndPlanSettings(context: SettingsSectionContext, container: HTMLElement, updatePreview: () => void): void {
    const panel = container.createDiv({ cls: 'lorebase-status-plans-group' });
    const gamesPanel = renderStatusSettings(context, panel, updatePreview);

    const plansCard = gamesPanel.createDiv({ cls: 'lorebase-plan-editor-card' });
    const plansHeader = plansCard.createDiv({ cls: 'lorebase-plan-editor-header' });
    const plansHeading = plansHeader.createDiv({ cls: 'lorebase-plan-editor-heading' });
    const plansIcon = plansHeading.createSpan({ cls: 'lorebase-status-editor-card-icon' });
    setIcon(plansIcon, 'list-todo');
    const plansText = plansHeading.createDiv({ cls: 'lorebase-plan-editor-heading-text' });
    plansText.createDiv({ cls: 'lorebase-status-editor-card-title', text: t('settingsGamePlanTags') });
    plansText.createDiv({ cls: 'lorebase-plan-editor-desc', text: t('settingsGamePlanTagsDesc') });

    const addPlanButton = plansHeader.createEl('button', {
        cls: 'lorebase-plan-editor-add',
        attr: {
            type: 'button',
            title: t('settingsPlanAdd'),
            'aria-label': t('settingsPlanAdd'),
        },
    });
    setIcon(addPlanButton, 'plus');
    addPlanButton.createSpan({ text: t('settingsPlanAdd') });

    const plansList = plansCard.createDiv({ cls: 'lorebase-plan-editor-list' });

    const persistPlans = async (): Promise<void> => {
        await context.plugin.saveSettings();
        context.plugin.refreshViews();
    };

    const renderPlans = (): void => {
        plansList.empty();
        context.plugin.settings.tagPresets.games.forEach((preset, index) => {
            const row = plansList.createDiv({ cls: 'lorebase-plan-editor-row' });
            const icon = row.createEl('button', { cls: 'lorebase-plan-editor-icon', attr: { type: 'button', 'aria-label': t('settingsGamePlanTags') } });
            setIcon(icon, preset.icon || 'tag');
            icon.addEventListener('click', () => {
                new LucideIconPickerModal(context.app, preset.icon || 'tag', value => {
                    preset.icon = value; renderPlans(); void persistPlans();
                }).open();
            });

            const input = row.createEl('input', {
                type: 'text',
                cls: 'lorebase-plan-editor-input',
                attr: {
                    placeholder: t('settingsPlanPlaceholder'),
                    'aria-label': `${t('settingsGamePlanTags')} ${index + 1}`,
                },
            });
            input.value = getPlanPresetLabel(preset.id, preset.label);
            const fitLabel = (): void => { input.style.width = `${Math.max(10, Math.min(36, input.value.length + 2))}ch`; };
            fitLabel();
            input.addEventListener('input', fitLabel);
            input.addEventListener('change', () => {
                const trimmed = input.value.trim();
                if (!trimmed) {
                    input.value = getPlanPresetLabel(preset.id, preset.label);
                    return;
                }
                preset.label = trimmed;
                preset.tag = normalizeObsidianTag(trimmed);
                void persistPlans();
            });

            const remove = row.createEl('button', {
                cls: 'lorebase-plan-editor-remove',
                attr: {
                    type: 'button',
                    title: t('settingsPlanRemove'),
                    'aria-label': `${t('settingsPlanRemove')}: ${getPlanPresetLabel(preset.id, preset.label)}`,
                },
            });
            setIcon(remove, 'trash-2');
            remove.addEventListener('click', () => {
                context.plugin.settings.tagPresets.games.splice(index, 1);
                renderPlans();
                void persistPlans();
            });
        });
    };

    addPlanButton.addEventListener('click', () => {
        const preset = createUniquePlanPreset(context.plugin.settings.tagPresets.games);
        context.plugin.settings.tagPresets.games.push(preset);
        renderPlans();
        void persistPlans();
        const lastInput = plansList.querySelector<HTMLInputElement>('.lorebase-plan-editor-row:last-child input');
        lastInput?.focus();
        lastInput?.select();
    });

    renderPlans();
}

function getPlanPresetLabel(id: string, fallback: string): string {
    const labels: Record<string, string> = {
        'check-later': t('planCheckLater'),
        'play-soon': t('planPlaySoon'),
        'wait-early-access': t('planWaitEarlyAccess'),
        'next-playthrough': t('planNextInQueue'),
    };
    const defaultPreset = DEFAULT_GAME_TAG_PRESETS.find((preset) => preset.id === id);
    return defaultPreset && fallback === defaultPreset.label ? labels[id] ?? fallback : fallback;
}

function createUniquePlanPreset(existing: TagPreset[]): TagPreset {
    const label = t('settingsPlanNew');
    const baseTag = normalizeObsidianTag(label) || 'new-plan';
    const usedTags = new Set(existing.map((preset) => preset.tag));
    let tag = baseTag;
    let suffix = 2;
    while (usedTags.has(tag)) {
        tag = `${baseTag}-${suffix}`;
        suffix += 1;
    }

    const usedIds = new Set(existing.map((preset) => preset.id));
    const idBase = `custom-plan-${Date.now().toString(36)}`;
    let id = idBase;
    let idSuffix = 2;
    while (usedIds.has(id)) {
        id = `${idBase}-${idSuffix}`;
        idSuffix += 1;
    }

    return { id, label, tag, icon: 'tag' };
}
