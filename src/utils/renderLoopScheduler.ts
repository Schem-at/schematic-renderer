/**
 * Schedules the render loop's next tick, owning the (frame | poll) handles so the
 * loop can re-arm correctly after it idles.
 *
 * The bug this fixes: the loop idles by scheduling a slow `setTimeout` poll instead
 * of a `requestAnimationFrame`. The old inline logic never cleared the *frame*
 * handle when a frame fired, so during an idle poll the handle still held a stale,
 * already-fired rAF id. `invalidate()` checked `frameId === null` to decide whether
 * to re-arm, saw the stale non-null id, and scheduled nothing — leaving the loop
 * dead (e.g. a mouse drag begun after the scene settled looked frozen until a direct
 * render). `beginTick()` clears that spent handle at the start of every tick, so the
 * pending-state is always accurate and `wake()` can re-arm.
 *
 * Invariant: at most one of (frame, poll) is pending at any time.
 *
 * Timer primitives are injected so this is unit-testable without a real rAF clock.
 */
export interface LoopTimers {
	requestFrame: (cb: () => void) => number;
	cancelFrame: (id: number) => void;
	setTimer: (cb: () => void, ms: number) => number;
	clearTimer: (id: number) => void;
}

export class RenderLoopScheduler {
	private frameId: number | null = null;
	private pollId: number | null = null;

	constructor(
		private readonly timers: LoopTimers,
		private readonly tick: () => void
	) {}

	/**
	 * Call at the very start of each tick: the frame that invoked it has fired, so
	 * its handle is spent. Clearing it keeps the pending-state accurate for wake().
	 */
	beginTick(): void {
		this.frameId = null;
	}

	/** Queue the next tick as a vsync-aligned frame. No-op if a tick is already queued. */
	requestFrame(): void {
		if (this.frameId !== null || this.pollId !== null) return;
		this.frameId = this.timers.requestFrame(this.tick);
	}

	/**
	 * Queue the next tick as a slow idle poll: wait `delayMs`, then run a vsync-aligned
	 * frame. No-op if a tick is already queued.
	 */
	requestPoll(delayMs: number): void {
		if (this.frameId !== null || this.pollId !== null) return;
		this.pollId = this.timers.setTimer(() => {
			this.pollId = null;
			this.frameId = this.timers.requestFrame(this.tick);
		}, delayMs);
	}

	/** Wake immediately: drop a pending idle poll and ensure a frame is queued. */
	wake(): void {
		if (this.pollId !== null) {
			this.timers.clearTimer(this.pollId);
			this.pollId = null;
		}
		if (this.frameId === null) {
			this.frameId = this.timers.requestFrame(this.tick);
		}
	}

	/** Cancel any pending frame/poll (suspend, dispose). */
	stop(): void {
		if (this.frameId !== null) {
			this.timers.cancelFrame(this.frameId);
			this.frameId = null;
		}
		if (this.pollId !== null) {
			this.timers.clearTimer(this.pollId);
			this.pollId = null;
		}
	}
}
