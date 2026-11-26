import { App, Modal, setIcon } from 'obsidian';
import { renderChoiceButtons } from '../settings/sections/choiceButtons';
import type { Language } from '../types';

export class AniListSyncHelpModal extends Modal {
    constructor(app: App, private readonly language: Language) { super(app); }

    private text(en: string, ru: string, uk: string): string {
        return this.language === 'ru' ? ru : this.language === 'uk' ? uk : en;
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-anilist-sync-help-modal');
        this.setTitle(this.text('How AniList sync works', 'Как работает AniList Sync', 'Як працює AniList Sync'));
        this.contentEl.empty();
        const navigation = this.contentEl.createDiv({ cls: 'lorebase-sync-help-navigation' });
        const overview = this.contentEl.createDiv({ cls: 'lorebase-sync-help-overview' });
        const pages = {
            import: overview.createDiv(),
            sync: overview.createDiv(),
            link: overview.createDiv(),
        };
        this.section(pages.import, 'download', this.text('Import · AniList → LOREBASE', 'Импорт · AniList → LOREBASE', 'Імпорт · AniList → LOREBASE'), this.text(
            'Choose entries from your AniList list. New notes use your templates; linked notes receive the selected entries’ personal data from AniList, replacing local values. Import sends nothing to the site.',
            'Вы выбираете записи из своего списка AniList. Новые заметки создаются по вашим шаблонам. У уже связанных заметок личные данные заменяются данными выбранных записей с сайта. Импорт ничего не отправляет в AniList.',
            'Ви вибираєте записи зі свого списку AniList. Нові нотатки створюються за вашими шаблонами. В уже пов’язаних нотатках особисті дані замінюються даними вибраних записів із сайту. Імпорт нічого не надсилає в AniList.'));
        this.section(pages.sync, 'refresh-cw', this.text('Sync · LOREBASE ↔ AniList', 'Синхронизация · LOREBASE ↔ AniList', 'Синхронізація · LOREBASE ↔ AniList'), this.text(
            'Exchanges status, rating, episodes or chapters and volumes, start and finish dates, and My Notes. Runs when you press Sync now, or when Obsidian starts if enabled. New entries from your AniList list are also imported.',
            'Обменивается статусом, оценкой, сериями или главами и томами, датами начала и окончания, My Notes. Запускается по кнопке или при открытии Obsidian, если включена опция. Новые записи из вашего списка AniList тоже импортируются.',
            'Обмінюється статусом, оцінкою, серіями або розділами й томами, датами початку та завершення, My Notes. Запускається кнопкою або під час відкриття Obsidian, якщо ввімкнено опцію. Нові записи зі списку AniList також імпортуються.'));
        const linking = this.section(pages.link, 'link-2', this.text('Link existing notes', 'Связать существующие', 'Пов’язати наявні'), this.text(
            'For anime and manga already in your vault, including other providers and manually created notes. The link preserves the original provider and does not create a duplicate note or send data immediately.',
            'Для аниме и манги, которые уже есть в хранилище: из других провайдеров или созданных вручную. Привязка сохраняет исходный источник, не создаёт копию заметки и сама по себе ничего не отправляет на сайт.',
            'Для аніме та манґи, які вже є у сховищі: з інших провайдерів або створених вручну. Прив’язка зберігає початкове джерело, не створює копію нотатки й сама нічого не надсилає на сайт.'));
        const steps = linking.createEl('ol', { cls: 'lorebase-sync-help-link-steps' });
        for (const text of [
            this.text('Choose Anime or Manga, then your local note.', 'Выберите «Аниме» или «Манга», затем свою заметку.', 'Виберіть «Аніме» або «Манґа», а потім свою нотатку.'),
            this.text('Find the matching title on AniList and press Link.', 'Найдите нужное произведение на AniList и нажмите «Связать».', 'Знайдіть потрібний твір на AniList і натисніть «Пов’язати».'),
            this.text('Run sync: the first exchange sends local personal data, including empty values. Later exchanges work both ways.', 'Запустите синхронизацию: первый обмен отправит локальные личные данные, включая пустые значения. Дальше обмен идёт в обе стороны.', 'Запустіть синхронізацію: перший обмін надішле локальні особисті дані, включно з порожніми значеннями. Надалі обмін працює в обидва боки.'),
        ]) steps.createEl('li', { text });
        const showPage = (mode: keyof typeof pages): void => {
            for (const key of Object.keys(pages) as (keyof typeof pages)[]) pages[key].hidden = key !== mode;
        };
        renderChoiceButtons<keyof typeof pages>(navigation, this.text('AniList Sync modes', 'Действия AniList Sync', 'Дії AniList Sync'), [
            { value: 'import', label: this.text('Import', 'Импорт', 'Імпорт'), icon: 'download' },
            { value: 'sync', label: this.text('Sync', 'Синхронизация', 'Синхронізація'), icon: 'refresh-cw' },
            { value: 'link', label: this.text('Link', 'Привязка', 'Прив’язка'), icon: 'link-2' },
        ], 'import', showPage);
        showPage('import');

        const priority = this.contentEl.createDiv({ cls: 'lorebase-sync-help-priority' });
        this.section(priority, 'shield-check', this.text('Local changes take priority', 'Локальные изменения в приоритете', 'Локальні зміни мають пріоритет'), this.text(
            'Changes are compared field by field with the last sync. Different fields are merged. The rules below apply to Sync; Import takes data from AniList.',
            'Изменения сравниваются с последним обменом отдельно по каждому полю. Разные поля объединяются. Эти правила действуют при синхронизации; импорт берёт данные с AniList.',
            'Зміни порівнюються з останнім обміном окремо за кожним полем. Різні поля об’єднуються. Ці правила діють під час синхронізації; імпорт бере дані з AniList.'));
        const rules = priority.createDiv({ cls: 'lorebase-sync-help-rules' });
        const rows = [
            [this.text('Changed locally', 'Изменено в плагине', 'Змінено в плагіні'), 'LOREBASE → AniList'],
            [this.text('Changed on the site', 'Изменено на сайте', 'Змінено на сайті'), 'AniList → LOREBASE'],
            [this.text('Same field changed on both sides', 'Одно поле изменено с обеих сторон', 'Одне поле змінено з обох боків'), this.text('Local value wins', 'Приоритет у плагина', 'Пріоритет у плагіна')],
        ];
        for (const [condition, result] of rows) {
            const row = rules.createDiv({ cls: 'lorebase-sync-help-rule' });
            row.createSpan({ text: condition });
            row.createSpan({ cls: 'lorebase-sync-help-rule-result', text: result });
        }
        this.section(this.contentEl, 'link-2', this.text('First sync of an AniList note', 'Первый обмен заметки из AniList', 'Перший обмін нотатки з AniList'), this.text(
            'An AniList note with no previous sync starts from the website’s data. After that, changes are compared with the last sync.',
            'Для заметки AniList без истории синхронизации сначала берутся данные сайта. При последующих запусках изменения сравниваются с последним обменом.',
            'Для нотатки AniList без історії синхронізації спочатку беруться дані сайту. Під час наступних запусків зміни порівнюються з останнім обміном.'));
        this.section(this.contentEl, 'file-text', this.text('What stays in your vault', 'Что остаётся в хранилище', 'Що залишається у сховищі'), this.text(
            'Covers, descriptions, genres and other note sections are not sent to AniList. Only the “My Notes” section is exchanged with AniList notes (up to 6,000 characters). Ratings are converted between the two scales.',
            'Обложки, описания, жанры и остальные разделы заметки не отправляются в AniList. С заметками сайта обменивается только раздел «My Notes» — до 6000 символов. Оценки пересчитываются между шкалами.',
            'Обкладинки, описи, жанри та інші розділи нотатки не надсилаються в AniList. Із нотатками сайту обмінюється лише розділ «My Notes» — до 6000 символів. Оцінки перераховуються між шкалами.'));
        this.section(this.contentEl, 'trash-2', this.text('Optional deletion sync', 'Синхронизация удалений', 'Синхронізація видалень'), this.text(
            'Deletion sync is off by default. When enabled, a local removal requires a recorded delete event for the linked file. A missing folder or unavailable metadata stops sync safely. A remote removal can move an unchanged linked note to your configured trash. Changed local notes are preserved and sent back to AniList.',
            'Синхронизация удалений по умолчанию выключена. При её включении удаление на сайте требует зафиксированного события удаления связанного файла. Отсутствующая папка или недоступные метаданные останавливают обмен. Удаление на сайте может отправить неизменённую связанную заметку в выбранную корзину. Изменённые локальные заметки сохраняются и отправляются обратно в AniList.',
            'Синхронізацію видалень типово вимкнено. Після ввімкнення видалення на сайті потребує зафіксованої події видалення пов’язаного файла. Відсутня папка або недоступні метадані зупиняють обмін. Видалення на сайті може перемістити незмінену пов’язану нотатку до вибраного кошика. Змінені локальні нотатки зберігаються та надсилаються до AniList.'));
        const footer = this.contentEl.createDiv({ cls: 'lorebase-anilist-help-footer' });
        footer.createEl('button', { cls: 'mod-cta', text: this.text('Got it', 'Понятно', 'Зрозуміло'),
            attr: { type: 'button' } }).addEventListener('click', () => this.close());
    }

