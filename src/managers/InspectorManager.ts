/**
 * InspectorManager
 * 
 * Provides a debug GUI panel using lil-gui for inspecting and tweaking
 * the SchematicRenderer in real-time. This is a first-class citizen of
 * the renderer that can be enabled via options.
 */

import GUI from 'lil-gui';
import * as THREE from 'three';
import type { SchematicRenderer } from '../SchematicRenderer';
import type { DebugOptions } from '../SchematicRendererOptions';

export interface InspectorPanel {
	name: string;
	folder: GUI;
}

export class InspectorManager {
	private renderer: SchematicRenderer;
	private gui: GUI | null = null;
	private options: DebugOptions;
	private panels: Map<string, InspectorPanel> = new Map();
	private isVisible: boolean = true;
	private state: Record<string, any> = {};

	constructor(renderer: SchematicRenderer, options: DebugOptions = {}) {
		this.renderer = renderer;
		this.options = {
			enableInspector: true,
			showOnStartup: true,
			...options
		};

		if (this.options.enableInspector) {
			this.initialize();
		}
	}

	private initialize(): void {
		// Create main GUI
		this.gui = new GUI({
			title: '🔧 Schematic Renderer',
			width: 300
		});

		// Style the GUI container
		if (this.gui.domElement.parentElement) {
			this.gui.domElement.parentElement.style.zIndex = '9999';
		}

		// Initialize state object for two-way binding
		this.initializeState();

		// Add built-in panels
		this.addRendererPanel();
		this.addScenePanel();
		this.addCameraPanel();
		this.addPerformancePanel();
		this.addGPUPanel();

		// Add custom panels if provided
		if (this.options.customPanels) {
			for (const panelConfig of this.options.customPanels) {
				this.addCustomPanel(panelConfig);
			}
		}

		// Handle visibility
		if (!this.options.showOnStartup) {
			this.hide();
		}

		// Add keyboard shortcut to toggle visibility
		this.setupKeyboardShortcut();
	}

	private initializeState(): void {
		const sceneManager = this.renderer.sceneManager;
		const cameraManager = this.renderer.cameraManager;
		const camera = cameraManager.activeCamera.camera as THREE.PerspectiveCamera;

		this.state = {
			// Renderer
			backgroundColor: '#' + (sceneManager.scene.background instanceof THREE.Color
				? sceneManager.scene.background.getHexString()
				: '1a1a2e'),
			gamma: this.renderer.options.gamma ?? 0.5,

			// Scene
			showGrid: this.renderer.options.showGrid ?? false,
			showAxes: this.renderer.options.showAxes ?? false,
			wireframe: false,

			// Camera
			fov: camera.fov ?? 60,
			near: camera.near ?? 0.1,
			far: camera.far ?? 1000,
			autoOrbit: this.renderer.options.enableAutoOrbit ?? false,
			orbitSpeed: this.renderer.options.autoOrbitDuration ?? 10,

			// Performance
			targetFPS: this.renderer.options.targetFPS ?? 60,
			idleFPS: this.renderer.options.idleFPS ?? 1,
			adaptiveFPS: this.renderer.options.enableAdaptiveFPS ?? true,

			// GPU
			gpuCompute: this.renderer.options.gpuComputeOptions?.enabled ?? false,
			meshBuildingMode: this.renderer.options.meshBuildingMode ?? 'incremental',
		};
	}

	private addRendererPanel(): void {
		if (!this.gui) return;

		const folder = this.gui.addFolder('Renderer');

		folder.addColor(this.state, 'backgroundColor')
			.name('Background')
			.onChange((value: string) => {
				this.renderer.sceneManager.scene.background = new THREE.Color(value);
			});

		folder.add(this.state, 'gamma', 0, 2, 0.1)
			.name('Gamma')
			.onChange((value: number) => {
				// Update gamma correction if effect exists
				if (this.renderer.renderManager) {
					(this.renderer.renderManager as any).updateGamma?.(value);
				}
			});

		folder.add({
			screenshot: () => this.takeScreenshot()
		}, 'screenshot').name('📷 Screenshot');

		this.panels.set('renderer', { name: 'Renderer', folder });
	}

	private addScenePanel(): void {
		if (!this.gui) return;

		const folder = this.gui.addFolder('Scene');

		folder.add(this.state, 'showGrid')
			.name('Show Grid')
			.onChange((value: boolean) => {
				this.renderer.options.showGrid = value;
				this.renderer.sceneManager.updateHelpers();
			});

		folder.add(this.state, 'showAxes')
			.name('Show Axes')
			.onChange((value: boolean) => {
				this.renderer.options.showAxes = value;
				this.renderer.sceneManager.updateHelpers();
			});

		folder.add(this.state, 'wireframe')
			.name('Wireframe')
			.onChange((value: boolean) => {
				this.setWireframeMode(value);
			});

		// Scene info
		const infoFolder = folder.addFolder('Info');

		// Update info periodically
		const rendererRef = this.renderer;
		const updateInfo = () => {
			if (rendererRef.renderManager) {
				const info = (rendererRef.renderManager as any).renderer?.info;
				if (info) {
					infoFolder.controllers.forEach(c => c.updateDisplay());
				}
			}
		};

		// Store reference for closure
		const drawCallsObj = {
			get objects() {
				return (rendererRef.renderManager as any)?.renderer?.info?.render?.calls ?? 0;
			}
		};
		infoFolder.add(drawCallsObj, 'objects').name('Draw Calls').disable().listen();

		setInterval(updateInfo, 1000);

		folder.close();
		this.panels.set('scene', { name: 'Scene', folder });
	}

