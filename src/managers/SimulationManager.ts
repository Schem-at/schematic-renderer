// SimulationManager.ts
import { EventEmitter } from "events";
import { SimulationLogger } from "../utils/SimulationLogger";
// @ts-ignore
import type { SchematicWrapper, MchprsWorldWrapper, SimulationOptionsWrapper } from "nucleation";

/**
 * Simulation synchronization modes
 * - 'synced': Every tick syncs to schematic (visual updates, slower)
 * - 'headless': No automatic syncing (fastest, manual sync when needed)
 * - 'io-only': Only syncs IO positions (good middle ground)
 */
export type SyncMode = 'synced' | 'headless' | 'io-only';

/**
 * Options for initializing a simulation
 */
export interface SimulationConfig {
	/**
	 * Synchronization mode
	 * @default 'synced'
	 */
	syncMode?: SyncMode;

	/**
	 * Optimize compilation (exclude non-IO wires from graph)
	 * Note: Must be false for custom IO power propagation to work!
	 * @default false
	 */
	optimize?: boolean;

	/**
	 * Custom IO positions for power injection/monitoring
	 * @default []
	 */
	customIo?: Array<{ x: number; y: number; z: number }>;

	/**
	 * Tick speed in ticks per second for auto-tick mode
	 * @default 20
	 */
	tickSpeed?: number;
}

export interface SimulationState {
	isRunning: boolean;
	tickCount: number;
	autoTickEnabled: boolean;
	tickSpeed: number;
	syncMode: SyncMode;
	customIoPositions: Array<{ x: number; y: number; z: number }>;
}

export interface CustomIoState {
	x: number;
	y: number;
	z: number;
	power: number;
	tick: number;
}

export type CustomIoCallback = (state: CustomIoState) => void;

export interface BlockStateChange {
	position: [number, number, number];
	blockName: string;
	oldState?: Record<string, string>;
	newState?: Record<string, string>;
}

export class SimulationManager {
	private eventEmitter: EventEmitter;
	private simulationWorld: MchprsWorldWrapper | null = null;
	private schematic: SchematicWrapper | null = null;
	private state: SimulationState = {
		isRunning: false,
		tickCount: 0,
		autoTickEnabled: false,
		tickSpeed: 20,
		syncMode: 'synced',
		customIoPositions: [],
	};
	private autoTickInterval: NodeJS.Timeout | null = null;
	private customIoCallbacks: Map<string, CustomIoCallback[]> = new Map();

	constructor(eventEmitter: EventEmitter) {
		this.eventEmitter = eventEmitter;
	}

	/**
	 * Initialize simulation for a schematic
	 * 
	 * @example
	 * // Visual mode with custom IO
	 * await sim.initializeSimulation(schematic, {
	 *   syncMode: 'synced',
	 *   optimize: false,
	 *   customIo: [{ x: 0, y: 1, z: 0 }]
	 * });
	 * 
	 * @example
	 * // Performance mode - manual sync
	 * await sim.initializeSimulation(schematic, {
	 *   syncMode: 'headless',
	 *   optimize: true
	 * });
	 * 
	 * @example
	 * // IO-only mode - best of both worlds
	 * await sim.initializeSimulation(schematic, {
	 *   syncMode: 'io-only',
	 *   optimize: false,
	 *   customIo: [{ x: 0, y: 1, z: 0 }, { x: 4, y: 1, z: 1 }]
	 * });
	 */
	async initializeSimulation(
		schematic: SchematicWrapper,
		config?: SimulationConfig
	): Promise<boolean> {
		try {
			const {
				syncMode = 'synced',
				optimize = false,
				customIo = [],
				tickSpeed = 20
			} = config || {};

			SimulationLogger.info(`Initializing simulation [mode=${syncMode}, optimize=${optimize}, customIo=${customIo.length}]`);
			
			// Store config
			this.state.syncMode = syncMode;
			this.state.tickSpeed = tickSpeed;
			this.state.customIoPositions = customIo;
			
			// Check schematic dimensions
			const dimensions = schematic.get_dimensions();
			SimulationLogger.info(`Schematic dimensions: [${dimensions[0]}, ${dimensions[1]}, ${dimensions[2]}]`);
			
			// Create simulation world with options
			SimulationLogger.info("Creating MCHPRS simulation world...");
			
			// Import nucleation wasm module
			const { SimulationOptionsWrapper } = await import("nucleation");
			const simOptions = new SimulationOptionsWrapper();
			
			// Set optimization flag
			simOptions.optimize = optimize;
			
			// Set IO-only mode (only affects flush, not compilation)
			simOptions.io_only = syncMode === 'io-only';
			
			// Add custom IO positions
			if (customIo.length > 0) {
				SimulationLogger.info(`Registering ${customIo.length} custom IO positions...`);
				for (const pos of customIo) {
					simOptions.addCustomIo(pos.x, pos.y, pos.z);
				}
			}
			
			// Create simulation world
			this.simulationWorld = schematic.create_simulation_world_with_options(simOptions);
			this.schematic = schematic;
			this.state.isRunning = true;
			this.state.tickCount = 0;
			
			SimulationLogger.success("✓ Simulation initialized successfully");
			
			this.eventEmitter.emit("simulationInitialized", {
				syncMode,
				optimize,
				customIoCount: customIo.length,
			});
			
			// Emit custom IO positions changed event for highlights
			if (customIo.length > 0) {
				console.log(`[SimulationManager] Emitting customIoPositionsChanged event`);
				this.eventEmitter.emit("customIoPositionsChanged", {
					positions: this.state.customIoPositions,
				});
			}
			
			return true;
		} catch (error) {
			SimulationLogger.error("Failed to initialize simulation:", error);
			return false;
		}
	}

