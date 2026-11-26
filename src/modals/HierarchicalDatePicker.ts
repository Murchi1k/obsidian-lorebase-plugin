import { Notice, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { normalizePersonalDate, UNKNOWN_DATE } from '../utils/personalDates';
import { personalDateText } from '../localization/personalDates';
import { normalizeReleaseDate, parseReleaseWindow } from '../utils/releaseDates';
import { releaseDateText } from '../localization/releaseDates';

export interface PersonalDatePickerOptions { allowPartial?: boolean; allowUnknown?: boolean; allowQuarter?: boolean }

type DatePickerMode = 'days' | 'months' | 'quarters' | 'years';

interface DateParts {
    year: number;
    month: number;
    day: number;
}

export class HierarchicalDatePicker {
    private popover: HTMLElement | null = null;
    private mode: DatePickerMode = 'days';
    private viewYear = new Date().getFullYear();
    private viewMonth = new Date().getMonth();
    private precision: 'day' | 'month' | 'quarter' | 'year' = 'day';

    private readonly onInputClick = (event: MouseEvent): void => {
        event.preventDefault();
        if (this.popover) this.close();
        else this.open();
    };

    private readonly onInputKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (this.popover) this.close();
        else this.open();
    };

    private readonly onFieldClick = (): void => {
        if (!this.popover) this.open();
    };

    private readonly onFieldInput = (): void => {
        this.input.removeClass('is-invalid');
        const raw = this.input.value.trim();
        if (!raw) this.onChange('');
        else {
            const parsed = this.parseValue(raw);
            if (parsed) this.onChange(parsed);
        }
        if (!this.popover) return;
        window.setTimeout(() => {
            if (!this.popover) return;
            const selected = parseIsoDate(this.getValue());
            if (selected) {
                this.viewYear = selected.year;
                this.viewMonth = selected.month - 1;
                this.mode = 'days';
            }
            this.render();
        }, 0);
    };

    private readonly onFieldBlur = (): void => {
        this.commit();
    };

    private readonly onFieldKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter') return;
        if (this.commit()) this.input.blur();
    };

    private readonly onDocumentPointerDown = (event: PointerEvent): void => {
        const target = event.target as Node | null;
        if (!target || this.input.contains(target) || this.trigger.contains(target) || this.popover?.contains(target)) return;
        this.close();
    };

    private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || !this.popover) return;
        event.preventDefault();
        event.stopPropagation();
        this.close();
        this.input.focus();
    };

    private readonly onViewportChange = (): void => this.positionPopover();

    private readonly onContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        if (this.mode === 'years') this.mode = 'months';
        else if (this.mode === 'months') this.mode = 'days';
        else return;
        this.render();
    };

    constructor(
        private readonly input: HTMLInputElement,
        private readonly trigger: HTMLButtonElement,
        private readonly getValue: () => string,
        private readonly onChange: (value: string) => void,
        private readonly options: PersonalDatePickerOptions = {}
    ) {
        this.input.setAttribute('aria-haspopup', 'dialog');
        this.trigger.setAttribute('aria-haspopup', 'dialog');
        this.input.addEventListener('click', this.onFieldClick);
        this.input.addEventListener('input', this.onFieldInput);
        this.input.addEventListener('blur', this.onFieldBlur);
        this.input.addEventListener('keydown', this.onFieldKeydown);
        this.trigger.addEventListener('click', this.onInputClick);
        this.trigger.addEventListener('keydown', this.onInputKeydown);
        if (options.allowPartial) this.input.title = options.allowQuarter ? releaseDateText('hint') : personalDateText('hint');
    }

    destroy(): void {
        this.close();
        this.input.removeEventListener('click', this.onFieldClick);
        this.input.removeEventListener('input', this.onFieldInput);
        this.input.removeEventListener('blur', this.onFieldBlur);
        this.input.removeEventListener('keydown', this.onFieldKeydown);
        this.trigger.removeEventListener('click', this.onInputClick);
        this.trigger.removeEventListener('keydown', this.onInputKeydown);
    }

    syncInput(value: string = this.getValue()): void {
        if (this.options.allowQuarter && /^(\d{4}-Q[1-4])$/.test(value)) {
            this.input.value = value;
            this.input.toggleClass('is-empty', false);
            return;
        }
        if (this.options.allowUnknown && value === UNKNOWN_DATE || this.options.allowPartial && /^\d{4}(?:-\d{2})?$/.test(value)) {
            this.input.value = value === UNKNOWN_DATE ? personalDateText('unknown') : value;
            this.input.toggleClass('is-empty', false);
            return;
        }
        const selected = parseIsoDate(value);
        const language = i18n.getLanguage();
        const isDayFirst = language === 'ru' || language === 'uk';
        const isYearFirst = language === 'zh-CN';
        this.input.placeholder = isYearFirst ? '年-月-日' : isDayFirst ? 'дд.мм.гггг' : 'mm/dd/yyyy';
        this.input.value = selected
            ? isYearFirst
                ? `${selected.year}-${String(selected.month).padStart(2, '0')}-${String(selected.day).padStart(2, '0')}`
                : isDayFirst
                ? `${String(selected.day).padStart(2, '0')}.${String(selected.month).padStart(2, '0')}.${selected.year}`
                : `${String(selected.month).padStart(2, '0')}/${String(selected.day).padStart(2, '0')}/${selected.year}`
            : '';
        this.input.toggleClass('is-empty', !selected);
    }

    commit(): boolean {
        const raw = this.input.value.trim();
        if (!raw) {
            this.onChange('');
            this.input.removeClass('is-invalid');
            this.syncInput('');
            return true;
        }
        const parsed = this.parseValue(raw);
        if (!parsed) {
            this.input.addClass('is-invalid');
            return false;
        }
        this.onChange(parsed);
        this.input.removeClass('is-invalid');
        this.syncInput(parsed);
        return true;
    }

    focus(): void {
        this.input.focus();
    }
    get validationMessage(): string { return this.options.allowQuarter ? releaseDateText('invalid') : this.options.allowPartial ? personalDateText('invalid') : ''; }

    private parseValue(raw: string): string | null {
        if (this.options.allowUnknown && (raw === personalDateText('unknown') || raw.toLowerCase() === UNKNOWN_DATE)) return UNKNOWN_DATE;
        if (this.options.allowQuarter) return parseManualDate(raw) || normalizeReleaseDate(raw) || null;
        if (this.options.allowPartial && /^\d{4}(?:-\d{2})?$/.test(raw)) return normalizePersonalDate(raw) || null;
        return parseManualDate(raw);
    }

    private open(): void {
        const selected = parseIsoDate(this.getValue());
        const initial = selected ?? todayParts();
        this.viewYear = initial.year;
        this.viewMonth = initial.month - 1;
        this.mode = 'days';
        const partial = /^(\d{4})(?:-(\d{2}))?$/.exec(this.getValue());
        this.precision = this.options.allowPartial && partial ? partial[2] ? 'month' : 'year' : 'day';
        if (partial && this.options.allowPartial) {
            this.viewYear = Number(partial[1]);
            if (partial[2]) this.viewMonth = Number(partial[2]) - 1;
            this.mode = partial[2] ? 'months' : 'years';
        }
        const quarter = this.options.allowQuarter && parseReleaseWindow(this.getValue());
        if (quarter && quarter.precision === 'quarter') {
            this.precision = 'quarter'; this.mode = 'quarters'; this.viewYear = quarter.start!.getFullYear();
        }

        this.popover = document.body.createDiv({
            cls: 'lorebase-date-picker-popover',
            attr: { role: 'dialog', 'aria-modal': 'false' },
        });
        this.popover.addEventListener('contextmenu', this.onContextMenu);
        this.render();
        this.positionPopover();

        window.setTimeout(() => {
            if (!this.popover) return;
            document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
            document.addEventListener('keydown', this.onDocumentKeydown, true);
        }, 0);
        window.addEventListener('resize', this.onViewportChange);
        window.addEventListener('scroll', this.onViewportChange, true);
    }

    close(): void {
        this.popover?.remove();
        this.popover = null;
        document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
        document.removeEventListener('keydown', this.onDocumentKeydown, true);
        window.removeEventListener('resize', this.onViewportChange);
        window.removeEventListener('scroll', this.onViewportChange, true);
    }

    private positionPopover(): void {
        if (!this.popover) return;
        const rect = this.input.getBoundingClientRect();
        const popoverRect = this.popover.getBoundingClientRect();
        const margin = 8;
        const left = Math.min(
            Math.max(margin, rect.left),
            Math.max(margin, window.innerWidth - popoverRect.width - margin)
        );
        const roomBelow = window.innerHeight - rect.bottom - margin;
        const top = roomBelow >= popoverRect.height
            ? rect.bottom + 6
            : Math.max(margin, rect.top - popoverRect.height - 6);
        this.popover.style.left = `${Math.round(left)}px`;
        this.popover.style.top = `${Math.round(top)}px`;
    }

    private render(): void {
        const popover = this.popover;
        if (!popover) return;
        popover.empty();
        popover.toggleClass('is-month-view', this.mode === 'months' || this.mode === 'quarters');
        popover.toggleClass('is-year-view', this.mode === 'years');
        if (this.options.allowPartial) {
            const precision = popover.createDiv({ cls: 'lorebase-date-precision' });
            for (const [value, label] of [['day', 'exact'], ['month', 'month'], ['year', 'year']] as const) {
                const button = precision.createEl('button', { text: this.options.allowQuarter ? releaseDateText(value) : personalDateText(label), attr: { type: 'button', 'aria-pressed': String(this.precision === value) } });
                button.addEventListener('click', () => { this.precision = value; this.mode = value === 'year' ? 'years' : value === 'month' ? 'months' : 'days'; this.render(); });
            }
            if (this.options.allowQuarter) {
                const button = precision.createEl('button', { text: releaseDateText('quarter'), attr: { type:'button', 'aria-pressed':String(this.precision === 'quarter') } });
                precision.insertBefore(button, precision.children[2]);
                button.addEventListener('click', () => { this.precision = 'quarter'; this.mode = 'quarters'; this.render(); });
            }
        }

        const header = popover.createDiv({ cls: 'lorebase-date-picker-header' });
        const label = header.createEl('button', {
            cls: 'lorebase-date-picker-heading',
            attr: { type: 'button' },
        });
        label.createSpan({ text: this.getHeading() });
        const headingIcon = label.createSpan({ cls: 'lorebase-date-picker-heading-icon', attr: { 'aria-hidden': 'true' } });
        setIcon(headingIcon, this.mode === 'years' ? 'minus' : 'chevron-right');
        label.disabled = this.mode === 'years';
        label.addEventListener('click', () => {
            if (this.mode === 'days') this.mode = 'months';
            else if (this.mode === 'months' || this.mode === 'quarters') this.mode = 'years';
            this.render();
        });

        const navigation = header.createDiv({ cls: 'lorebase-date-picker-navigation' });
        this.createNavigationButton(navigation, 'chevron-up', -1);
        this.createNavigationButton(navigation, 'chevron-down', 1);

        if (this.mode === 'days') this.renderDays(popover);
        else if (this.mode === 'months') this.renderMonths(popover);
        else if (this.mode === 'quarters') {
            const grid = popover.createDiv({ cls:'lorebase-date-picker-grid is-months is-quarters' });
            for (let quarter = 1; quarter <= 4; quarter++) {
                const value = `${this.viewYear}-Q${quarter}`;
                const button = grid.createEl('button', { cls:'lorebase-date-picker-cell', text:`${['I','II','III','IV'][quarter-1]} ${releaseDateText('quarter')}`, attr:{type:'button'} });
                button.toggleClass('is-selected', this.getValue() === value);
                button.addEventListener('click', () => this.selectValue(value));
            }
        }
        else this.renderYears(popover);

        const footer = popover.createDiv({ cls: 'lorebase-date-picker-footer' });
        const clear = footer.createEl('button', {
            cls: 'lorebase-date-picker-footer-button',
            attr: { type: 'button' },
            text: t('editClear'),
        });
        clear.disabled = !this.getValue();
        clear.addEventListener('click', () => this.selectValue(''));
        if (this.options.allowUnknown) {
            const unknown = footer.createEl('button', { cls: 'lorebase-date-picker-footer-button', text: personalDateText('unknown'), attr: { type: 'button' } });
            unknown.addEventListener('click', () => this.selectValue(UNKNOWN_DATE));
        }

        this.positionPopover();
    }

    private createNavigationButton(container: HTMLElement, iconName: string, direction: -1 | 1): void {
        const button = container.createEl('button', {
            cls: 'lorebase-date-picker-nav-button',
            attr: { type: 'button', 'aria-label': direction < 0 ? 'Previous' : 'Next' },
        });
        setIcon(button, iconName);
        button.addEventListener('click', () => {
            if (this.mode === 'days') {
                const next = new Date(this.viewYear, this.viewMonth + direction, 1);
                this.viewYear = next.getFullYear();
                this.viewMonth = next.getMonth();
            } else if (this.mode === 'months' || this.mode === 'quarters') {
                this.viewYear += direction;
            } else {
                this.viewYear += direction * 10;
            }
            this.render();
        });
    }

    private getHeading(): string {
        if (this.mode === 'days') {
            return new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric' })
                .format(new Date(this.viewYear, this.viewMonth, 1));
        }
        if (this.mode === 'months' || this.mode === 'quarters') return String(this.viewYear);
        const decadeStart = Math.floor(this.viewYear / 10) * 10;
        return `${decadeStart} – ${decadeStart + 9}`;
    }

    private renderDays(popover: HTMLElement): void {
        const weekdays = popover.createDiv({ cls: 'lorebase-date-picker-weekdays' });
        const weekdayFormatter = new Intl.DateTimeFormat(getLocale(), { weekday: 'short' });
        for (let index = 0; index < 7; index++) {
            const date = new Date(2021, 0, 4 + index);
            weekdays.createSpan({ text: weekdayFormatter.format(date).replace('.', '') });
        }

        const grid = popover.createDiv({ cls: 'lorebase-date-picker-grid is-days' });
        const selected = parseIsoDate(this.getValue());
        const today = todayParts();
        const firstDayOffset = (new Date(this.viewYear, this.viewMonth, 1).getDay() + 6) % 7;

        for (let index = 0; index < 42; index++) {
            const date = new Date(this.viewYear, this.viewMonth, index - firstDayOffset + 1);
            const parts: DateParts = {
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate(),
            };
            const button = grid.createEl('button', {
                cls: 'lorebase-date-picker-cell',
                attr: { type: 'button' },
                text: String(parts.day),
            });
            button.toggleClass('is-outside', date.getMonth() !== this.viewMonth);
            button.toggleClass('is-today', isSameDate(parts, today));
            button.toggleClass('is-selected', Boolean(selected && isSameDate(parts, selected)));
            button.addEventListener('click', () => this.selectValue(toIsoDate(parts)));
        }
    }

    private renderMonths(popover: HTMLElement): void {
        const grid = popover.createDiv({ cls: 'lorebase-date-picker-grid is-months' });
        const selected = parseIsoDate(this.getValue());
        const formatter = new Intl.DateTimeFormat(getLocale(), { month: 'short' });
        for (let month = 0; month < 12; month++) {
            const button = grid.createEl('button', {
                cls: 'lorebase-date-picker-cell',
                attr: { type: 'button' },
                text: formatter.format(new Date(this.viewYear, month, 1)).replace('.', ''),
            });
            button.toggleClass('is-selected', selected?.year === this.viewYear && selected.month === month + 1);
            button.addEventListener('click', () => {
                this.viewMonth = month;
                if (this.precision === 'month') { this.selectValue(`${this.viewYear}-${String(month + 1).padStart(2, '0')}`); return; }
                this.mode = 'days';
                this.render();
            });
        }
    }

    private renderYears(popover: HTMLElement): void {
        const grid = popover.createDiv({ cls: 'lorebase-date-picker-grid is-years' });
        const selected = parseIsoDate(this.getValue());
        const decadeStart = Math.floor(this.viewYear / 10) * 10;
        for (let year = decadeStart - 2; year <= decadeStart + 13; year++) {
            const button = grid.createEl('button', {
                cls: 'lorebase-date-picker-cell',
                attr: { type: 'button' },
                text: String(year),
            });
            button.toggleClass('is-outside', year < decadeStart || year > decadeStart + 9);
            button.toggleClass('is-selected', selected?.year === year);
            button.addEventListener('click', () => {
                this.viewYear = year;
                if (this.precision === 'year') { this.selectValue(String(year)); return; }
                this.mode = this.precision === 'quarter' ? 'quarters' : 'months';
                this.render();
            });
        }
    }

    private selectValue(value: string): void {
        this.onChange(value);
        this.syncInput(value);
        this.close();
        this.input.focus();
    }
}

