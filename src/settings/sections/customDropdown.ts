import { Setting } from 'obsidian';
import {
    createLorebaseDropdown,
    LorebaseDropdownHandle,
    LorebaseDropdownOption,
} from '../../components/LorebaseDropdown';

export type { LorebaseDropdownHandle, LorebaseDropdownOption };

export function addLorebaseDropdown<T extends string>(
    setting: Setting,
    options: LorebaseDropdownOption<T>[],
    value: T,
    onChange: (value: T) => void | Promise<void>
): LorebaseDropdownHandle<T> {
    const root = setting.controlEl.createDiv();
    return createLorebaseDropdown(root, options, value, onChange);
}
