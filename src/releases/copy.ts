import type { Language } from '../types';

const en = {
    title: 'What’s new', updated: 'More possibilities for your library.',
    intro: 'Explore the highlights or browse the complete release history.',
    highlights: 'Highlights', history: 'Changelog', added: 'Added', improved: 'Improved', fixed: 'Fixed',
    latest: 'Latest', installed: 'Installed', open: 'Explore', done: 'Got it',
    allChanges: 'All changes', replay: 'Show update window',
    historyIntro: 'Features, improvements and fixes, release by release. Available offline.',
    original: 'Original release notes · English', empty: 'Release notes for this version have not been added yet.',
    enableMusic: 'Enable music in Media settings to open this library.',
    failed: 'Could not open this section. Please try again.', saveFailed: 'Could not save the viewed version. This window may appear again.',
};
export type ReleaseCopy = typeof en;
const copy: Record<Language, ReleaseCopy> = {
    en,
    ru: {
        title: 'Что нового', updated: 'Ещё больше для вашей библиотеки.',
        intro: 'Познакомьтесь с главными новинками или откройте полную историю изменений.',
        highlights: 'Главное', history: 'История изменений', added: 'Добавлено', improved: 'Улучшено', fixed: 'Исправлено',
        latest: 'Новая версия', installed: 'Установлена', open: 'Попробовать', done: 'Понятно',
        allChanges: 'Все изменения', replay: 'Посмотреть новинки',
        historyIntro: 'Новые функции, улучшения и исправления по версиям. Доступно без интернета.',
        original: 'Оригинальные заметки к выпуску · английский', empty: 'Описание изменений для этой версии ещё не добавлено.',
        enableMusic: 'Включите музыку в настройках медиа, чтобы открыть библиотеку.',
        failed: 'Не удалось открыть раздел. Попробуйте ещё раз.', saveFailed: 'Не удалось сохранить просмотренную версию. Окно может появиться снова.',
    },
    uk: {
        title: 'Що нового', updated: 'Ще більше для вашої бібліотеки.',
        intro: 'Ознайомтеся з головними новинками або відкрийте повну історію змін.',
        highlights: 'Головне', history: 'Історія змін', added: 'Додано', improved: 'Покращено', fixed: 'Виправлено',
        latest: 'Нова версія', installed: 'Встановлено', open: 'Спробувати', done: 'Зрозуміло',
        allChanges: 'Усі зміни', replay: 'Переглянути новинки',
        historyIntro: 'Нові функції, покращення та виправлення за версіями. Доступно без інтернету.',
        original: 'Оригінальні примітки до випуску · англійська', empty: 'Опис змін для цієї версії ще не додано.',
        enableMusic: 'Увімкніть музику в налаштуваннях медіа, щоб відкрити бібліотеку.',
        failed: 'Не вдалося відкрити розділ. Спробуйте ще раз.', saveFailed: 'Не вдалося зберегти переглянуту версію. Вікно може з’явитися знову.',
    },
    'zh-CN': {
        title: '新增内容', updated: '你的资料库，更多可能。', intro: '探索主要新功能，或浏览完整更新记录。',
        highlights: '亮点', history: '更新记录', added: '新增', improved: '改进', fixed: '修复',
        latest: '新版本', installed: '已安装', open: '探索', done: '知道了', allChanges: '全部更改', replay: '查看新功能',
        historyIntro: '按版本查看功能、改进和修复。支持离线查看。', original: '原始发行说明 · 英语',
        empty: '此版本尚未添加发行说明。', enableMusic: '请在媒体设置中启用音乐资料库。',
        failed: '无法打开此页面，请重试。', saveFailed: '无法保存已查看的版本，此窗口可能再次出现。',
    },
};
export const getReleaseCopy = (language: Language): ReleaseCopy => copy[language] ?? en;

export const HISTORY_COPY = {
    ru: { version: 'Версия', details: 'Подробно', sections: 'Категории изменений', added: 'Новые возможности библиотеки', improved: 'Удобнее в ежедневном использовании', fixed: 'Исправления ошибок и отображения' },
    en: { version: 'Version', details: 'Show details', sections: 'Change categories', added: 'New possibilities for your library', improved: 'Better everyday use', fixed: 'Bug fixes and display corrections' },
    uk: { version: 'Версія', details: 'Докладно', sections: 'Категорії змін', added: 'Нові можливості бібліотеки', improved: 'Зручніше в щоденному використанні', fixed: 'Виправлення помилок і відображення' },
    'zh-CN': { version: '版本', details: '显示详情', sections: '更新分类', added: '资料库的新功能', improved: '更便利的日常使用', fixed: '错误与显示问题修复' },
};

export const EXPLORER_COPY = {
    ru: { features: 'Возможности', previous: 'Назад', next: 'Дальше', release: 'Большое обновление', historyNav: 'История', beta: 'Бета', new: 'Новое', improved: 'Обновлено', intro: 'Больше способов собирать, оценивать и открывать любимое.' },
    en: { features: 'Features', previous: 'Previous', next: 'Next', release: 'A major update', historyNav: 'Changelog', beta: 'Beta', new: 'New', improved: 'Updated', intro: 'More ways to collect, rate and discover what you love.' },
    uk: { features: 'Можливості', previous: 'Назад', next: 'Далі', release: 'Велике оновлення', historyNav: 'Історія', beta: 'Бета', new: 'Нове', improved: 'Оновлено', intro: 'Більше способів збирати, оцінювати й відкривати улюблене.' },
    'zh-CN': { features: '功能', previous: '上一个', next: '下一个', release: '重大更新', historyNav: '更新记录', beta: '测试版', new: '新增', improved: '更新', intro: '用更多方式收藏、评分和发现你所喜爱的作品。' },
} satisfies Record<Language, Record<string, string>>;
