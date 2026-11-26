import { setIcon } from 'obsidian';
import { i18n, t } from '../../localization';
import { createDefaultCardGrid, normalizeCardGrid } from '../../services/media/cardGrid';
import { LayoutCalculator } from '../../views/library/LayoutCalculator';
import { VIEW_TYPE_LIBRARY } from '../../constants';
import type { LibraryView } from '../../views/LibraryView';
import type { LibraryMediaKey } from './library';
import { renderChoiceButtons } from './choiceButtons';
import type { SettingsSectionContext } from './types';

const text = (en: string, ru: string, uk: string, zh: string): string => (
    { en, ru, uk, 'zh-CN': zh }[i18n.getLanguage()]
);

export function renderCardSizeSettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    key: LibraryMediaKey,
    orientation: 'horizontal' | 'vertical',
    updatePreview: (device?: 'desktop' | 'mobile') => void,
    device: 'desktop' | 'mobile' = 'desktop',
): void {
    const settings = context.plugin.settings[key];
    settings.cardGrid = normalizeCardGrid(settings.cardGrid, settings);
    const grid = settings.cardGrid;
    const profile = grid[device];
    const horizontal = orientation === 'horizontal';
    const rebuild = (): void => {
        container.empty();
        renderCardSizeSettings(context, container, key, orientation, updatePreview, device);
    };
    const save = (): void => {
        updatePreview(device);
        context.plugin.refreshViewsVisuals();
        void context.plugin.saveSettings();
    };
    const root = container.createDiv({ cls: 'lorebase-grid-editor' });
    renderChoiceButtons(root, text('Device', 'Устройство', 'Пристрій', '设备'), [
        { value: 'desktop', label: text('Desktop', 'Компьютер', 'Комп’ютер', '电脑'), icon: 'monitor' },
        { value: 'mobile', label: text('Phone', 'Телефон', 'Телефон', '手机'), icon: 'smartphone' },
    ], device, value => { device = value; rebuild(); updatePreview(device); });

    const mode = root.createDiv({ cls: 'lorebase-grid-sizing-mode' });
    renderChoiceButtons(mode, text('Size by', 'Настраивать', 'Налаштовувати', '调整方式'), [
        { value: 'size', label: text('Card width', 'По размеру', 'За розміром', '按宽度'), icon: 'scaling' },
        { value: 'columns', label: text('Columns', 'По колонкам', 'За стовпцями', '按列数'), icon: 'columns-3' },
    ], profile.mode, value => { profile.mode = value; rebuild(); save(); });

    const widthKey = horizontal ? 'horizontalWidth' : 'width';
    const columnsKey = horizontal ? 'horizontalColumns' : 'columns';
    const widthLabel = text('Card width', 'Ширина карточки', 'Ширина картки', '卡片宽度');
    const columnsLabel = t('settingsColumns');
    const summary = root.createDiv({ cls: 'lorebase-grid-summary', attr: { 'aria-live': 'polite' } });
    const miniature = summary.createDiv({ cls: 'lorebase-grid-miniature', attr: { 'aria-hidden': 'true' } });
    const result = summary.createEl('strong');
    const caption = summary.createDiv({ cls: 'setting-item-description' });
    const mediaType = { games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga', music: 'music' } as const;
    const reference = context.app.workspace?.getLeavesOfType?.(VIEW_TYPE_LIBRARY)
        .map(leaf => (leaf.view as Partial<Pick<LibraryView, 'getCardPreviewReference'>>).getCardPreviewReference?.(mediaType[key], orientation))
        .find(Boolean);
    const availableWidth = device === 'mobile' ? 390 : reference?.availableWidth || 1200;
    const calculator = new LayoutCalculator(() => availableWidth, () => device === 'mobile');
    const read = (): void => {
        const layout = calculator.getEffectiveLayout(settings, horizontal ? 'horizontal' : 'grid');
        const columns = calculator.getRenderedColumns(layout);
        const width = calculator.getCardWidth(layout);
        const height = calculator.getCardHeight(layout);
        result.textContent = `${columnsLabel} ${columns} · ${Math.round(width)} × ${Math.round(height)} px`;
        caption.textContent = profile.mode === 'size'
            ? text(`Example at ${Math.round(availableWidth)} px. Columns fit automatically.`, `Пример для области ${Math.round(availableWidth)} px. Число колонок подбирается автоматически.`, `Приклад для області ${Math.round(availableWidth)} px. Кількість стовпців добирається автоматично.`, `${Math.round(availableWidth)} px 区域示例，自动排列列数。`)
            : text(`Example at ${Math.round(availableWidth)} px. Cards fill the row and fewer columns fit in narrow panes.`, `Пример для области ${Math.round(availableWidth)} px. Карточки заполняют строку. В узкой панели колонок станет меньше.`, `Приклад для області ${Math.round(availableWidth)} px. Картки заповнюють рядок. У вузькій панелі стовпців стане менше.`, `${Math.round(availableWidth)} px 区域示例。卡片填满行，空间不足时自动减少列数。`);
        miniature.empty();
        miniature.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
        miniature.style.gap = `${Math.max(2, Math.round(profile.gap / 3))}px`;
        for (let index = 0; index < columns; index++) {
            const card = miniature.createSpan();
            card.style.aspectRatio = String(key === 'music' ? 1 : horizontal ? grid.horizontalRatio : grid.posterRatio);
            card.createSpan();
        }
    };

    const range = (parent: HTMLElement, label: string, value: number, min: number, max: number, step: number, unit: string, update: (value: number) => void): void => {
        const row = parent.createDiv({ cls: 'lorebase-grid-range' });
        const heading = row.createDiv();
        heading.createEl('label', { text: label });
        const valueBox = heading.createDiv({ cls: 'lorebase-grid-range-value' });
        const number = valueBox.createEl('input', { attr: { type: 'number', min: String(min), max: String(max), step: String(step), 'aria-label': label } });
        valueBox.createSpan({ text: unit, attr: { 'aria-hidden': 'true' } });
        const slider = row.createEl('input', { attr: { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': label } });
        slider.value = String(value);
        number.value = slider.value;
        slider.addEventListener('input', () => {
            number.value = slider.value;
            update(Number(slider.value));
            read();
            updatePreview(device);
            context.plugin.refreshViewsVisuals();
        });
        slider.addEventListener('change', save);
        number.addEventListener('change', () => {
            const raw = number.valueAsNumber;
            const next = Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.round(raw / step) * step)) : Number(slider.value);
            number.value = slider.value = String(next);
            update(next);
            read();
            save();
        });
    };
    const mainControl = root.createDiv({ cls: 'lorebase-grid-main-control' });
    summary.before(mainControl);
    if (profile.mode === 'size') {
        range(mainControl, widthLabel, profile[widthKey], horizontal ? 180 : 100,
            horizontal ? device === 'mobile' ? 480 : 720 : device === 'mobile' ? 250 : 420,
            5, 'px', value => { profile[widthKey] = value; });
    } else {
        range(mainControl, columnsLabel, profile[columnsKey], 1, 12, 1, '', value => { profile[columnsKey] = value; });
    }
    const extra = root.createEl('details', { cls: 'lorebase-grid-extra' });
    const extraHeading = extra.createEl('summary', { text: key === 'music'
        ? text('Spacing', 'Отступы', 'Відступи', '间距')
        : text('Spacing and proportions', 'Отступы и пропорции', 'Відступи та пропорції', '间距和比例') });
    setIcon(extraHeading.createSpan({ attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    const extraBody = extra.createDiv();
    range(extraBody, text('Spacing', 'Расстояние между карточками', 'Відстань між картками', '卡片间距'), profile.gap, 4, 32, 1, 'px', value => { profile.gap = value; });

    if (key !== 'music') {
        const proportions = extraBody.createDiv({ cls: 'lorebase-grid-proportions' });
        proportions.createEl('strong', { text: text('Cover proportions', 'Пропорции обложки', 'Пропорції обкладинки', '封面比例') });
        const options = horizontal
            ? [{ value: '1.6', label: '16:10' }, { value: String(16 / 9), label: '16:9' }, { value: '2', label: '2:1' }]
            : [{ value: String(2 / 3), label: '2:3' }, { value: '.75', label: '3:4' }, { value: '1', label: '1:1' }];
        const ratioKey = horizontal ? 'horizontalRatio' : 'posterRatio';
        const selected = options.find(option => Math.abs(Number(option.value) - grid[ratioKey]) < .005)?.value ?? 'custom';
        renderChoiceButtons(proportions, text('Cover proportions', 'Пропорции обложки', 'Пропорції обкладинки', '封面比例'), [
            ...options, { value: 'custom', label: text('Custom', 'Свои', 'Власні', '自定义'), icon: 'sliders-horizontal' },
        ], selected, value => {
            if (value !== 'custom') grid[ratioKey] = Number(value);
            custom.querySelectorAll('input').forEach(input => { input.value = String(Math.round(grid[ratioKey] * 100) / 100); });
            custom.hidden = value !== 'custom';
            read(); save();
        });
        const custom = proportions.createDiv();
        custom.hidden = selected !== 'custom';
        range(custom, text('Width / height', 'Ширина / высота', 'Ширина / висота', '宽 / 高'), grid[ratioKey], horizontal ? 1 : .4, horizontal ? 3 : 2.2, .01, '', value => { grid[ratioKey] = value; });
    }
    const reset = root.createEl('button', { cls: 'lorebase-card-dimensions-reset', attr: { type: 'button' } });
    setIcon(reset.createSpan({ attr: { 'aria-hidden': 'true' } }), 'rotate-ccw');
    reset.createSpan({ text: text('Reset grid', 'Сбросить сетку', 'Скинути сітку', '重置网格') });
    reset.addEventListener('click', () => { settings.cardGrid = createDefaultCardGrid(key === 'music' ? 7 : 5); rebuild(); save(); });
    read();
}
