import { ImGui, ImGuiImplWeb } from "@mori2003/jsimgui";
import { SchematicRenderer } from "../SchematicRenderer";

export class ImGuiManager {
	private renderer: SchematicRenderer;
	private initialized: boolean = false;
	private windows: Map<string, () => void> = new Map();

	constructor(renderer: SchematicRenderer) {
		this.renderer = renderer;
	}

	public async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			await ImGuiImplWeb.Init({
				canvas: this.renderer.canvas,
				enableDemos: false,
			});
			this.initialized = true;
			console.log("[ImGuiManager] Initialized");

			// Apply default style
			ImGui.StyleColorsDark();

			// Enable docking
			const io = ImGui.GetIO();
			io.ConfigFlags |= ImGui.ConfigFlags.DockingEnable;

		} catch (error) {
			console.error("[ImGuiManager] Failed to initialize:", error);
		}
	}

	public get isInitialized(): boolean {
		return this.initialized;
	}

	public registerWindow(name: string, callback: () => void): void {
		this.windows.set(name, callback);
	}

	public unregisterWindow(name: string): void {
		this.windows.delete(name);
	}

	public render(): void {
		if (!this.initialized) return;

		ImGuiImplWeb.BeginRender();

		for (const [name, callback] of this.windows) {
			ImGui.Begin(name);
			callback();
			ImGui.End();
		}

		ImGuiImplWeb.EndRender();
	}

	public dispose(): void {
		this.initialized = false;
		this.windows.clear();
	}
}

