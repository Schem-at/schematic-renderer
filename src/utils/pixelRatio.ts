/**
 * The browser's devicePixelRatio, clamped to a sane maximum.
 *
 * High-DPR mobile screens report a devicePixelRatio of 3–4. Used unclamped, that
 * sizes every WebGL framebuffer (the canvas backing store, the renderer's drawing
 * buffer, and every EffectComposer render target) to 3–4× the CSS-pixel dimensions
 * — i.e. 9–16× the pixel area, and the same multiple in GPU memory and fill cost.
 * On memory-limited mobile GPUs this exhausts VRAM and the browser drops the WebGL
 * context (`webglcontextlost`). The renderer restores it, runs out again, and after
 * a few rounds the browser kills the page ("a problem repeatedly occurred" / a crash
 * with an opaque error code).
 *
 * Capping the ratio at 2 keeps rendering visually crisp (beyond ~2 the extra detail
 * is imperceptible on a phone) while bounding memory to a safe envelope.
 */
export function getClampedPixelRatio(max = 2): number {
	const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
	return Math.min(dpr, Math.max(1, max));
}
