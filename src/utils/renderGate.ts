/**
 * Pure decision helper for on-demand rendering.
 *
 * A frame should be rendered when the scene is dirty (`needsRender`) or while
 * something is continuously animating (`continuous`, e.g. animated textures,
 * auto-orbit, camera-path tweens, recording, simulation). Kept dependency-free
 * so it is trivially unit-testable without a WebGL context.
 */
export function shouldRenderFrame(state: { needsRender: boolean; continuous: boolean }): boolean {
	return state.needsRender || state.continuous;
}

/**
 * How to schedule the NEXT animate() tick.
 * - `raf`: something needs drawing now → vsync-aligned `requestAnimationFrame`.
 * - `pollAnimated`: nothing to draw, but animated textures are active → poll at a
 *    modest rate via `setTimeout` so we catch the next frame-flip without pinning
 *    the loop (and the whole browser frame pipeline) to the display refresh.
 * - `pollIdle`: fully idle → slow backstop poll via `setTimeout` (`idleFPS`). The
 *    real wake-up comes from `invalidate()`; this poll just catches direct camera
 *    mutations that bypass the controls `change` event.
 */
export type FrameSchedule = "raf" | "pollAnimated" | "pollIdle";

export function pickFrameSchedule(state: {
	wantsRender: boolean;
	texturesAnimating: boolean;
}): FrameSchedule {
	if (state.wantsRender) return "raf";
	if (state.texturesAnimating) return "pollAnimated";
	return "pollIdle";
}

/**
 * `setTimeout` delay (ms) for a poll schedule. `raf` has no delay. A non-positive
 * fps falls back to a 1s backstop so a misconfigured rate can never busy-loop.
 */
export function scheduleDelayMs(
	schedule: FrameSchedule,
	opts: { idleFps: number; animatedPollFps: number }
): number {
	if (schedule === "raf") return 0;
	const fps = schedule === "pollAnimated" ? opts.animatedPollFps : opts.idleFps;
	return fps > 0 ? 1000 / fps : 1000;
}
