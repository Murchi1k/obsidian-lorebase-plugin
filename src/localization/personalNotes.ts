import { i18n } from './index';

const copy = {
    pausedTitle: ['Why I paused', 'Почему отложил', 'Чому відклав', '暂停原因'],
    droppedTitle: ['Why I stopped', 'Почему бросил', 'Чому припинив', '放弃原因'],
    reasonHint: ['What made you stop?', 'Что помешало продолжить?', 'Що завадило продовжити?', '为什么停止了？'],
    reasonLabel: ['Reason', 'Причина', 'Причина', '原因'],
    unavailableHint: ['Choose Dropped or On hold to add a reason.', 'Чтобы указать причину, выберите статус «Заброшено» или «На паузе».', 'Щоб указати причину, виберіть статус «Покинуто» або «На паузі».', '请选择「已放弃」或「暂停中」状态以填写原因。'],
    pausedExample: ['For example, waiting for a translation', 'Например, жду перевод или нет времени', 'Наприклад, чекаю на переклад або немає часу', '例如，等待翻译或没有时间'],
    droppedExample: ['For example, I did not enjoy the story', 'Например, не понравился сюжет', 'Наприклад, не сподобався сюжет', '例如，不喜欢剧情'],
} as const;

export const personalNotesText=(key:keyof typeof copy):string=>copy[key][({en:0,ru:1,uk:2,'zh-CN':3} as const)[i18n.getLanguage()]];
