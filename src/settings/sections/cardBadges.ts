import { setIcon } from 'obsidian';
import { mt } from '../../localization/music';
import { i18n, t } from '../../localization';
import { CARD_MEDIA_KEYS, getCardProfile, type ConfigurableCardMedia } from '../../services/media/cardProfiles';
import { getRatingBadgeText, getRatingMax } from '../../utils/rating';
import { renderCommunityRatingIcon, renderRatingBadgeContent } from '../../components/RatingBadgeContent';
import type { CommunityRatingIcon } from '../../types';
import { hasClassicRatingPreset } from '../../classicRatingPresets';
import { getStatusAppearance } from '../../statusPresentation';
import { renderMediaSwitch } from './mediaSwitch';
import { dt } from '../../localization/discovery';
import { setTooltip } from 'obsidian';
import type { SettingsSectionContext } from './types';

type CardProfile = ReturnType<typeof getCardProfile>;
const text = (en: string, ru: string, uk: string, zh: string): string => (
    { en, ru, uk, 'zh-CN': zh }[i18n.getLanguage()]
);

export function renderCardBadgeSettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    media: ConfigurableCardMedia,
    orientation: 'vertical' | 'horizontal',
    updateProfiles: (update: (profile: CardProfile) => void) => void,
    commit: () => void,
): void {
    const settings = context.plugin.settings;
    const state = getCardProfile(settings, media, orientation).badges;
    const key = CARD_MEDIA_KEYS[media];
    const root = container.createDiv({ cls: 'lorebase-badge-editor' });
    const section = (title: string, icon: string): { root: HTMLElement; heading: HTMLElement } => {
        const section = root.createDiv({ cls: 'lorebase-badge-section' });
        const heading = section.createDiv({ cls: 'lorebase-badge-section-heading' });
        setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
        heading.createEl('strong', { text: title });
        return { root: section, heading };
    };
    const choices = <T extends string>(parent: HTMLElement, label: string, values: { value: T; label: string; sample: string; style?: string }[], initial: T, change: (value: T) => void): void => {
        const group = parent.createDiv({ cls: 'lorebase-badge-options', attr: { role: 'group', 'aria-label': label } });
        const buttons = values.map(option => {
            const button = group.createEl('button', { cls: 'lorebase-badge-option', attr: {
                type: 'button', 'aria-pressed': String(option.value === initial), 'aria-label': option.label, title: option.label,
            } });
            button.createSpan({ cls: `lorebase-badge-option-sample ${option.style ?? ''}`, text: option.sample, attr: { 'aria-hidden': 'true' } });
            button.createSpan({ text: option.label });
            button.addEventListener('click', () => {
                if (button.getAttribute('aria-pressed') === 'true') return;
                buttons.forEach((control, index) => control.setAttribute('aria-pressed', String(values[index].value === option.value)));
                change(option.value);
                commit();
            });
            return button;
        });
    };

    const status = section(t('status'), 'circle-check');
    const fallbackStatus = media === 'music' ? mt('completed') : t(media === 'game' ? 'statusPlayed'
        : media === 'book' || media === 'manga' ? 'statusReadCompleted' : 'statusCompleted');
    const statusLabel = getStatusAppearance(media, 'completed').label || settings.statusLabels[key]?.completed?.trim() || fallbackStatus;
    choices(status.heading, t('settingsBadgesStatusIconOnly'), [
        { value: 'text', label: text('Icon and text', 'Значок и текст', 'Значок і текст', '图标和文字'), sample: `✓ ${statusLabel}` },
        { value: 'icon', label: text('Icon only', 'Только значок', 'Лише значок', '仅图标'), sample: '✓' },
    ], state.status.iconOnly ? 'icon' : 'text', value => {
        updateProfiles(profile => { profile.badges.status.iconOnly = value === 'icon'; });
        status.root.querySelectorAll<HTMLElement>('.lorebase-badge-status-detail').forEach(row => { row.hidden = value === 'icon'; });
    });

    status.heading.classList.add('is-status');
    if (media !== 'music') {
        const dates = status.root.createDiv({ cls: 'lorebase-badge-date-options' });
        const dateLabel = dates.createEl('span', { cls: 'lorebase-badge-date-label', text: text('Completion date', 'Дата завершения', 'Дата завершення', '完成日期') });
        const dateHelp = dateLabel.createEl('button', { cls: 'lorebase-inline-help', attr: { type: 'button', 'aria-label': text('When the date appears', 'Когда показывается дата', 'Коли відображається дата', '日期显示条件') } });
        setIcon(dateHelp, 'circle-help');
        setTooltip(dateHelp, text('Shown for completed items when grouped by completion month/year or sorted by completion date. Enable “Always show” to display it in any view.', 'Показывается у завершённых карточек при группировке по месяцу или году прохождения, а также при сортировке по дате завершения. Включите «Показывать всегда», чтобы видеть дату в любом виде.', 'Показується у завершених картках при групуванні за місяцем або роком завершення, а також при сортуванні за датою завершення. Увімкніть «Показувати завжди», щоб бачити дату в кожному вигляді.', '按完成月份/年份分组或按完成日期排序时显示。启用“始终显示”可在所有视图显示日期。'));
        const date = new Date(new Date().getFullYear(), 6, 22);
        const short = new Intl.DateTimeFormat(i18n.getLocale(), { day: 'numeric', month: 'short' }).format(date);
        const full = new Intl.DateTimeFormat(i18n.getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
        choices(dates, t('settingsCompletionDateBadgeFormat'), [
            { value: 'short', label: text('Day and month', 'День и месяц', 'День і місяць', '日和月'), sample: short },
            { value: 'full', label: text('With year', 'С годом', 'Із роком', '包含年份'), sample: full },
        ], settings.completionDateBadgeFormats[key] ?? settings.completionDateBadgeFormat, value => { settings.completionDateBadgeFormats[key] = value; });
        const always = status.root.createDiv({ cls: 'lorebase-badge-always-date' });
        const alwaysLabel = always.createEl('label');
        const alwaysInput = alwaysLabel.createEl('input', { attr: { type: 'checkbox' } });
        alwaysInput.checked = Boolean(state.status.alwaysShowCompletionDate);
        alwaysLabel.createSpan({ text: text('Always show completion date', 'Всегда показывать дату завершения', 'Завжди показувати дату завершення', '始终显示完成日期') });
        alwaysInput.addEventListener('change', () => {
            updateProfiles(profile => { profile.badges.status.alwaysShowCompletionDate = alwaysInput.checked; });
            commit();
        });
        const release = status.root.createDiv({ cls: 'lorebase-badge-release-row' });
        for (const row of [dates, always, release]) { row.addClass('lorebase-badge-status-detail'); row.hidden = state.status.iconOnly; }
        setIcon(release.createSpan({ attr: { 'aria-hidden': 'true' } }), 'calendar-clock');
        const releaseText = release.createDiv();
        releaseText.createEl('strong', { text: text('Days until release', 'Дни до выхода', 'Дні до виходу', '发布倒计时') });
        release.setAttribute('title', text('On the upcoming status badge', 'На бейдже ожидаемого релиза', 'На бейджі очікуваного релізу', '显示在待发布状态徽章上'));
        renderMediaSwitch(release, t('settingsBadgesReleaseCountdown'), state.status.showReleaseCountdown !== false, value => {
            updateProfiles(profile => { profile.badges.status.showReleaseCountdown = value; });
            commit();
            return true;
        });
    }

    const rating = section(text('Rating', 'Оценка', 'Оцінка', '评分'), 'star');
    const example = Math.max(1, Math.round(getRatingMax(settings.ratingScale) * .8));
    if (hasClassicRatingPreset(settings.ratingScale)) {
        const sample = rating.heading.createSpan({ cls: 'lorebase-badge-option-sample' });
        renderRatingBadgeContent(sample, example, settings.ratingScale, state.rating.mode, media);
    } else if (settings.ratingScale.mode === 'classic') {
        choices(rating.heading, t('settingsBadgesRatingMode'), [
            { value: 'emoji', label: t('settingsBadgesRatingModeEmoji'), sample: getRatingBadgeText(example, settings.ratingScale, 'emoji'), style: 'is-rating' },
            { value: 'star', label: t('settingsBadgesRatingModeStar'), sample: getRatingBadgeText(example, settings.ratingScale, 'star'), style: 'is-rating' },
        ], state.rating.mode, value => updateProfiles(profile => { profile.badges.rating.mode = value; }));
    } else {
        const sample = rating.heading.createSpan({ cls: 'lorebase-badge-option-sample is-rating' });
        renderRatingBadgeContent(sample, example, settings.ratingScale, state.rating.mode);
        rating.heading.setAttribute('title', text(
            'The custom rating style is selected in General → User rating.',
            'Вид своей шкалы выбирается в «Общие → Пользовательская оценка».',
            'Вигляд власної шкали обирається в «Загальні → Оцінка користувача».',
            '在「常规 → 用户评分」中选择自定义评分样式。',
        ));
    }

    if (media !== 'music') {
        const title = t('communityRatingTitle');
        const community = section(title, 'users');
        const icons: { value: CommunityRatingIcon; label: string }[] = [
            { value: 'users', label: text('Community', 'Сообщество', 'Спільнота', '社区') },
            { value: 'star', label: text('Star', 'Звезда', 'Зірка', '星标') },
            { value: 'tomato', label: text('Tomato', 'Помидор', 'Помідор', '番茄') },
        ];
        const group = community.heading.createDiv({ cls: 'lorebase-badge-options lorebase-badge-community-options', attr: { role: 'group', 'aria-label': title } });
        const buttons = icons.map(({ value, label }) => {
            const button = group.createEl('button', {
                cls: 'lorebase-badge-option',
                attr: { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(state.communityRating.icon === value) },
            });
            renderCommunityRatingIcon(button, value);
            button.addEventListener('click', () => {
                if (state.communityRating.icon === value) return;
                updateProfiles(profile => { profile.badges.communityRating.icon = value; });
                for (const [index, control] of buttons.entries()) {
                    control.setAttribute('aria-pressed', String(icons[index].value === value));
                }
                commit();
            });
            return button;
        });
        renderMediaSwitch(community.heading, title, state.communityRating.enabled, value => {
            updateProfiles(profile => { profile.badges.communityRating.enabled = value; });
            commit();
            return true;
        });
    }

    const favorite = section(text('Favorite', 'Избранное', 'Обране', '收藏'), 'heart');
    choices(favorite.heading, t('settingsBadgesFavoritePulse'), [
        { value: 'heart', label: text('Heart badge', 'Сердечко', 'Сердечко', '心形徽章'), sample: '♥', style: 'is-favorite' },
        { value: 'pulse', label: text('Pulsing frame', 'Мигание рамки', 'Пульсація рамки', '闪动边框'), sample: '', style: 'is-pulse-frame' },
    ], state.favorite.subtlePulse ? 'pulse' : 'heart', value => updateProfiles(profile => { profile.badges.favorite.subtlePulse = value === 'pulse'; }));
    favorite.heading.setAttribute('title', text(
        'Click the heart in the preview to turn the favorite mark on or off.',
        'Сердечко в превью включает и выключает отметку избранного.',
        'Сердечко в перегляді вмикає та вимикає позначку обраного.',
        '点击预览中的心形图标可开启或关闭收藏标记。',
    ));

    const discovery = section(dt('title'), 'notebook-pen');
    const discoveryHelp = discovery.heading.querySelector('strong')!.createEl('button', {
        cls: 'lorebase-inline-help', attr: { type: 'button', 'aria-label': dt('title') },
    });
    setIcon(discoveryHelp, 'circle-help');
    setTooltip(discoveryHelp, text(
        'Show the icon on cards with recommendation details in all libraries.',
        'Показывать значок на карточках с заполненным блоком «Откуда узнал» во всех разделах библиотеки.',
        'Показувати значок на картках із заповненим блоком «Звідки дізнався» в усіх розділах бібліотеки.',
        '在所有分类中为填写了发现来源的卡片显示图标。',
    ));
    renderMediaSwitch(discovery.heading, dt('title'), settings.showDiscoveryBadge !== false, value => {
        settings.showDiscoveryBadge = value;
        commit();
        return true;
    });
}
