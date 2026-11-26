import { afterEach, expect, it } from 'vitest';
import { getSearchCardMetadata, getSearchPublicationStatus } from '../src/modals/searchCardMetadata';

import { i18n } from '../src/localization';
afterEach(() => i18n.setLanguage('en'));

it('shows a repeated year only once', () => {
    expect(getSearchCardMetadata({ year: '2020', subtitle: '2020' })).toEqual({ meta: '2020', subtitle: '' });
});
it('keeps the full release date instead of repeating its year', () => {
    expect(getSearchCardMetadata({ year: '2020', subtitle: 'Dec 9, 2020' })).toEqual({ meta: '', subtitle: 'Dec 9, 2020' });
});
it('retains other useful media information', () => {
    expect(getSearchCardMetadata({ year: '2020', format: 'TV', status: 'Finished', subtitle: 'Studio' }))
        .toEqual({ meta: '2020 / TV / Finished', subtitle: 'Studio' });
});

it('shows one full date and keeps alternative anime titles out of the date row', () => {
 i18n.setLanguage('ru');
 expect(getSearchCardMetadata({ provider: 'shikimori', year: '2014', released: '2014-07-07', format: 'TV', subtitle: 'Akame ga Kill!' }, true)).toEqual({ meta: '7 июл. 2014 / TV', subtitle: '' });
 expect(getSearchCardMetadata({ provider: 'steam', year: '2020', released: 'Dec 9, 2020', subtitle: 'Dec 9, 2020' }, true)).toEqual({ meta: '9 дек. 2020', subtitle: '' });
});
it('localizes publication states consistently across manga providers', () => {
 i18n.setLanguage('ru');
 for (const status of ['FINISHED', 'released', 'completed', '15 Volumes (Complete)']) expect(getSearchPublicationStatus(status)).toEqual({ value: 'completed', label: 'Завершено' });
 for (const status of ['RELEASING', 'ongoing', 'publishing']) expect(getSearchPublicationStatus(status)).toEqual({ value: 'ongoing', label: 'Выходит' });
 expect(getSearchPublicationStatus('HIATUS')?.label).toBe('Приостановлено');
 expect(getSearchPublicationStatus('CANCELLED')?.label).toBe('Отменено');
 expect(getSearchPublicationStatus('NOT_YET_RELEASED')?.label).toBe('Анонс');
 expect(getSearchPublicationStatus('unknown')).toBeNull();
});
