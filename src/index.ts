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
export { InspectorManager } from "./managers/InspectorManager";
export { ResourcePackManagerProxy } from "./managers/ResourcePackManagerProxy";
export { ResourcePackUI } from "./ui/ResourcePackUI";
export { ExportUI } from "./ui/ExportUI";
export { RenderSettingsUI } from "./ui/RenderSettingsUI";
export { CaptureUI } from "./ui/CaptureUI";
export { BaseUI, UIColors, UIStyles } from "./ui/UIComponents";
export { SchematicExporter } from "./export/SchematicExporter";
export type { SimulationConfig, SimulationState, SyncMode } from "./managers/SimulationManager";
export type {
	SchematicRendererOptions,
	KeyboardControlsOptions,
	DebugOptions,
	GPUComputeOptions,
	WasmMeshBuilderOptions,
} from "./SchematicRendererOptions";
export type {
	InsignRegionStyle,
	InsignRegionOptions,
} from "./managers/highlight/InsignRegionHighlight";
export type { InsignRegionFilter } from "./managers/InsignManager";
export type { InsignIoRegion, InsignIoFilter } from "./managers/InsignIoManager";
export type { InsignIoStyle } from "./managers/highlight/InsignIoHighlight";
export { InsignIoHighlight } from "./managers/highlight/InsignIoHighlight";
export type {
	OverlayContent,
	OverlaySection,
	OverlayItem,
	OverlayPosition,
} from "./managers/OverlayManager";
export type { DslMap, DslEntry, BoxPair } from "./types/insign";

// Export types
export type {
	ExportFormat,
	ExportQuality,
	ExportOptions,
	ExportProgress,
	ExportResult,
	ExportError,
	ExportErrorCode,
	ExportUIOptions,
	ExportPreset,
	ExportEventType,
	ExportEventMap,
	ExportEventHandler,
	ExportProgressCallback,
	ExportCompleteCallback,
	ExportErrorCallback,
	NormalMode,
	TextureMode,
	QualityPreset,
} from "./types/export";

// Render settings types
export type { RenderSettingsUIOptions, RenderSettings } from "./ui/RenderSettingsUI";

// Capture types
export type {
	CaptureUIOptions,
	ScreenshotSettings,
	RecordingSettings,
	CameraPathSettings,
} from "./ui/CaptureUI";

// UI component types
export type { UIPosition, BaseUIOptions } from "./ui/UIComponents";

// Resource pack types
export type {
	ResourcePackInfo,
	PackFetchOptions,
	PackValidationResult,
	PackConfig,
	AssetConflict,
	PackMemoryUsage,
	StoredResourcePack,
	PackEventMap as ResourcePackEventMap,
	PackEventType as ResourcePackEventType,
	PackEventHandler as ResourcePackEventHandler,
	ResourcePackOptions,
	PackAddedEvent,
	PackRemovedEvent,
	PackToggledEvent,
	PackOrderChangedEvent,
	PacksChangedEvent,
	AtlasRebuildingEvent,
	AtlasRebuiltEvent,
	LoadProgressEvent,
	LoadStartEvent,
	LoadCompleteEvent,
	LoadErrorEvent,
	PackErrorEvent,
} from "./types/resourcePack";

// Re-export nucleation to provide single WASM instance across the app
export * from "./nucleationExports";
