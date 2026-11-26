export interface MapView { x: number; y: number; scale: number }
export function boundedMapView(view: MapView): MapView {
    const scale = Math.max(1, Math.min(6, view.scale));
    return { scale, x: Math.max(1000 * (1 - scale), Math.min(0, view.x)), y: Math.max(470 * (1 - scale), Math.min(0, view.y)) };
}
export function zoomMap(view: MapView, factor: number, x = 500, y = 235): MapView {
    const scale = Math.max(1, Math.min(6, view.scale * factor)), ratio = scale / view.scale;
    return boundedMapView({ scale, x: x + (view.x - x) * ratio, y: y + (view.y - y) * ratio });
}
