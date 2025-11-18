export { SchematicRenderer } from "./SchematicRenderer";
export { SimulationManager } from "./managers/SimulationManager";
export { SimulationLogger } from "./utils/SimulationLogger";
export { CustomIoHighlight } from "./managers/highlight/CustomIoHighlight";
export { InsignManager } from "./managers/InsignManager";
export { InsignIoManager } from "./managers/InsignIoManager";
export { OverlayManager } from "./managers/OverlayManager";
export { InsignRegionHighlight } from "./managers/highlight/InsignRegionHighlight";
export { InsignIoHoverHandler } from "./managers/highlight/InsignIoHoverHandler";
export { KeyboardControls } from "./managers/KeyboardControls";
export type { SimulationConfig, SimulationState, SyncMode } from "./managers/SimulationManager";
export type { SchematicRendererOptions, KeyboardControlsOptions } from "./SchematicRendererOptions";
export type { InsignRegionStyle, InsignRegionOptions } from "./managers/highlight/InsignRegionHighlight";
export type { InsignRegionFilter } from "./managers/InsignManager";
export type { InsignIoRegion, InsignIoFilter } from "./managers/InsignIoManager";
export type { InsignIoStyle } from "./managers/highlight/InsignIoHighlight";
export { InsignIoHighlight } from "./managers/highlight/InsignIoHighlight";
export type { OverlayContent, OverlaySection, OverlayItem, OverlayPosition } from "./managers/OverlayManager";
export type { DslMap, DslEntry, BoxPair } from "./types/insign";

// Re-export nucleation to provide single WASM instance across the app
export * from "./nucleationExports";