	private addCameraPanel(): void {
		if (!this.gui) return;

		const folder = this.gui.addFolder('Camera');
		const camera = this.renderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;

		folder.add(this.state, 'fov', 10, 120, 1)
			.name('FOV')
			.onChange((value: number) => {
				camera.fov = value;
				camera.updateProjectionMatrix();
			});

		folder.add(this.state, 'near', 0.01, 10, 0.01)
			.name('Near Clip')
			.onChange((value: number) => {
				camera.near = value;
				camera.updateProjectionMatrix();
			});

		folder.add(this.state, 'far', 100, 10000, 100)
			.name('Far Clip')
			.onChange((value: number) => {
				camera.far = value;
				camera.updateProjectionMatrix();
			});

		folder.add(this.state, 'autoOrbit')
			.name('Auto Orbit')
			.onChange((value: boolean) => {
				if (value) {
					this.renderer.cameraManager.startAutoOrbit();
				} else {
					this.renderer.cameraManager.stopAutoOrbit();
				}
			});

		folder.add(this.state, 'orbitSpeed', 1, 60, 1)
			.name('Orbit Duration (s)')
			.onChange((value: number) => {
				this.renderer.cameraManager.setAutoOrbitDuration(value);
			});

		// Camera position display
		const posFolder = folder.addFolder('Position');
		const pos = { x: 0, y: 0, z: 0 };

		const updateCameraPos = () => {
			pos.x = parseFloat(camera.position.x.toFixed(2));
			pos.y = parseFloat(camera.position.y.toFixed(2));
			pos.z = parseFloat(camera.position.z.toFixed(2));
		};

		posFolder.add(pos, 'x').name('X').disable().listen();
		posFolder.add(pos, 'y').name('Y').disable().listen();
		posFolder.add(pos, 'z').name('Z').disable().listen();

		setInterval(updateCameraPos, 100);

		folder.add({
			resetCamera: () => this.renderer.cameraManager.focusOnSchematics()
		}, 'resetCamera').name('🔄 Reset Camera');

		folder.close();
		this.panels.set('camera', { name: 'Camera', folder });
	}

	private addPerformancePanel(): void {
		if (!this.gui) return;

		const folder = this.gui.addFolder('Performance');

		folder.add(this.state, 'targetFPS', 1, 144, 1)
			.name('Target FPS')
			.onChange((value: number) => {
				if (this.renderer.renderManager) {
					(this.renderer.renderManager as any).setTargetFPS?.(value);
				}
			});

		folder.add(this.state, 'idleFPS', 1, 30, 1)
			.name('Idle FPS')
			.onChange((value: number) => {
				if (this.renderer.renderManager) {
					(this.renderer.renderManager as any).setIdleFPS?.(value);
				}
			});

		folder.add(this.state, 'adaptiveFPS')
			.name('Adaptive FPS')
			.onChange((value: boolean) => {
				if (this.renderer.renderManager) {
					(this.renderer.renderManager as any).setAdaptiveFPS?.(value);
				}
			});

		// Live stats
		const statsFolder = folder.addFolder('Stats');
		const stats = { fps: 0, ms: 0, memory: 0 };
		const rendererRef = this.renderer;

		const updateStats = () => {
			if (rendererRef.renderManager) {
				const rm = rendererRef.renderManager as any;
				stats.fps = rm.currentFPS ?? 0;
				stats.ms = rm.frameTime ?? 0;
			}
			if ((performance as any).memory) {
				stats.memory = Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024);
			}
		};

		statsFolder.add(stats, 'fps').name('FPS').disable().listen();
		statsFolder.add(stats, 'ms').name('Frame (ms)').disable().listen();
		statsFolder.add(stats, 'memory').name('Memory (MB)').disable().listen();

		setInterval(updateStats, 500);

