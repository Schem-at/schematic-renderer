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
