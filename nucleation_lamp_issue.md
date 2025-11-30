# Issue: TypedCircuitExecutor Cannot Read Output from Redstone Lamps

## Description

The `TypedCircuitExecutor` (and by extension `MchprsWorld`) fails to read the signal state from `minecraft:redstone_lamp` blocks, even though they are listed as valid custom IO blocks in `insign_io.rs`.

When reading an output from a lamp:

1. `TypedCircuitExecutor` calls `world.get_signals_batch()`.
2. This calls `world.get_signal_strength(pos)`.
3. This delegates to `compiler.get_signal_strength(pos)` in `mchprs_redpiler`.

**The Problem:** The Redpiler compiler treats Redstone Lamps as **sinks** (consumers). They do not have an associated output signal strength in the compiler graph. Consequently, `get_signal_strength` returns `None` (which defaults to `0`), regardless of whether the lamp is lit or not.

This creates a discrepancy where a lamp can be visually lit (`lit=true` in block state) but report a signal strength of `0` to the executor.

## Reproduction

Create a simple circuit with a lever powering a redstone lamp. Attempt to read the lamp's state using `TypedCircuitExecutor`.

### Rust Test Case (`src/simulation/typed_executor/tests.rs`)

```rust
#[test]
fn test_read_lamp_output() {
    let mut schematic = UniversalSchematic::new("test_lamp".to_string());

    // Setup: Lever powering a Lamp
    // [Lever] -> [Lamp]
    schematic.set_block(0, 0, 0, BlockState::new("minecraft:lever[powered=true,facing=east]".to_string()));
    schematic.set_block(1, 0, 0, BlockState::new("minecraft:redstone_lamp".to_string()));

    let world = MchprsWorld::new(schematic).unwrap();

    // Create executor reading the lamp at (1,0,0)
    let layout = IoLayoutBuilder::new()
        .add_output("lamp", IoType::Boolean, LayoutFunction::OneToOne, vec![(1, 0, 0)])
        .unwrap()
        .build();

    let mut executor = TypedCircuitExecutor::from_layout(world, layout);

    // Tick simulation
    let result = executor.execute(
        HashMap::new(),
        ExecutionMode::FixedTicks { ticks: 5 }
    ).unwrap();

    // EXPECTED: Lamp should be ON (true)
    // ACTUAL: Lamp reads as OFF (false/0) because get_signal_strength returns 0 for sinks
    let lamp_val = result.outputs.get("lamp").unwrap();

    // This assertion currently FAILS
    assert_eq!(*lamp_val, Value::Bool(true), "Lamp should read as true (lit) when powered");
}
```

## Suggested Fix

Modify `MchprsWorld::get_signal_strength` in `src/simulation/mchprs_world.rs` to handle blocks that don't have signal strength but do have observable state (like `lit` for lamps or `powered` for repeaters/comparators that might act as sinks in certain contexts).

Ideally, `mchprs_redpiler` should expose a way to read the _input power_ to a sink node. If that's not possible, a fallback to checking block state (carefully) might be needed, though reading chunk data during execution is generally discouraged for performance.

**Proposed Logic for `get_signal_strength`:**

```rust
// src/simulation/mchprs_world.rs

pub fn get_signal_strength(&self, pos: BlockPos) -> u8 {
    let normalized_pos = self.normalize_pos(pos);

    // 1. Try getting signal strength from compiler (existing logic)
    if let Some(strength) = self.compiler.get_signal_strength(normalized_pos) {
        return strength;
    }

    // 2. Fallback: Check if it's a block with observable boolean state
    // Note: This requires the compiler to keep block states updated, or we need to
    // know if the compiler tracks this state internally.
    let block = self.get_block(normalized_pos);
    match block.get_name() {
        "redstone_lamp" => {
             // If the compiler tracks 'lit' state for lamps, exposing that would be best.
             // Otherwise, we might need to check if the node is activated in the graph.
             //
             // Ideally: self.compiler.is_node_active(normalized_pos) ? 15 : 0
             0
        },
        _ => 0
    }
}
```

**Alternative (Better) Fix:**
Ensure `mchprs_redpiler` assigns a node index to Redstone Lamps that allows their input power level to be queried via `get_signal_strength`, effectively treating them as "pass-through" or "observable" nodes rather than pure black-box sinks.
