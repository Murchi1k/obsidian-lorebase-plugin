export class App {}

export class TFile {
    path: string;
    basename: string;
    name: string;
    extension: string;
    stat: { ctime: number; mtime: number };

    constructor(path: string = '', basename: string = '') {
        this.path = path;
        this.basename = basename;
        this.name = basename ? `${basename}.md` : '';
        this.extension = 'md';
        this.stat = { ctime: Date.now(), mtime: Date.now() };
    }
}
