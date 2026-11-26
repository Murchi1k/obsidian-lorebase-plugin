// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindPriority } from '../src/components/PriorityControl';
import { installStatisticsDom } from './helpers/statisticsDom';
beforeEach(() => installStatisticsDom());
afterEach(() => document.body.replaceChildren());
describe('priority editor dropdown', () => {
    it('offers four levels under quick settings and applies only the selected draft value', async () => {
        const root = document.createElement('div'); root.innerHTML = '<aside><section class="lorebase-editmode-quick-settings"></section><section class="next"></section></aside>'; document.body.append(root);
        const changed = vi.fn(); bindPriority(root, undefined, changed);
        const field = root.querySelector<HTMLElement>('.lorebase-priority-control')!;
        expect(field.previousElementSibling?.className).toBe('lorebase-editmode-quick-settings');
        expect(field.querySelector('[role="radiogroup"]')).toBeNull();
        const trigger = field.querySelector<HTMLButtonElement>('button')!;
        trigger.getBoundingClientRect = () => new DOMRect(20, 20, 240, 34);
        expect(trigger.textContent).toBe('Normal'); expect(trigger.getAttribute('aria-label')).toBe('Priority');
        expect(changed).not.toHaveBeenCalled(); trigger.click();
        const options = Array.from(document.querySelectorAll<HTMLElement>('.lorebase-priority-options [role="option"]'));
        expect(options.map(option => option.textContent)).toEqual(['Low', 'Normal', 'High', 'Highest']);
        options[3].click(); await Promise.resolve();
        expect(changed).toHaveBeenCalledExactlyOnceWith('highest'); expect(field.dataset.priority).toBe('highest');
        expect(trigger.textContent).toBe('Highest'); expect(trigger.getAttribute('aria-expanded')).toBe('false');
        bindPriority(root, 'low', changed); expect(root.querySelectorAll('.lorebase-priority-dropdown')).toHaveLength(1);
    });
});