	/**
	 * Tick the simulation forward
	 * 
	 * @param numTicks - Number of ticks to advance
	 * @param syncOverride - Override the default sync behavior:
	 *   - 'auto': Use configured syncMode
	 *   - 'force': Force sync regardless of mode
	 *   - 'none': Skip sync regardless of mode
	 * 
	 * @example
	 * // Normal tick with auto-sync based on mode
	 * sim.tick(1);
	 * 
	 * @example
	 * // Run 100 ticks in headless mode, then force sync
	 * sim.tick(100, 'none');
	 * sim.tick(0, 'force'); // Just sync, no ticks
	 * 
	 * @example
	 * // Run 10 ticks and force sync even in headless mode
	 * sim.tick(10, 'force');
	 */
	tick(numTicks: number = 1, syncOverride: 'auto' | 'force' | 'none' = 'auto'): void {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return;
		}

		try {
			// Advance simulation
			if (numTicks > 0) {
				this.simulationWorld.tick(numTicks);
				this.simulationWorld.flush();
				this.state.tickCount += numTicks;
				SimulationLogger.tick(this.state.tickCount, numTicks);
			}

			// Check for custom IO state changes and trigger callbacks
			this.checkCustomIoChanges();

			// Determine if we should sync
			let shouldSync = false;
			if (syncOverride === 'force') {
				shouldSync = true;
			} else if (syncOverride === 'none') {
				shouldSync = false;
			} else {
				// Auto mode - use configured syncMode
				shouldSync = this.state.syncMode === 'synced';
				// io-only mode syncs automatically via flush() with io_only flag
			}

			// Sync to schematic for visual updates
			if (shouldSync) {
				this.simulationWorld.sync_to_schematic();
			}

			this.eventEmitter.emit("simulationTicked", {
				tickCount: this.state.tickCount,
				numTicks,
				synced: shouldSync,
			});
		} catch (error) {
			SimulationLogger.error("Failed to tick simulation:", error);
		}
	}

	/**
	 * Manually sync simulation state to schematic
	 * Useful in headless mode to periodically update visuals
	 * 
	 * @returns The updated schematic, or null if sync failed
	 * 
	 * @example
	 * // Run 1000 ticks headless, then sync once
	 * for (let i = 0; i < 1000; i++) {
	 *   sim.tick(1, 'none');
	 * }
	 * const updated = sim.syncToSchematic();
	 */
	syncToSchematic(): SchematicWrapper | null {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return null;
		}

		try {
			SimulationLogger.info("Syncing simulation state back to schematic...");
			
			// Flush Redpiler state to world blocks
			this.simulationWorld.flush();
			
			// Sync to schematic
			this.simulationWorld.sync_to_schematic();
			
			// Get updated schematic
			const updatedSchematic = this.simulationWorld.get_schematic();
			
			// Debug custom IO blocks if present
			if (this.state.customIoPositions.length > 0) {
				console.log("[SimulationManager] DEBUG: Checking custom IO blocks after sync:");
				this.state.customIoPositions.forEach(pos => {
					const blockString = updatedSchematic.get_block_string(pos.x, pos.y, pos.z);
					const signalStrength = this.simulationWorld!.getSignalStrength(pos.x, pos.y, pos.z);
					console.log(`  [${pos.x},${pos.y},${pos.z}] signal=${signalStrength}, block="${blockString}"`);
				});
			}
			
			SimulationLogger.sync();

			this.eventEmitter.emit("simulationSynced", {
				tickCount: this.state.tickCount,
				updatedSchematic,
			});

			return updatedSchematic;
		} catch (error) {
			SimulationLogger.error("Failed to sync simulation:", error);
			return null;
		}
	}

	/**
	 * Change the synchronization mode at runtime
	 * 
	 * @example
	 * // Start in synced mode for debugging
	 * sim.setSyncMode('synced');
	 * sim.tick(10);
	 * 
	 * // Switch to headless for performance
	 * sim.setSyncMode('headless');
	 * sim.tick(1000);
	 * 
	 * // Manually sync to see results
	 * sim.syncToSchematic();
	 */
	setSyncMode(mode: SyncMode): void {
		this.state.syncMode = mode;
		SimulationLogger.info(`Sync mode changed to: ${mode}`);
		this.eventEmitter.emit("syncModeChanged", { syncMode: mode });
	}

	/**
	 * Get current simulation state
	 */
	getState(): SimulationState {
		return { ...this.state };
	}

	/**
	 * Check if simulation is active
	 */
	isSimulationActive(): boolean {
		return this.state.isRunning && this.simulationWorld !== null;
	}

	// ============================================================================
	// CUSTOM IO API
	// ============================================================================

	/**
	 * Set signal strength at a custom IO position
	 * 
	 * @example
	 * // Inject power into input wire
	 * sim.setSignalStrength(0, 1, 0, 15); // Full power
	 * sim.tick(5); // Propagate
	 */
	setSignalStrength(x: number, y: number, z: number, strength: number): boolean {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return false;
		}

		try {
			SimulationLogger.info(`Set signal strength at (${x},${y},${z}) to ${strength}`);
			this.simulationWorld.setSignalStrength(x, y, z, strength);
			
			// Check for custom IO state changes immediately
			this.checkCustomIoChanges();
			
			return true;
		} catch (error) {
			SimulationLogger.error("Failed to set signal strength:", error);
			return false;
		}
	}

	/**
	 * Get signal strength at a custom IO position
	 * 
	 * @example
	 * // Read power from output wire
	 * const power = sim.getSignalStrength(4, 1, 1);
	 * console.log(`Output power: ${power}`);
	 */
	getSignalStrength(x: number, y: number, z: number): number {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return 0;
		}

		try {
			return this.simulationWorld.getSignalStrength(x, y, z);
		} catch (error) {
			SimulationLogger.error("Failed to get signal strength:", error);
			return 0;
		}
	}

	/**
	 * Add a custom IO position at runtime
	 */
	addCustomIoPosition(x: number, y: number, z: number): void {
		if (!this.state.customIoPositions.some(p => p.x === x && p.y === y && p.z === z)) {
			this.state.customIoPositions.push({ x, y, z });
			console.log(`[SimulationManager] Added custom IO position: (${x},${y},${z})`);
			this.eventEmitter.emit("customIoPositionsChanged", {
				positions: this.state.customIoPositions,
			});
		} else {
			console.log(`[SimulationManager] Position (${x},${y},${z}) already exists`);
		}
	}

	/**
	 * Remove a custom IO position
	 */
	removeCustomIoPosition(x: number, y: number, z: number): void {
		const index = this.state.customIoPositions.findIndex(
			p => p.x === x && p.y === y && p.z === z
		);
		if (index !== -1) {
			this.state.customIoPositions.splice(index, 1);
			this.eventEmitter.emit("customIoPositionsChanged", {
				positions: this.state.customIoPositions,
			});
		}
	}

	/**
	 * Clear all custom IO positions
	 */
	clearCustomIoPositions(): void {
		this.state.customIoPositions = [];
		this.eventEmitter.emit("customIoPositionsChanged", {
			positions: [],
		});
	}

	/**
	 * Get all custom IO positions
	 */
	getCustomIoPositions(): Array<{ x: number; y: number; z: number }> {
		return [...this.state.customIoPositions];
	}

	/**
	 * Register a callback for custom IO state changes
	 * @param x X coordinate
	 * @param y Y coordinate
	 * @param z Z coordinate
	 * @param callback Function to call when IO state changes
	 * @returns Unsubscribe function
	 */
	onCustomIoChange(x: number, y: number, z: number, callback: CustomIoCallback): () => void {
		const key = `${x},${y},${z}`;
		if (!this.customIoCallbacks.has(key)) {
			this.customIoCallbacks.set(key, []);
		}
		this.customIoCallbacks.get(key)!.push(callback);

		// Return unsubscribe function
		return () => {
			const callbacks = this.customIoCallbacks.get(key);
			if (callbacks) {
				const index = callbacks.indexOf(callback);
				if (index !== -1) {
					callbacks.splice(index, 1);
				}
			}
		};
	}

	/**
	 * Check for custom IO state changes and trigger callbacks
	 * Uses nucleation's built-in callback system for zero-overhead change detection
	 * Call this after tick() or setSignalStrength()
	 */
	private checkCustomIoChanges(): void {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			return;
		}

		// Use nucleation's built-in change detection
		try {
			// Ask nucleation to check for changes (zero overhead if no custom IO)
			this.simulationWorld.checkCustomIoChanges();
			
			// Poll the detected changes
			const changes = this.simulationWorld.pollCustomIoChanges();
			
			// Trigger JS callbacks for each change
			for (const change of changes) {
				const key = `${change.x},${change.y},${change.z}`;
				const callbacks = this.customIoCallbacks.get(key);
				
				if (callbacks && callbacks.length > 0) {
					const state: CustomIoState = {
						x: change.x,
						y: change.y,
						z: change.z,
						power: change.newPower,
						tick: this.state.tickCount,
					};
					callbacks.forEach(cb => cb(state));
				}
			}
		} catch (error) {
			SimulationLogger.error("Failed to check custom IO changes:", error);
		}
	}

	// ============================================================================
	// BLOCK INTERACTION API
	// ============================================================================

	/**
	 * Interact with a block (e.g., toggle lever, button)
	 */
	async interactWithBlock(x: number, y: number, z: number): Promise<SchematicWrapper | null> {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return null;
		}

		try {
			SimulationLogger.info(`Interacting with block at (${x}, ${y}, ${z})`);
			
			// Interact with block
			this.simulationWorld.on_use_block(x, y, z);
			
			// Tick to process the interaction
			this.simulationWorld.tick(2);
			
			// Flush changes
			this.simulationWorld.flush();

			// Sync to schematic if in synced mode
			if (this.state.syncMode === 'synced') {
				this.simulationWorld.sync_to_schematic();
			}

			// Get updated schematic
			const updatedSchematic = this.simulationWorld.get_schematic();

			this.eventEmitter.emit("blockInteracted", {
				position: [x, y, z],
				tickCount: this.state.tickCount + 2,
			});

			return updatedSchematic;
		} catch (error) {
			SimulationLogger.error("Failed to interact with block:", error);
			return null;
		}
	}

	// ============================================================================
	// AUTO-TICK API
	// ============================================================================

	/**
	 * Start automatic ticking at configured tick speed
	 * 
	 * @example
	 * // Start auto-ticking at 20 TPS (Minecraft default)
	 * sim.startAutoTick();
	 * 
	 * // Change speed to 10 TPS
	 * sim.setTickSpeed(10);
	 */
	startAutoTick(): void {
		if (this.state.autoTickEnabled) {
			SimulationLogger.warn("Auto-tick already enabled");
			return;
		}

		this.state.autoTickEnabled = true;
		const tickInterval = 1000 / this.state.tickSpeed;

		this.autoTickInterval = setInterval(() => {
			if (this.isSimulationActive()) {
				this.tick(1, 'auto');
			}
		}, tickInterval);

		SimulationLogger.info(`Auto-tick started at ${this.state.tickSpeed} TPS`);
		this.eventEmitter.emit("autoTickStarted", { tickSpeed: this.state.tickSpeed });
	}

	/**
	 * Stop automatic ticking
	 */
	stopAutoTick(): void {
		if (!this.state.autoTickEnabled) {
			return;
		}

		if (this.autoTickInterval) {
			clearInterval(this.autoTickInterval);
			this.autoTickInterval = null;
		}

		this.state.autoTickEnabled = false;
		SimulationLogger.info("Auto-tick stopped");
		this.eventEmitter.emit("autoTickStopped");
	}

	/**
	 * Change tick speed (takes effect on next auto-tick cycle)
	 */
	setTickSpeed(ticksPerSecond: number): void {
		this.state.tickSpeed = ticksPerSecond;
		
		// Restart auto-tick if it's running to apply new speed
		if (this.state.autoTickEnabled) {
			this.stopAutoTick();
			this.startAutoTick();
		}
	}

	// ============================================================================
	// LIFECYCLE
	// ============================================================================

	/**
	 * Reset simulation to initial state
	 */
	reset(): void {
		this.stopAutoTick();
		this.state.tickCount = 0;
		
		// Re-initialize if we have a schematic
		if (this.schematic) {
			SimulationLogger.info("Resetting simulation...");
			// Would need to store config to re-init properly
			// For now, just clear state
		}
		
		this.eventEmitter.emit("simulationReset");
	}

	/**
	 * Clean up and destroy simulation
	 */
	destroy(): void {
		this.stopAutoTick();
		
		if (this.simulationWorld) {
			try {
				this.simulationWorld.free();
			} catch (error) {
				console.error("Error freeing simulation world:", error);
			}
		}

		this.simulationWorld = null;
		this.schematic = null;
		this.state.isRunning = false;
		this.state.customIoPositions = [];
		this.customIoCallbacks.clear();

		SimulationLogger.info("Simulation destroyed");
		this.eventEmitter.emit("simulationDestroyed");
	}

	/**
	 * Get the underlying schematic (without syncing)
	 */
	getSchematic(): SchematicWrapper | null {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			return null;
		}

		try {
			return this.simulationWorld.get_schematic();
		} catch (error) {
			console.error("Failed to get schematic:", error);
			return null;
		}
	}
}
