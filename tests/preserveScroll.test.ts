// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { preserveScroll } from '../src/utils/preserveScroll';
afterEach(() => document.body.replaceChildren());
it('restores nested scrolling columns after replacing a shrinking list', () => {
    const column = document.createElement('div'), list = document.createElement('div');
    document.body.append(column); column.append(list);
    column.scrollTop = 740; column.scrollLeft = 12; list.scrollTop = 85;
    const result = preserveScroll(list, () => {
        list.replaceChildren(); column.scrollTop = 0; column.scrollLeft = 0; list.scrollTop = 0;
        list.append(document.createElement('button')); return 'updated';
    });
    expect(result).toBe('updated'); expect(column.scrollTop).toBe(740);
    expect(column.style.overflowAnchor).toBe('none');
    expect(column.scrollLeft).toBe(12); expect(list.scrollTop).toBe(85);
});
it('restores scroll on failure without swallowing the rendering error', () => {
    const list = document.createElement('div'); document.body.append(list); list.scrollTop = 200;
    expect(() => preserveScroll(list, () => { list.scrollTop = 0; throw new Error('render'); })).toThrow('render');
    expect(list.scrollTop).toBe(200);
});