		folder.close();
		this.panels.set('performance', { name: 'Performance', folder });
	}

	private addGPUPanel(): void {
		if (!this.gui) return;

		const folder = this.gui.addFolder('GPU / Mesh Building');

		folder.add(this.state, 'gpuCompute')
			.name('GPU Compute (Experimental)')
			.onChange((value: boolean) => {
				console.log(`[Inspector] GPU Compute: ${value ? 'enabled' : 'disabled'}`);
				// Note: This requires rebuilding schematics to take effect
				if (this.renderer.options.gpuComputeOptions) {
					this.renderer.options.gpuComputeOptions.enabled = value;
				}
			});

		folder.add(this.state, 'meshBuildingMode', ['immediate', 'incremental', 'instanced'])
			.name('Build Mode')
			.onChange((value: string) => {
				console.log(`[Inspector] Mesh building mode: ${value}`);
			});

		// GPU info
		const infoFolder = folder.addFolder('GPU Info');
		const gpuInfo = {
			renderer: 'Unknown',
			vendor: 'Unknown',
			webgpu: 'Checking...'
		};

		// Get WebGL info
		try {
			const rm = this.renderer.renderManager as any;
			if (rm?.renderer) {
				const gl = rm.renderer.getContext();
				const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
				if (debugInfo) {
					gpuInfo.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
					gpuInfo.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
				}
			}
		} catch (e) {
			// Ignore
		}

		// Check WebGPU
		if (navigator.gpu) {
			navigator.gpu.requestAdapter().then(adapter => {
				gpuInfo.webgpu = adapter ? '✅ Available' : '❌ No adapter';
			}).catch(() => {
				gpuInfo.webgpu = '❌ Not supported';
			});
		} else {
			gpuInfo.webgpu = '❌ Not supported';
		}

		infoFolder.add(gpuInfo, 'renderer').name('GPU').disable();
		infoFolder.add(gpuInfo, 'vendor').name('Vendor').disable();
		infoFolder.add(gpuInfo, 'webgpu').name('WebGPU').disable();

		folder.close();
		this.panels.set('gpu', { name: 'GPU', folder });
	}

	/**
	 * Add a custom panel with controls
	 */
	private addCustomPanel(config: NonNullable<DebugOptions['customPanels']>[number]): void {
		if (!this.gui) return;

		const folder = this.gui.addFolder(config.name);

		for (const control of config.controls) {
			const controlState: Record<string, any> = {};
			controlState[control.name] = control.value;
			const onChange = control.onChange || (() => { });

			switch (control.type) {
				case 'number':
					folder.add(controlState, control.name, control.min, control.max, control.step)
						.onChange(onChange);
					break;
				case 'boolean':
					folder.add(controlState, control.name)
						.onChange(onChange);
					break;
				case 'color':
					folder.addColor(controlState, control.name)
						.onChange(onChange);
					break;
				case 'button':
					folder.add({ [control.name]: onChange }, control.name);
					break;
				case 'select':
					if (control.options) {
						folder.add(controlState, control.name, control.options)
							.onChange(onChange);
					}
					break;
			}
		}

		this.panels.set(config.name.toLowerCase(), { name: config.name, folder });
	}

	/**
	 * Add a folder to the GUI programmatically
	 */
	public addFolder(name: string): GUI | null {
		if (!this.gui) return null;
		const folder = this.gui.addFolder(name);
		this.panels.set(name.toLowerCase(), { name, folder });
		return folder;
	}

	/**
	 * Get a folder by name
	 */
	public getFolder(name: string): GUI | null {
		return this.panels.get(name.toLowerCase())?.folder ?? null;
	}

	/**
	 * Get the main GUI instance
	 */
	public getGUI(): GUI | null {
		return this.gui;
	}

	private setWireframeMode(enabled: boolean): void {
		this.renderer.sceneManager.scene.traverse((obj) => {
			if (obj instanceof THREE.Mesh) {
				const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
				materials.forEach(mat => {
					if (mat && 'wireframe' in mat) {
						(mat as THREE.MeshBasicMaterial).wireframe = enabled;
					}
				});
			}
		});
	}

	private takeScreenshot(): void {
		if (!this.renderer.renderManager) return;

		const rm = this.renderer.renderManager as any;
		if (rm.renderer) {
			const camera = this.renderer.cameraManager.activeCamera.camera;
			rm.renderer.render(this.renderer.sceneManager.scene, camera);
			const dataUrl = rm.renderer.domElement.toDataURL('image/png');

			const link = document.createElement('a');
			link.download = `schematic-${Date.now()}.png`;
			link.href = dataUrl;
			link.click();
		}
	}

	private setupKeyboardShortcut(): void {
		document.addEventListener('keydown', (e) => {
			// Toggle GUI with backtick/tilde key
			if (e.key === '`' || e.key === '~') {
				this.toggle();
			}
		});
	}

	/**
	 * Show the inspector GUI
	 */
	public show(): void {
		if (this.gui) {
			this.gui.show();
			this.isVisible = true;
		}
	}

	/**
	 * Hide the inspector GUI
	 */
	public hide(): void {
		if (this.gui) {
			this.gui.hide();
			this.isVisible = false;
		}
	}

	/**
	 * Toggle the inspector GUI visibility
	 */
	public toggle(): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	/**
	 * Check if inspector is visible
	 */
	public get visible(): boolean {
		return this.isVisible;
	}

	/**
	 * Dispose of the inspector
	 */
	public dispose(): void {
		if (this.gui) {
			this.gui.destroy();
			this.gui = null;
		}
		this.panels.clear();
	}
}
