# Multi-Region Input/Output Support for Nucleation

## Objective

Enable defining circuit inputs and outputs using multiple disjoint regions (bounding boxes). This allows users to create complex IO interfaces (e.g., diagonal lever placements, split busses) that cannot be captured by a single cuboid region. This functionality should be natively supported in the Nucleation Rust core and exposed via WASM to ensure headless simulation capabilities.

## Requirements

### 1. Nucleation Core (Rust)

- **Extend `IoLayoutBuilder`**: Add methods to support multi-region definitions.
  - `add_input_multi_region(name, type, layout, regions)`
  - `add_output_multi_region(name, type, layout, regions)`
  - `add_input_multi_region_auto(name, type, regions)`
  - `add_output_multi_region_auto(name, type, regions)`
- **Region Processing**:
  - `regions` input should be a list of `(min, max)` coordinate tuples.
  - Iteration order must be consistent:
    1. Iterate through the list of regions in the provided order.
    2. For each region, iterate blocks in standard order: Y (layers) -> X (rows) -> Z (columns).
  - Collect all valid `(x, y, z)` positions from all regions into a single flat list.
- **Layout Inference (Auto)**:
  - Determine total position count by summing the volume of all provided regions.
  - Use the total count to infer `OneToOne` vs `Packed4` layout, similar to single-region auto-detection.

### 2. WASM Interface (Binding)

- **Expose New Methods**: Update `IoLayoutBuilderWrapper` in `src/wasm.rs`.
  - `addInputMultiRegion`: Accepts JS array of regions.
  - `addOutputMultiRegion`: Accepts JS array of regions.
  - `addInputMultiRegionAuto`: Accepts JS array of regions.
  - `addOutputMultiRegionAuto`: Accepts JS array of regions.
- **Data Conversion**:
  - Convert JS array of `{min, max}` objects (or arrays) into Rust `Vec<((i32, i32, i32), (i32, i32, i32))>` tuples.
  - Ensure type safety and error handling for invalid input formats.

### 3. Schematic Renderer Integration (TypeScript)

- **Update `SchematicObject.ts`**:
  - Modify `createCircuitFunction` to utilize the new multi-region WASM APIs.
  - When parsing `inputs` and `outputs`:
    - Check if the provided `region` property describes a single region or a collection of sub-regions.
    - If multiple sub-regions are present, format them correctly and call `addInputMultiRegion`/`addOutputMultiRegion`.
- **Refactor Region Management**:
  - Update `RegionManager` and `EditableRegionHighlight` to allow a "logical" region to consist of multiple visual sub-regions (if desired for UI).
  - _Note_: Initially, this can be handled purely via code API (passing an array of bounds) as per user preference.

### 4. Testing & Verification

- **Headless Test**: Create a test case in `tests/node_wasm_test.js` that:
  - Defines a circuit with split inputs (e.g., two separate 4-bit distinct regions forming an 8-bit byte).
  - Verifies that `Nucleation` correctly aggregates the bits and runs the simulation.
- **Renderer Test**: Verify that the `SchematicRenderer` correctly delegates complex region definitions to the new API without errors.

## Success Criteria

- A user can define an input consisting of two separate 1x4x1 regions and treat it as a single 8-bit input in the simulation.
- The simulation runs correctly in a headless Node.js environment using only the WASM build.
- The API is consistent with existing single-region methods.
