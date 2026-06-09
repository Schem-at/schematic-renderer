import { describe, it, expect } from "vitest";
import { RenderLoopScheduler, type LoopTimers } from "../renderLoopScheduler";

/**
 * A fake set of timer primitives that records scheduling and lets the test fire
 * the pending frame/timer callback by hand — no real rAF/setTimeout needed.
 */
function makeHarness() {
	let nextId = 1;
	const frames = new Map<number, () => void>();
	const timers = new Map<number, () => void>();
	const calls = { requestFrame: 0, cancelFrame: 0, setTimer: 0, clearTimer: 0 };
	let ticks = 0;

	const api: LoopTimers = {
		requestFrame: (cb) => {
			calls.requestFrame++;
			const id = nextId++;
			frames.set(id, cb);
			return id;
		},
		cancelFrame: (id) => {
			calls.cancelFrame++;
			frames.delete(id);
		},
		setTimer: (cb) => {
			calls.setTimer++;
			const id = nextId++;
			timers.set(id, cb);
			return id;
		},
		clearTimer: (id) => {
			calls.clearTimer++;
			timers.delete(id);
		},
	};

	const sched = new RenderLoopScheduler(api, () => {
		ticks++;
	});

	return {
		sched,
		calls,
		get pendingFrames() {
			return frames.size;
		},
		get pendingTimers() {
			return timers.size;
		},
		get ticks() {
			return ticks;
		},
		fireTimer() {
			const entry = [...timers.entries()][0];
			timers.delete(entry[0]);
			entry[1]();
		},
		// The browser removes a frame from its queue when it fires, then runs the cb.
		fireFrame() {
			const entry = [...frames.entries()][0];
			frames.delete(entry[0]);
			entry[1]();
		},
	};
}

describe("RenderLoopScheduler", () => {
	it("requests exactly one frame; duplicate requests while pending are no-ops", () => {
		const h = makeHarness();
		h.sched.requestFrame();
		expect(h.pendingFrames).toBe(1);
		h.sched.requestFrame();
		expect(h.calls.requestFrame).toBe(1);
	});

	// The regression: after the loop idles into a poll, an external wake (invalidate)
	// must cancel the poll AND arm a frame. The old inline logic left a stale, already-
	// fired frame handle around, so wake() saw "frame still pending" and scheduled
	// nothing — freezing the loop until a direct render.
	it("wake() after an idle poll cancels the poll and arms a frame", () => {
		const h = makeHarness();
		h.sched.beginTick(); // the frame that ran this tick is now spent
		h.sched.requestPoll(1000); // idle backstop
		expect(h.pendingTimers).toBe(1);
		expect(h.pendingFrames).toBe(0);

		h.sched.wake();
		expect(h.pendingTimers).toBe(0); // poll cancelled
		expect(h.pendingFrames).toBe(1); // frame armed
	});

	it("beginTick() clears the spent frame handle so a later wake re-arms", () => {
		const h = makeHarness();
		h.sched.requestFrame(); // frame pending
		h.fireFrame(); // it fires (browser drops it from the queue)…
		h.sched.beginTick(); // …and the loop clears the spent handle on entry
		h.sched.requestPoll(500); // loop decides it's idle → slow poll
		h.sched.wake(); // external invalidate
		expect(h.pendingFrames).toBe(1); // exactly one fresh frame, not a stale leftover
	});

	it("a firing poll hops to a vsync-aligned frame", () => {
		const h = makeHarness();
		h.sched.requestPoll(1000);
		h.fireTimer();
		expect(h.pendingTimers).toBe(0);
		expect(h.pendingFrames).toBe(1);
	});

	it("wake() while a frame is already pending does not double-schedule", () => {
		const h = makeHarness();
		h.sched.requestFrame();
		h.sched.wake();
		expect(h.calls.requestFrame).toBe(1);
	});

	it("stop() cancels a pending frame", () => {
		const h = makeHarness();
		h.sched.requestFrame();
		h.sched.stop();
		expect(h.pendingFrames).toBe(0);
		expect(h.calls.cancelFrame).toBe(1);
	});

	it("stop() cancels a pending idle poll", () => {
		const h = makeHarness();
		h.sched.requestPoll(1000);
		h.sched.stop();
		expect(h.pendingTimers).toBe(0);
		expect(h.calls.clearTimer).toBe(1);
	});
});
