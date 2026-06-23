import { AbstractInputSuggest, App, TFolder } from 'obsidian';
import { filterFolders } from './folderSuggestUtils';

/**
 * Text-input autocomplete over the vault's folders. Unlike a fixed dropdown,
 * the bound input still accepts arbitrary (including not-yet-created) paths;
 * the suggestions are a convenience, not a constraint.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    constructor(
        private readonly appRef: App,
        inputElement: HTMLInputElement,
        private readonly onPick: (path: string) => void | Promise<void>,
    ) {
        super(appRef, inputElement);

        this.onSelect((folder) => {
            const value = folder.path;
            this.setValue(value);
            this.close();
            void this.onPick(value);
        });
    }

    protected getSuggestions(query: string): TFolder[] {
        const folders = this.appRef.vault
            .getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder);
        return filterFolders(folders, query);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path || '/');
    }
}
