// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { reviewNoteImportInline, type NoteImportReviewOptions } from '../src/modals/NoteImportReviewModal';
import { installStatisticsDom } from './helpers/statisticsDom';

const options: NoteImportReviewOptions = {
    writeMode: 'copy',
    language: 'en',
    items: [{
        id: 'Books/Example.md',
        title: 'Example',
        sourcePath: 'Books/Example.md',
        targetPath: 'LOREBASE/Books/Example.md',
        poster: null,
        renamed: [],
        kept: [],
        removed: [],
        warnings: [],
        canImport: true,
        nextFrontmatter: {},
        targetMedia: 'books',
    }],
};

describe('inline note import review', () => {
    beforeEach(() => {
        installStatisticsDom();
        HTMLElement.prototype.setText = function (text: string): void { this.textContent = text; };
        HTMLElement.prototype.setAttr = function (name, value): void { this.setAttribute(name, String(value)); };
        document.body.replaceChildren();
    });

    it('returns the selected notes when the user confirms', async () => {
        const host = document.body.createDiv();
        const pending = reviewNoteImportInline(host, options, new AbortController().signal);
        const apply = host.querySelector<HTMLButtonElement>('.lorebase-nir-apply')!;
        expect(apply.disabled).toBe(true);
        host.querySelector<HTMLElement>('.lorebase-nir-row')!.click();
        expect(apply.disabled).toBe(false);
        apply.click();

        await expect(pending).resolves.toMatchObject({
            selectedIds: new Set(['Books/Example.md']),
            targetMediaById: { 'Books/Example.md': 'books' },
        });
        expect(host.childElementCount).toBe(0);
    });

    it('discards the review when the user leaves the preview', async () => {
        const host = document.body.createDiv();
        const controller = new AbortController();
        const pending = reviewNoteImportInline(host, options, controller.signal);
        host.querySelector<HTMLElement>('.lorebase-nir-row')!.click();
        controller.abort();

        await expect(pending).resolves.toBeNull();
        expect(host.childElementCount).toBe(0);
        await expect(reviewNoteImportInline(host, options, controller.signal)).resolves.toBeNull();
    });
});
