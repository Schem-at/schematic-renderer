// SimulationManager.ts
import { EventEmitter } from "events";
import { SimulationLogger } from "../utils/SimulationLogger";
// @ts-ignore
import type { SchematicWrapper, MchprsWorldWrapper } from "nucleation";

export interface SimulationState {
	isRunning: boolean;
	tickCount: number;
	autoTickEnabled: boolean;
	tickSpeed: number; // ticks per second
}

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
		tickSpeed: 20, // Default Minecraft tick rate
	};
	private autoTickInterval: NodeJS.Timeout | null = null;

	constructor(eventEmitter: EventEmitter) {
		this.eventEmitter = eventEmitter;
	}

	/**
	 * Initialize simulation for a schematic
	 */
	async initializeSimulation(schematic: SchematicWrapper): Promise<boolean> {
		try {
			SimulationLogger.info("Initializing simulation...");
			
			// Check schematic dimensions
			const dimensions = schematic.get_dimensions();
			SimulationLogger.info(`Schematic dimensions: [${dimensions[0]}, ${dimensions[1]}, ${dimensions[2]}]`);
			
			// Count redstone components
			let leverCount = 0;
			let redstoneCount = 0;
			for (let x = 0; x < dimensions[0]; x++) {
				for (let y = 0; y < dimensions[1]; y++) {
					for (let z = 0; z < dimensions[2]; z++) {
						const block = schematic.get_block(x, y, z);
						if (block) {
							if (block.includes("lever")) leverCount++;
							if (block.includes("redstone")) redstoneCount++;
						}
					}
				}
			}
			SimulationLogger.info(`Found ${leverCount} levers, ${redstoneCount} redstone components`);
			
			// Create simulation world from schematic
			SimulationLogger.info("Creating MCHPRS simulation world...");
			this.simulationWorld = schematic.create_simulation_world();
			this.schematic = schematic;
			this.state.isRunning = true;
			this.state.tickCount = 0;

			this.eventEmitter.emit("simulationInitialized", {
				state: this.getState(),
			});

			SimulationLogger.success("Simulation initialized successfully");
			return true;
		} catch (error) {
			SimulationLogger.error("Failed to initialize simulation:", error);
			this.eventEmitter.emit("simulationError", { error });
			return false;
		}
	}

	/**
	 * Check if simulation is active
	 */
	isSimulationActive(): boolean {
		return this.simulationWorld !== null && this.state.isRunning;
	}

	/**
	 * Get the simulation world (for direct access if needed)
	 */
	getSimulationWorld(): MchprsWorldWrapper | null {
		return this.simulationWorld;
	}

	/**
	 * Interact with a block (e.g., click a lever)
	 * Returns the updated schematic if interaction was successful, null otherwise
	 */
	interactBlock(x: number, y: number, z: number): SchematicWrapper | null {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return null;
		}

		try {
			// Get block name and state BEFORE interaction
			let blockName = "unknown";
			let beforeState = "unknown";
			if (this.schematic) {
				blockName = this.schematic.get_block(x, y, z) || "unknown";
				const blockWithProps = this.schematic.get_block_with_properties(x, y, z);
				if (blockWithProps) {
					const props = blockWithProps.properties();
					beforeState = props.powered || "unknown";
				}
			}

			SimulationLogger.interaction(x, y, z, blockName);
			SimulationLogger.info(`⚙️  Before: powered=${beforeState}`);

			// Use MCHPRS on_use_block to handle interaction (queues the lever toggle)
			this.simulationWorld.on_use_block(x, y, z);
			SimulationLogger.info("⏭️  Called on_use_block, now ticking to process...");
			
			// Check lever state using get_lever_power (direct check)
			const leverStateAfterUse = this.simulationWorld.get_lever_power(x, y, z);
			SimulationLogger.info(`⚡ After on_use_block: leverPower=${leverStateAfterUse}`);
			
			// Flush to ensure the changes are visible (but don't tick - that's controlled separately)
			this.simulationWorld.flush();
			SimulationLogger.info("✓ Flush complete (no ticks - use manual tick or auto-tick for propagation)");
			
			// Get the updated schematic directly (without syncing yet - caller will handle mesh rebuild)
			SimulationLogger.info("🔄 Getting updated schematic from simulation...");
			this.simulationWorld.sync_to_schematic();
			const updatedSchematic = this.simulationWorld.get_schematic();
			
			// Check the lever state
			const simBlock = updatedSchematic.get_block_with_properties(x, y, z);
			if (simBlock) {
				const simProps = simBlock.properties();
				SimulationLogger.info(`📘 Lever state: powered=${simProps.powered}`);
			}

			this.eventEmitter.emit("blockInteracted", {
				position: [x, y, z],
				updatedSchematic,
			});
			
			return updatedSchematic;
		} catch (error) {
			SimulationLogger.error("Failed to interact with block:", error);
			return null;
		}
	}

	/**
	 * Tick the simulation forward
	 */
	tick(numTicks: number = 1): void {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return;
		}

		try {
			// Advance simulation
			this.simulationWorld.tick(numTicks);
			this.simulationWorld.flush();

			this.state.tickCount += numTicks;

			SimulationLogger.tick(this.state.tickCount, numTicks);

			this.eventEmitter.emit("simulationTicked", {
				tickCount: this.state.tickCount,
				numTicks,
			});
		} catch (error) {
			SimulationLogger.error("Failed to tick simulation:", error);
		}
	}

	/**
	 * Sync simulation state back to the schematic
	 * Returns the updated schematic wrapper
	 */
	syncToSchematic(): SchematicWrapper | null {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			SimulationLogger.warn("Simulation not active");
			return null;
		}

		try {
			SimulationLogger.info("Syncing simulation state back to schematic...");
			
			// Sync the simulation state to the schematic first
			this.simulationWorld.sync_to_schematic();
			
			// Get the updated schematic from simulation world
			const updatedSchematic = this.simulationWorld.get_schematic();
			
			// Verify the lever state changed
			const dimensions = updatedSchematic.get_dimensions();
			let leverCount = 0;
			for (let x = 0; x < dimensions[0]; x++) {
				for (let y = 0; y < dimensions[1]; y++) {
					for (let z = 0; z < dimensions[2]; z++) {
						const block = updatedSchematic.get_block(x, y, z);
						if (block && block.includes("lever")) {
							const blockWithProps = updatedSchematic.get_block_with_properties(x, y, z);
							if (blockWithProps) {
								const props = blockWithProps.properties();
								SimulationLogger.info(`Lever at [${x},${y},${z}] powered: ${props.powered}`);
								leverCount++;
							}
						}
					}
				}
			}

			SimulationLogger.sync();
			SimulationLogger.info(`Checked ${leverCount} levers in synced schematic`);

			this.eventEmitter.emit("simulationSynced", {
				tickCount: this.state.tickCount,
				updatedSchematic,
			});

			console.log("[syncToSchematic] Returning updated schematic");
			return updatedSchematic;
		} catch (error) {
			SimulationLogger.error("Failed to sync simulation:", error);
			return null;
		}
	}

	/**
	 * Get updated schematic with simulation state
	 */
	getUpdatedSchematic(): SchematicWrapper | null {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			return null;
		}

		try {
			// Get schematic with synced simulation state
			return this.simulationWorld.get_schematic();
		} catch (error) {
			console.error("Failed to get updated schematic:", error);
			return null;
		}
	}

	/**
	 * Check if a specific block is lit (for lamps, etc.)
	 */
	isBlockLit(x: number, y: number, z: number): boolean {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			return false;
		}

		try {
			return this.simulationWorld.is_lit(x, y, z);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get lever power state
	 */
	getLeverPower(x: number, y: number, z: number): boolean {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			return false;
		}

		try {
			return this.simulationWorld.get_lever_power(x, y, z);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get redstone power level at a position
	 */
	getRedstonePower(x: number, y: number, z: number): number {
		if (!this.isSimulationActive() || !this.simulationWorld) {
			return 0;
		}

		try {
			return this.simulationWorld.get_redstone_power(x, y, z);
		} catch (error) {
			return 0;
		}
	}

	/**
	 * Start auto-ticking
	 */
	startAutoTick(): void {
		if (this.autoTickInterval) {
			return; // Already running
		}

		this.state.autoTickEnabled = true;
		const intervalMs = 1000 / this.state.tickSpeed;

		this.autoTickInterval = setInterval(() => {
			this.tick(1);
		}, intervalMs);

		this.eventEmitter.emit("autoTickStarted", {
			tickSpeed: this.state.tickSpeed,
		});
	}

	/**
	 * Stop auto-ticking
	 */
	stopAutoTick(): void {
		if (this.autoTickInterval) {
			clearInterval(this.autoTickInterval);
			this.autoTickInterval = null;
		}

		this.state.autoTickEnabled = false;

		this.eventEmitter.emit("autoTickStopped");
	}

	/**
	 * Set tick speed (ticks per second)
	 */
	setTickSpeed(ticksPerSecond: number): void {
		this.state.tickSpeed = Math.max(1, Math.min(100, ticksPerSecond));

		// Restart auto-tick if it was running
		if (this.autoTickInterval) {
			this.stopAutoTick();
			this.startAutoTick();
		}

		this.eventEmitter.emit("tickSpeedChanged", {
			tickSpeed: this.state.tickSpeed,
		});
	}

	/**
	 * Reset simulation to initial state
	 */
	async resetSimulation(): Promise<boolean> {
		this.stopAutoTick();

		if (!this.schematic) {
			return false;
		}

		// Reinitialize from original schematic
		return await this.initializeSimulation(this.schematic);
	}

	/**
	 * Get current simulation state
	 */
	getState(): SimulationState {
		return { ...this.state };
	}

	/**
	 * Cleanup
	 */
	dispose(): void {
		this.stopAutoTick();
		this.simulationWorld = null;
		this.schematic = null;
		this.state.isRunning = false;
	}
}
