import { AbstractInputSuggest, App, TFolder } from 'obsidian';
import { filterFolders } from './folderSuggestUtils';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private appRef: App;
    private inputEl: HTMLInputElement;
    private onSelectPath: (path: string) => void;

    constructor(app: App, inputEl: HTMLInputElement, onSelectPath: (path: string) => void) {
        super(app, inputEl);
        this.appRef = app;
        this.inputEl = inputEl;
        this.onSelectPath = onSelectPath;
    }

    getSuggestions(query: string): TFolder[] {
        const folders = this.appRef.vault.getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder);
        return filterFolders(folders, query);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TFolder): void {
        this.inputEl.value = folder.path;
        this.onSelectPath(folder.path);
        this.close();
    }
}
