import { describe,expect,it } from 'vitest';
import { formatReleaseDate,getItemReleaseWindow,normalizeReleaseDate,parseReleaseWindow } from '../src/utils/releaseDates';
import { buildReleaseCalendarEntries,getReleaseDate,queryReleaseEntries } from '../src/views/library/releaseCalendar';
import { getNextReleaseStatus } from '../src/services/media/releaseStatus';
import { getIgdbReleaseDate } from '../src/services/integrations/providers/igdb';
import { withReleaseCountdown } from '../src/utils/releaseCountdown';
import type { GameItem } from '../src/types';
const item=(releaseDate:string):GameItem=>({type:'game',filePath:'Game.md',displayName:'Game',status:'to_be_released',releaseDate} as GameItem);

describe('release precision',()=>{
    it('includes awaiting releases with only a year or no date, without assigning them a day',()=>{
        const entries=buildReleaseCalendarEntries([
            {...item(''),year:2028},item(''),{...item(''),status:'completed'} as GameItem,
        ]);
        expect(entries.map(entry=>entry.precision)).toEqual(['year','unknown']);
        expect(entries.map(entry=>entry.dateKey)).toEqual(['2028','unknown']);
    });
    it.each([
        ['2027','year','2027'],['2027-03','month','Март 2027'],['2027-Q1','quarter','I квартал 2027'],
        ['2027-03-18','day','18 марта 2027'],['TBA','unknown','Дата неизвестна'],
    ])('preserves %s and formats only known components',(raw,precision,label)=>{
        expect(parseReleaseWindow(normalizeReleaseDate(raw))?.precision).toBe(precision);
        expect(formatReleaseDate(raw,'ru')).toBe(label);
        if(precision !== 'day') expect(getReleaseDate(item(raw))).toBeNull();
    });
    it.each(['2027-02-30','2027-13','2027-Q0','2027-Q5','2027-02-30T12:00:00Z','nonsense'])('rejects invalid date %s',raw=>expect(normalizeReleaseDate(raw)).toBe(''));
    it('keeps legacy written month dates partial',()=>{
        expect(normalizeReleaseDate('March 2027')).toBe('2027-03');
        expect(normalizeReleaseDate('18.03.2027')).toBe('2027-03-18');
    });
    it('does not fall back from an explicit partial/unknown value to a stale exact alias',()=>{
        for(const raw of ['2027','2027-03','2027-Q1','unknown']) {
            const entry={...item(raw),rawFields:{release_date:'2027-01-01'}};
            expect(getItemReleaseWindow(entry)?.value).toBe(raw);
            expect(getReleaseDate(entry)).toBeNull();
            expect(withReleaseCountdown('Ожидает релиза',entry,'ru',new Date(2026,0,1))).not.toMatch(/через|дн\./);
        }
    });
    it('keeps current release windows upcoming until their whole window passes',()=>{
        const entries=buildReleaseCalendarEntries(['2027-Q1','2027-03','2027','unknown','2027-03-18'].map(item));
        const result=queryReleaseEntries(entries,new Set(['game']),'upcoming','asc','',new Date(2027,2,20));
        expect(result.map(entry=>entry.item.releaseDate)).toEqual(['2027-Q1','2027','2027-03','unknown']);
        expect(entries.filter(entry=>!entry.precision).map(entry=>entry.dateKey)).toEqual(['2027-03-18']);
        expect(getNextReleaseStatus(item('2027-Q1'),new Date(2027,1,15))).toBe('to_be_released');
        expect(getNextReleaseStatus(item('2027-Q1'),new Date(2027,3,1))).toBe('not_started');
    });
    it.each([
        ['YYYY',{},'2027'],['YYYYMMMM',{m:3},'2027-03'],['YYYYQ2',{},'2027-Q2'],['TBD',{},'unknown'],
        ['YYYYMMMMDD',{m:3,d:18,date:Date.UTC(2027,2,18)/1000},'2027-03-18'],
    ])('reads IGDB %s rather than inventing a day from its timestamp',(format,fields,expected)=>{
        expect(getIgdbReleaseDate({release_dates:[{y:2027,date:Date.UTC(2027,0,1)/1000,...fields,date_format:{format}}]})).toBe(expected);
    });
});
