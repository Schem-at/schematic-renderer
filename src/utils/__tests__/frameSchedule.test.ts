import { describe, it, expect } from "vitest";
import { pickFrameSchedule, scheduleDelayMs } from "../renderGate";

describe("frame schedule decision", () => {
	it("uses rAF when there is something to render this tick", () => {
		expect(pickFrameSchedule({ wantsRender: true, texturesAnimating: false })).toBe("raf");
		// wantsRender wins even if textures are animating — we draw now, vsync-aligned.
		expect(pickFrameSchedule({ wantsRender: true, texturesAnimating: true })).toBe("raf");
	});

	it("polls at the animated-texture rate when idle but textures are animating", () => {
		expect(pickFrameSchedule({ wantsRender: false, texturesAnimating: true })).toBe("pollAnimated");
	});

	it("slow-polls (idle backstop) when fully idle", () => {
		expect(pickFrameSchedule({ wantsRender: false, texturesAnimating: false })).toBe("pollIdle");
	});
});

describe("schedule delay", () => {
	it("rAF has no setTimeout delay", () => {
		expect(scheduleDelayMs("raf", { idleFps: 1, animatedPollFps: 20 })).toBe(0);
	});

	it("animated poll derives from animatedPollFps", () => {
		expect(scheduleDelayMs("pollAnimated", { idleFps: 1, animatedPollFps: 20 })).toBe(50);
	});

	it("idle poll derives from idleFps", () => {
		expect(scheduleDelayMs("pollIdle", { idleFps: 2, animatedPollFps: 20 })).toBe(500);
	});

	it("treats a non-positive fps as a 1s backstop (never a busy-loop)", () => {
		expect(scheduleDelayMs("pollIdle", { idleFps: 0, animatedPollFps: 20 })).toBe(1000);
		expect(scheduleDelayMs("pollAnimated", { idleFps: 1, animatedPollFps: 0 })).toBe(1000);
	});
});
