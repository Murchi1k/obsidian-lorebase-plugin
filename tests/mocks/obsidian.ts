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

export class TFolder {
    path: string;
    name: string;

    constructor(path: string = '') {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
    }
}

export class Modal {
    app: App;
    contentEl: HTMLElement;
    modalEl: HTMLElement;

    constructor(app: App) {
        this.app = app;
        this.contentEl = {} as HTMLElement;
        this.modalEl = {} as HTMLElement;
    }

    open(): void {
        return;
    }

    close(): void {
        return;
    }
}

export class Notice {
    constructor(_message: string, _timeout?: number) {
        return;
    }
}

type RequestUrlOptions = string | { url: string; method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer };
type RequestUrlResponse = { json: unknown; text?: string; arrayBuffer: ArrayBuffer; headers: Record<string, string>; status: number };
type RequestUrlMock = (options: RequestUrlOptions) => Promise<Partial<RequestUrlResponse>> | Partial<RequestUrlResponse>;

let requestUrlMock: RequestUrlMock | null = null;

export function __setRequestUrlMock(mock: RequestUrlMock | null): void {
    requestUrlMock = mock;
}

export async function requestUrl(options: RequestUrlOptions): Promise<RequestUrlResponse> {
    if (!requestUrlMock) {
        throw new Error('requestUrl mock is not configured');
    }
    const response = await requestUrlMock(options);
    const result = {
        arrayBuffer: response.arrayBuffer ?? new ArrayBuffer(0),
        headers: response.headers ?? {},
        status: response.status ?? 200,
    } as RequestUrlResponse;
    for (const key of ['json', 'text'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(response, key);
        if (descriptor) {
            Object.defineProperty(result, key, descriptor);
        } else {
            result[key] = response[key] as never;
        }
    }
    return result;
}

export function setIcon(): void {
    return;
}
