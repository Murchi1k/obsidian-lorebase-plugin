export interface PlayStationProgressPreference {
    isVisible(): boolean;
    setVisible(visible: boolean): void;
    subscribe(listener: (visible: boolean) => void): () => void;
}

/** One preference for all editors in this plugin instance, persisted in plugin settings. */
export function createPlayStationProgressPreference(read: () => boolean, write: (visible: boolean) => void): PlayStationProgressPreference {
    const listeners = new Set<(visible: boolean) => void>();
    return {
        isVisible: read,
        setVisible(visible) {
            write(visible);
            for (const listener of listeners) listener(visible);
        },
        subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
}
