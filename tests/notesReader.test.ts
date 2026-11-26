// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../src/localization';
import { mountNotesReader, syncNotesReader } from '../src/components/NotesReader';
import { descriptionParagraphs } from '../src/utils/descriptionParagraphs';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeEach(() => { installStatisticsDom(); i18n.setLanguage('en'); });
afterEach(() => document.body.replaceChildren());

const longDescription = Array.from({ length: 14 }, (_, index) => `Chapter ${index + 1} follows the characters through a new city, with more places to explore and people to meet.`).join(' ');
function fixture(value = longDescription) {
    const panel = document.body.createDiv({ cls: 'lorebase-editmode-notes' });
    panel.innerHTML = '<div class="lorebase-editmode-panel-title-row"><div class="lorebase-editmode-note-tabs"><button class="lorebase-editmode-note-tab is-active" data-mode="description">Description</button><button class="lorebase-editmode-note-tab" data-mode="myNotes">My notes</button></div></div><div class="lorebase-editmode-notes-shell"><textarea class="lorebase-editmode-notes-input"></textarea></div>';
    const input = panel.querySelector('textarea')!; input.value = value;
    const changed = vi.fn(); input.addEventListener('input', changed);
    mountNotesReader(panel);
    return { panel, input, changed, content: panel.querySelector('article')!,
        edit: panel.querySelector<HTMLButtonElement>('[data-action="edit-description"]')!,
        more: panel.querySelector<HTMLButtonElement>('[data-action="expand-description"]')! };
}

describe('description and personal notes reading', () => {
    it('adds paragraph breaks without losing words, punctuation, versions or existing line breaks', () => {
        const source = longDescription + '\r\n\r\nRelease 1.25, coming in 2027.\r\nAnother paragraph.';
        const paragraphs = descriptionParagraphs(source);
        expect(paragraphs.length).toBeGreaterThan(3);
        expect(paragraphs.join(' ').replace(/\s+/g, ' ')).toBe(source.replace(/\s+/g, ' '));
        expect(paragraphs.slice(-2)).toEqual(['Release 1.25, coming in 2027.', 'Another paragraph.']);
    });
    it('shows a short introduction, expands the full text and keeps the raw description untouched', () => {
        const { input, changed, content, more } = fixture();
        expect(input.hidden).toBe(true); expect(more.hidden).toBe(false);
        expect(content.textContent!.length).toBeLessThan(longDescription.length);
        more.click(); expect(more.getAttribute('aria-expanded')).toBe('true');
        expect(content.querySelectorAll('p').length).toBeGreaterThan(1);
        expect(content.textContent!.replace(/\s/g, '')).toBe(longDescription.replace(/\s/g, ''));
        more.click(); expect(more.getAttribute('aria-expanded')).toBe('false');
        expect(input.value).toBe(longDescription); expect(changed).not.toHaveBeenCalled();
    });
    it('includes introductory text after a short provider heading', () => {
        const { content, input } = fixture('About the game\n' + longDescription);
        expect(content.textContent).toContain('About the game');
        expect(content.textContent).toContain('Chapter 1 follows');
        expect(input.value).toBe('About the game\n' + longDescription);
    });
    it('edits the original text and refreshes the reading view without generating extra edits', () => {
        const { panel, input, content, edit, changed } = fixture();
        edit.click(); expect(input.hidden).toBe(false); expect(document.activeElement).toBe(input);
        expect(input.value).toBe(longDescription);
        input.value = 'First paragraph.\n\nSecond paragraph.';
        input.dispatchEvent(new Event('input')); syncNotesReader(panel);
        edit.click(); expect(input.hidden).toBe(true);
        expect(Array.from(content.querySelectorAll('p'), p => p.textContent)).toEqual(['First paragraph.', 'Second paragraph.']);
        expect(changed).toHaveBeenCalledOnce();
    });
    it('reads and edits My notes independently from the description', () => {
        const { panel, input, edit, content } = fixture();
        const tabs = panel.querySelectorAll<HTMLButtonElement>('[data-mode]');
        tabs[0].classList.remove('is-active'); tabs[1].classList.add('is-active');
        input.value = 'My notes\nKeep exactly these lines.'; syncNotesReader(panel);
        expect(input.hidden).toBe(true); expect(edit.hidden).toBe(false);
        expect(content.getAttribute('aria-label')).toBe('My Notes');
        expect(content.textContent).toBe('My notesKeep exactly these lines.');
        edit.click();expect(input.hidden).toBe(false);expect(document.activeElement).toBe(input);
        expect(input.value).toBe('My notes\nKeep exactly these lines.');
        tabs[1].classList.remove('is-active'); tabs[0].classList.add('is-active');
        input.value = 'Updated provider description.'; syncNotesReader(panel);
        expect(content.textContent).toBe('Updated provider description.'); expect(input.hidden).toBe(true);
    });
    it('shows a compact add action for empty notes and returns to it after clearing them', () => {
        const { panel, input, edit, content, changed } = fixture();
        const tabs = panel.querySelectorAll<HTMLButtonElement>('[data-mode]');
        tabs[0].classList.remove('is-active');tabs[1].classList.add('is-active');
        input.value='';syncNotesReader(panel);
        const add=panel.querySelector<HTMLButtonElement>('[data-action="add-my-notes"]')!;
        expect(input.hidden).toBe(true);expect(content.hidden).toBe(true);expect(edit.hidden).toBe(true);
        expect(add.hidden).toBe(false);expect(changed).not.toHaveBeenCalled();
        add.click();expect(input.hidden).toBe(false);expect(document.activeElement).toBe(input);
        input.value='First note.\n\nMy own line breaks.';input.dispatchEvent(new Event('input'));syncNotesReader(panel);edit.click();
        expect(add.hidden).toBe(true);expect(input.hidden).toBe(true);expect(content.hidden).toBe(false);
        expect(Array.from(content.querySelectorAll('p'),p=>p.textContent)).toEqual(['First note.','My own line breaks.']);
        edit.click();expect(input.value).toBe('First note.\n\nMy own line breaks.');
        input.value='';input.dispatchEvent(new Event('input'));syncNotesReader(panel);edit.click();
        expect(add.hidden).toBe(false);expect(document.activeElement).toBe(add);expect(changed).toHaveBeenCalledTimes(2);
    });
    it('expands long personal notes without changing their saved text', () => {
        const { panel, input, more, content, changed }=fixture();
        const tabs=panel.querySelectorAll<HTMLButtonElement>('[data-mode]');
        tabs[0].classList.remove('is-active');tabs[1].classList.add('is-active');
        input.value=longDescription+'\n\nPersonal ending.';syncNotesReader(panel);
        expect(content.textContent).not.toContain('Personal ending.');expect(more.hidden).toBe(false);
        more.click();expect(content.textContent).toContain('Personal ending.');
        expect(content.querySelectorAll('p').length).toBeGreaterThan(2);
        expect(input.value).toBe(longDescription+'\n\nPersonal ending.');expect(changed).not.toHaveBeenCalled();
    });
    it('handles an empty description and treats markup as text', () => {
        const { panel, content, input, more } = fixture('');
        expect(content.textContent).toBe('Add a description'); expect(more.hidden).toBe(true);
        input.value = '<img src=x onerror=alert(1)> A plain description.'; syncNotesReader(panel);
        expect(content.querySelector('img')).toBeNull(); expect(content.textContent).toBe(input.value);
    });
});
