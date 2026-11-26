import { i18n } from './index';

const labels = {
    setting: ['Updated editor', 'Обновлённый редактор', 'Оновлений редактор', '新版编辑器'],
    reset: ['Reset', 'Сбросить', 'Скинути', '重置'],
    lowerScore: ['Lower rating', 'Уменьшить оценку', 'Зменшити оцінку', '降低评分'],
    higherScore: ['Raise rating', 'Увеличить оценку', 'Збільшити оцінку', '提高评分'],
    scoreRange: ['Choose a rating from 1 to {max}, in steps of {step}.', 'Введите оценку от 1 до {max} с шагом {step}.', 'Введіть оцінку від 1 до {max} із кроком {step}.', '请输入 1 到 {max} 的评分，步长为 {step}。'],
    managePlatforms: ['Platforms', 'Платформы', 'Платформи', '平台'],
    searchPlatforms: ['Find or add a platform…', 'Найти или добавить платформу…', 'Знайти або додати платформу…', '查找或添加平台…'],
    noMatchingPlatforms: ['No matching platforms', 'Нет подходящих платформ', 'Немає відповідних платформ', '没有匹配的平台'],
    finishPlatforms: ['Done', 'Готово', 'Готово', '完成'],
    removeAvailablePlatform: ['Remove from available platforms', 'Убрать из доступных платформ', 'Прибрати з доступних платформ', '从可用平台移除'],
    noPlayedPlatforms: ['None selected', 'Платформы не выбраны', 'Платформи не вибрано', '未选择游玩平台'],
    editReplays: ['Click the counter to log replays', 'Нажмите на счётчик, чтобы указать перепрохождения', 'Натисніть на лічильник, щоб вказати перепроходження', '点击计数器记录重复通关次数'],
    showTags: ['Show all tags', 'Показать все теги', 'Показати всі теги', '显示全部标签'],
    hideTags: ['Show fewer tags', 'Свернуть теги', 'Згорнути теги', '收起标签'],
    addTag: ['Add tag', 'Добавить тег', 'Додати тег', '添加标签'],
    addGenre: ['Add genre', 'Добавить жанр', 'Додати жанр', '添加类型'],
    showGenres: ['Show all genres', 'Показать все жанры', 'Показати всі жанри', '显示全部类型'],
    hideGenres: ['Show fewer genres', 'Свернуть жанры', 'Згорнути жанри', '收起类型'],
    descriptionNotes: ['Description and notes', 'Описание и заметки', 'Опис і нотатки', '简介和笔记'],
    notesShort: ['Notes', 'Заметки', 'Нотатки', '笔记'],
    myNotes: ['My notes', 'Мои заметки', 'Мої нотатки', '我的笔记'],
    editCoverTitle: ['Edit title', 'Изменить название', 'Змінити назву', '编辑标题'],
    chooseGameType: ['Choose game type', 'Выбрать тип игры', 'Вибрати тип гри', '选择游戏类型'],
    closeEditor: ['Close editor', 'Закрыть редактор', 'Закрити редактор', '关闭编辑器'],
    statusRating: ['Status and rating', 'Статус и оценка', 'Статус і оцінка', '状态和评分'],
    allMedia: ['All', 'Все', 'Усі', '全部'],
    incoming: ['Incoming', 'Входящая', 'Вхідний', '入站关联'],
    relatedActions: ['Link actions', 'Действия со связью', 'Дії зі зв’язком', '关联操作'],
    removeLink: ['Remove link', 'Убрать связь', 'Прибрати зв’язок', '移除关联'],
    moveUp: ['Move up', 'Переместить выше', 'Перемістити вище', '上移'],
    moveDown: ['Move down', 'Переместить ниже', 'Перемістити нижче', '下移'],
} as const;

export function compactGameText(key: keyof typeof labels): string {
    return labels[key][{ en: 0, ru: 1, uk: 2, 'zh-CN': 3 }[i18n.getLanguage()]];
}
