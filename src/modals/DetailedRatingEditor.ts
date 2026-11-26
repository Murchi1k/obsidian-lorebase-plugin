import type { MediaType, RatingCriterion, RatingScaleSettings } from '../types';
import { i18n, t } from '../localization';
import { setIcon } from 'obsidian';
import { getRatingFromStarPosition, getRatingStarValues, formatRatingValue, getRatingMax } from '../utils/rating';
import { mountTenthsRating, paintRatingStar, updateRatingReadout } from '../components/RatingInput';
import { parseDetailedRatings } from '../utils/detailedRatings';

const copy = {
    ru: { toggle: 'Расширенная оценка', add: 'Добавить критерий', name: 'Название критерия', remove: 'Удалить критерий', duplicate: 'Такой критерий уже есть', defaults: ['Персонажи', 'Сюжет', 'Атмосфера'], music: ['Исполнение', 'Тексты', 'Звучание'] },
    uk: { toggle: 'Розширена оцінка', add: 'Додати критерій', name: 'Назва критерію', remove: 'Видалити критерій', duplicate: 'Такий критерій уже є', defaults: ['Персонажі', 'Сюжет', 'Атмосфера'], music: ['Виконання', 'Тексти', 'Звучання'] },
    en: { toggle: 'Detailed rating', add: 'Add criterion', name: 'Criterion name', remove: 'Remove criterion', duplicate: 'This criterion already exists', defaults: ['Characters', 'Story', 'Atmosphere'], music: ['Performance', 'Lyrics', 'Sound'] },
    'zh-CN': { toggle: '详细评分', add: '添加评分项', name: '评分项名称', remove: '删除评分项', duplicate: '评分项已存在', defaults: ['角色', '剧情', '氛围'], music: ['演唱', '歌词', '音效'] },
};

/** A modal-local draft: cancel never changes the media item. */
export class DetailedRatingEditor {
    private rows: RatingCriterion[] | undefined;
    constructor(initial: RatingCriterion[] | undefined, private type: MediaType, private settings: RatingScaleSettings) {
        this.rows = parseDetailedRatings(initial);
        this.settings = { ...settings, classicPreset: 'standard' };
    }

    getValue(): RatingCriterion[] | undefined { return this.rows?.map(row => ({ ...row })); }

    mount(parent: HTMLElement): void {
        const labels = copy[i18n.getLanguage()] ?? copy.en;
        const details = parent.createEl('details', { cls: 'lorebase-detailed-rating' });
        const toggle = details.createEl('summary', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-detailed-rating-toggle' });
        toggle.createSpan({ text: labels.toggle });
        setIcon(toggle.createSpan({ cls: 'lorebase-detailed-rating-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
        const body = details.createDiv({ cls: 'lorebase-detailed-rating-body' });
        details.addEventListener('toggle', () => {
            if (details.open && this.rows === undefined) {
                this.rows = (this.type === 'music' ? labels.music : labels.defaults).map(name => ({ name, value: null }));
                render();
            }
        });
        const list = body.createDiv({ cls: 'lorebase-detailed-rating-list' });
        const render = (): void => {
            list.empty();
            for (const row of this.rows ?? []) {
                const line = list.createDiv({ cls: 'lorebase-detailed-rating-row' });
                const caption = line.createDiv({ cls: 'lorebase-criterion-caption' });
                const name = caption.createEl('input', { cls: 'lorebase-criterion-name', attr: { type: 'text', 'aria-label': labels.name } });
                name.value = row.name;
                const value = line.createSpan({ cls: 'lorebase-criterion-value', attr: { 'aria-live': 'polite' } });
                const stars = line.createDiv({ cls: `lorebase-editmode-stars lorebase-criterion-stars${this.settings.mode === 'custom' ? ' is-custom-scale' : ''}`, attr: { role: 'group', 'aria-label': row.name } });
                const actions = line.createDiv({ cls: 'lorebase-criterion-actions' });
                const clear = actions.createEl('button', { cls: 'lorebase-criterion-action', attr: { type: 'button', 'aria-label': t('editClear'), title: t('editClear') } });
                setIcon(clear, 'rotate-ccw');
                const remove = actions.createEl('button', { cls: 'lorebase-criterion-action', attr: { type: 'button', 'aria-label': `${labels.remove}: ${row.name}`, title: labels.remove } });
                setIcon(remove, 'x');
                const refresh = (): void => {
                    updateRatingReadout(value, row.value, row.value === null ? '—' : `${formatRatingValue(row.value)} / ${getRatingMax(this.settings)}`);
                    stars.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
                        const fill = paintRatingStar(button, Number(button.dataset.rating), row.value, this.settings, this.type);
                        button.setAttribute('aria-pressed', String(fill !== 'empty'));
                    });
                };
                const input = mountTenthsRating(value, this.settings, () => row.value, next => {
                    row.value = next;
                    refresh();
                }, row.name);
                for (const number of getRatingStarValues(this.settings)) {
                    const button = stars.createEl('button', { cls: 'lorebase-editmode-star lorebase-criterion-star', text: '★', attr: { type: 'button', 'data-rating': String(number), 'aria-label': `${t('editRating')} ${number}` } });
                    button.addEventListener('click', event => {
                        const rect = button.getBoundingClientRect();
                        row.value = event.detail === 0 ? number : getRatingFromStarPosition(number, event.clientX - rect.left, rect.width, this.settings);
                        refresh();
                    });
                }
                clear.addEventListener('click', () => { row.value = null; refresh(); });
                refresh();
                name.addEventListener('input', () => {
                    const next = name.value.trim();
                    const duplicate = this.rows?.some(other => other !== row && other.name.toLocaleLowerCase() === next.toLocaleLowerCase());
                    name.setCustomValidity(duplicate ? labels.duplicate : '');
                    if (next && !duplicate) {
                        row.name = next;
                        stars.setAttribute('aria-label', row.name);
                        input?.setAttribute('aria-label', row.name);
                        remove.setAttribute('aria-label', `${labels.remove}: ${row.name}`);
                    }
                });
                name.addEventListener('change', () => { name.value = row.name; name.setCustomValidity(''); });
                remove.addEventListener('click', () => { this.rows = this.rows?.filter(other => other !== row); render(); });
            }
        };
        const add = body.createDiv({ cls: 'lorebase-detailed-rating-add' });
        const input = add.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text', placeholder: labels.name, 'aria-label': labels.name } });
        const button = add.createEl('button', { cls: 'lorebase-editmode-btn', text: labels.add, attr: { type: 'button' } });
        const addRow = (): void => {
            const name = input.value.trim();
            if (!name) { input.focus(); return; }
            if (this.rows?.some(row => row.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                input.setCustomValidity(labels.duplicate); input.reportValidity(); return;
            }
            this.rows ??= [];
            this.rows.push({ name, value: null }); input.value = ''; render(); input.focus();
        };
        input.addEventListener('input', () => input.setCustomValidity(''));
        input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); addRow(); } });
        button.addEventListener('click', addRow);
        render();
    }
}
