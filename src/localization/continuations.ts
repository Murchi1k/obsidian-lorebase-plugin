import { i18n } from './index';
const copy = {
    found:['New continuation found','Найдено продолжение','Знайдено продовження','发现新续作'],
    baseline:['Available parts','Доступные части','Доступні частини','可选分部'],
    hint:['Select what you want to add. Unselected parts will not be suggested again.','Выберите нужное. Невыбранные части не будут предлагаться повторно.','Виберіть потрібне. Невибрані частини не пропонуватимуться знову.','选择要添加的分部。未选分部不会重复提示。'],
    add:['Add selected','Добавить выбранное','Додати вибране','添加所选'],
    watch:['Add and resume watching','Добавить и смотреть','Додати й дивитися','添加并继续观看'],
    ignore:['Not interested','Неинтересно','Нецікаво','不感兴趣'],
    date:['Release date','Дата выхода','Дата виходу','发行日期'],
    unknown:['Unknown','Неизвестна','Невідома','未知'],
    episodes:['episodes','серий','серій','集'],
    extra:['New episodes','Новые серии','Нові серії','新集数'],
    announced:['Announced','Анонс','Анонс','已公布'],
} as const;
export const ct=(key:keyof typeof copy):string=>copy[key][({en:0,ru:1,uk:2,'zh-CN':3} as const)[i18n.getLanguage()]];