export function validateDatePickers(pickers: HierarchicalDatePicker[]): boolean {
    for (const picker of pickers) {
        if (picker.commit()) continue;
        const language = i18n.getLanguage();
        const message = language === 'ru'
            ? 'Введите корректную дату в формате дд.мм.гггг'
            : language === 'uk'
                ? 'Введіть коректну дату у форматі дд.мм.рррр'
                : language === 'zh-CN' ? '请输入有效日期，格式为年-月-日' : 'Enter a valid date in mm/dd/yyyy format';
        new Notice(picker.validationMessage || message);
        picker.focus();
        return false;
    }
    return true;
}

function parseManualDate(value: string): string | null {
    const normalized = value.trim();
    let year: number;
    let month: number;
    let day: number;
    const isoMatch = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(normalized);
    if (isoMatch) {
        year = Number(isoMatch[1]);
        month = Number(isoMatch[2]);
        day = Number(isoMatch[3]);
    } else {
        const displayMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(normalized);
        if (!displayMatch) return null;
        year = Number(displayMatch[3]);
        const isDayFirst = i18n.getLanguage() === 'ru' || i18n.getLanguage() === 'uk';
        month = Number(displayMatch[isDayFirst ? 2 : 1]);
        day = Number(displayMatch[isDayFirst ? 1 : 2]);
    }
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return toIsoDate({ year, month, day });
}

function parseIsoDate(value: string): DateParts | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { year, month, day };
}

function todayParts(): DateParts {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
}

function toIsoDate(value: DateParts): string {
    return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function isSameDate(left: DateParts, right: DateParts): boolean {
    return left.year === right.year && left.month === right.month && left.day === right.day;
}

function getLocale(): string {
    return i18n.getLocale();
}
