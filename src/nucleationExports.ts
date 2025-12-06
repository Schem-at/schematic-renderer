// Re-export nucleation types and classes to provide single WASM instance
// This ensures all consumers use the same nucleation instance

// Classes (which are also types)
// @ts-ignore - nucleation classes
export {
  SchematicWrapper,
  SimulationOptionsWrapper,
  MchprsWorldWrapper,
  SchematicBuilderWrapper,
  TypedCircuitExecutorWrapper,
  ExecutionModeWrapper,
  BlockPosition,
  IoLayoutBuilderWrapper,
  IoTypeWrapper,
  LayoutFunctionWrapper,
  IoLayoutWrapper,
  ValueWrapper,
  OutputConditionWrapper,
  DefinitionRegionWrapper,
  CircuitBuilderWrapper,
  StateModeConstants,
  SortStrategyWrapper
} from "nucleation";

// @ts-ignore - WASM initializer
export { default as initializeNucleationWasm } from "nucleation";
