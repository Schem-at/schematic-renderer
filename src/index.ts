export { SchematicRenderer } from "./SchematicRenderer";
export { SimulationManager } from "./managers/SimulationManager";
export { SimulationLogger } from "./utils/SimulationLogger";
export { CustomIoHighlight } from "./managers/highlight/CustomIoHighlight";
export { InsignManager } from "./managers/InsignManager";
export { InsignRegionHighlight } from "./managers/highlight/InsignRegionHighlight";
export type { SimulationConfig, SimulationState, SyncMode } from "./managers/SimulationManager";
export type { SchematicRendererOptions } from "./SchematicRendererOptions";
export type { InsignRegionStyle, InsignRegionOptions } from "./managers/highlight/InsignRegionHighlight";
export type { InsignRegionFilter } from "./managers/InsignManager";
export type { DslMap, DslEntry, BoxPair } from "./types/insign";

// Re-export nucleation to provide single WASM instance across the app
export * from "./nucleationExports";
