import { setIcon, setTooltip } from 'obsidian';
import { i18n } from '../../localization';
import { normalizePosterMode } from '../../services/media/partPoster';
import type { PosterMode } from '../../types';
import { renderChoiceButtons } from './choiceButtons';
import type { SettingsSectionContext } from './types';

const labels = {
    en: { name: 'Cover mode', description: 'Choose the cover used for all titles in this library. Titles without a part cover use their title cover.', active: 'Active part', title: 'Whole title' },
    ru: { name: 'Режим обложки', description: 'Обложка для всех тайтлов этой библиотеки. Если у активной части нет картинки, используется обложка тайтла.', active: 'Активная часть', title: 'Весь тайтл' },
    uk: { name: 'Режим обкладинки', description: 'Обкладинка для всіх творів цієї бібліотеки. Якщо активна частина не має зображення, використовується обкладинка твору.', active: 'Активна частина', title: 'Весь твір' },
    'zh-CN': { name: '封面模式', description: '选择此媒体库中所有作品使用的封面。当前分部没有封面时使用作品封面。', active: '当前分部封面', title: '固定作品封面' },
};

export function renderPartPosterSetting(context: SettingsSectionContext, container: HTMLElement, media: 'anime' | 'series', updatePreview: () => void): void {
    const copy = labels[i18n.getLanguage()] ?? labels.en;
    const row = container.createDiv({ cls: 'lorebase-part-poster-setting lorebase-card-editor-options' });
    const title = row.createDiv({ cls: 'lorebase-card-appearance-heading' });
    setIcon(title.createSpan({ attr: { 'aria-hidden': 'true' } }), 'images');
    title.createEl('strong', { text: copy.name });
    const help = title.createEl('button', { cls: 'lorebase-inline-help', attr: { type: 'button', 'aria-label': copy.name } });
    setIcon(help, 'circle-help');
    setTooltip(help, copy.description);
    renderChoiceButtons<PosterMode>(row, copy.name,
        [{ value: 'active-part', label: copy.active, icon: 'layers' }, { value: 'title', label: copy.title, icon: 'pin' }],
        normalizePosterMode(context.plugin.settings[media].posterMode),
        async mode => {
            context.plugin.settings[media].posterMode = mode;
            updatePreview();
            await context.plugin.saveSettings();
            context.plugin.refreshViews();
        });

}
