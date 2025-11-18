// Re-export nucleation types and classes to provide single WASM instance
// This ensures all consumers use the same nucleation instance

// @ts-ignore - nucleation types
export type { SchematicWrapper, MchprsWorldWrapper, SimulationOptionsWrapper, BlockPos, SchematicBuilderWrapper, TypedCircuitExecutorWrapper, ExecutionModeWrapper } from "nucleation";

// @ts-ignore - nucleation classes
export { SchematicWrapper, SimulationOptionsWrapper, MchprsWorldWrapper, SchematicBuilderWrapper, TypedCircuitExecutorWrapper, ExecutionModeWrapper } from "nucleation";

// @ts-ignore - WASM initializer
export { default as initializeNucleationWasm } from "nucleation";


