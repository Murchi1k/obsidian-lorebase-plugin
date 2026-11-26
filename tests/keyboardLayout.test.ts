import { describe, expect, it, vi } from 'vitest';
import { suggestKeyboardLayout } from '../src/utils/keyboardLayout';

const suggest = (query: string, titles: string[], language = 'ru') => suggestKeyboardLayout(query,
    candidate => titles.some(title => title.toLowerCase().includes(candidate.toLowerCase())), language);

describe('keyboard layout suggestions', () => {
    it('corrects physical keys in both directions, preserving case, numbers and spaces', () => {
        expect(suggest('цшесрук', ['The Witcher 3'])).toBe('witcher');
        expect(suggest('ЦШЕСРУК 3', ['The Witcher 3'])).toBe('WITCHER 3');
        expect(suggest('The цшесрук 3', ['The Witcher 3'])).toBe('The witcher 3');
        expect(suggest('l.yf', ['Дюна'])).toBe('дюна');
    });

    it('supports Ukrainian keys and prefers the interface language for ambiguous layouts', () => {
        expect(suggest('іефдлук', ['Stalker'])).toBe('stalker');
        expect(suggest('stalker', ['іефдлук', 'ыефдлук'], 'uk')).toBe('іефдлук');
        expect(suggest('stalker', ['іефдлук', 'ыефдлук'], 'ru')).toBe('ыефдлук');
        expect(suggest('stalker', ['іефдлук'], 'en')).toBe('іефдлук');
    });

    it('keeps already matching input and never invents corrections without a stored match', () => {
        expect(suggest('цшесрук', ['цшесрук', 'Witcher'])).toBeNull();
        expect(suggest('цшесрук', ['Cyberpunk'])).toBeNull();
        expect(suggest('Witcher', ['Witcher'])).toBeNull();
    });

    it('ignores empty, very short, numeric and URL queries', () => {
        for (const query of ['', ' ', 'ц', 'цу', '2026', 'https://цшесрук.example', 'www.цшесрук.example']) {
            const match = vi.fn(() => true);
            expect(suggestKeyboardLayout(query, match)).toBeNull();
            expect(match).not.toHaveBeenCalled();
        }
    });
});