    private section(parent: HTMLElement, iconName: string, title: string, text: string): HTMLElement {
        const collapsible = parent === this.contentEl;
        const section = collapsible
            ? parent.createEl('details', { cls: 'lorebase-sync-help-detail' })
            : parent.createDiv({ cls: 'lorebase-sync-help-section' });
        const heading = collapsible ? section.createEl('summary') : section.createEl('h3');
        const icon = heading.createSpan({ cls: 'lorebase-sync-help-heading-icon' });
        setIcon(icon, iconName);
        const [name, direction] = title.split(' · ');
        heading.createSpan({ text: name });
        if (collapsible) {
            const arrow = heading.createSpan({ cls: 'lorebase-sync-help-detail-arrow' });
            setIcon(arrow, 'chevron-down');
        }
        if (direction) {
            const flow = section.createDiv({ cls: 'lorebase-sync-help-flow' });
            const parts = direction.split(/ [→↔] /);
            flow.createSpan({ text: parts[0] });
            const arrow = flow.createSpan({ cls: 'lorebase-sync-help-flow-arrow' });
            setIcon(arrow, direction.includes('↔') ? 'arrow-left-right' : 'arrow-right');
            flow.createSpan({ text: parts[1] ?? '' });
        }
        section.createEl('p', { text });
        return section;
    }

    onClose(): void { this.contentEl.empty(); }
}
