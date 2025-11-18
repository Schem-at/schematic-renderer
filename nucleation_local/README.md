# Nucleation

**Nucleation** is a high-performance Minecraft schematic engine written in Rust with full support for **Rust**, **WebAssembly/JavaScript**, **Python**, and **FFI-based integrations** like **PHP** and **C**.

> Built for performance, portability, and parity across ecosystems.

---

[![Crates.io](https://img.shields.io/crates/v/nucleation.svg)](https://crates.io/crates/nucleation)
[![npm](https://img.shields.io/npm/v/nucleation.svg)](https://www.npmjs.com/package/nucleation)
[![PyPI](https://img.shields.io/pypi/v/nucleation.svg)](https://pypi.org/project/nucleation)

---

## Features

### Core
- **Multi-format support**: `.schematic`, `.litematic`, `.nbt`, and more
- **Memory-safe Rust core** with zero-copy deserialization
- **Cross-platform**: Linux, macOS, Windows (x86_64 + ARM64)
- **Multi-language**: Rust, JavaScript/TypeScript (WASM), Python, C/FFI

### Schematic Building
- **SchematicBuilder**: Create schematics with ASCII art and Unicode characters
- **Compositional Design**: Build circuits hierarchically from smaller components
- **Unicode Palettes**: Visual circuit design with intuitive characters (`→`, `│`, `█`, etc.)
- **Template System**: Define circuits in human-readable text format
- **CLI Tool**: Build schematics from command line (`schematic-builder`)

### Circuit Simulation
- **Redstone simulation** via MCHPRS integration (optional `simulation` feature)
- **TypedCircuitExecutor**: High-level API with typed inputs/outputs (Bool, U32, Ascii, etc.)
- **Custom IO**: Inject and monitor signal strengths at specific positions
- **Execution Modes**: Fixed ticks, until condition, until stable, until change
- **State Management**: Stateless, stateful, or manual control

### Developer Experience
- **Bracket notation** for blocks: `"minecraft:lever[facing=east,powered=false]"`
- **Feature parity** across all language bindings
- **Comprehensive documentation** in [`docs/`](docs/)
- Seamless integration with [Cubane](https://github.com/Nano112/cubane)

---

## Installation

### Rust

```bash
cargo add nucleation
````

### JavaScript / TypeScript (WASM)

```bash
npm install nucleation
```

### Python

```bash
pip install nucleation
```

### C / PHP / FFI

Download prebuilt `.so` / `.dylib` / `.dll` from [Releases](https://github.com/Schem-at/Nucleation/releases)
or build locally using:

```bash
./build-ffi.sh
```

---

## Quick Examples

### Loading and Saving Schematics

#### Rust

```rust
use nucleation::UniversalSchematic;

let bytes = std::fs::read("example.litematic")?;
let mut schematic = UniversalSchematic::new("my_schematic");
schematic.load_from_data(&bytes)?;
println!("{:?}", schematic.get_info());
```

#### JavaScript (WASM)

```ts
import { SchematicParser } from "nucleation";

const bytes = await fetch("example.litematic").then(r => r.arrayBuffer());
const parser = new SchematicParser();
await parser.fromData(new Uint8Array(bytes));
console.log(parser.getDimensions());
```

#### Python

```python
from nucleation import Schematic

with open("example.litematic", "rb") as f:
    data = f.read()

schem = Schematic("my_schematic")
schem.load_from_bytes(data)
print(schem.get_info())
```

### Building Schematics with ASCII Art

```rust
use nucleation::SchematicBuilder;

// Use Unicode characters for visual circuit design!
let circuit = SchematicBuilder::new()
    .from_template(r#"
        # Base layer
        ccc
        ccc
        
        # Logic layer
        ─→─
        │█│
        "#)
    .build()?;

// Save as litematic
let bytes = nucleation::litematic::to_litematic(&circuit)?;
std::fs::write("circuit.litematic", bytes)?;
```

**Available in Rust, JavaScript, and Python!** See [SchematicBuilder Guide](docs/guide/schematic-builder.md).

### Compositional Circuit Design

```rust
// Build a basic gate
let and_gate = create_and_gate();

// Use it in a larger circuit
let half_adder = SchematicBuilder::new()
    .map_schematic('A', and_gate)  // Use entire schematic as palette entry!
    .map_schematic('X', xor_gate)
    .layers(&[&["AX"]])  // Place side-by-side
    .build()?;

// Stack multiple copies
let four_bit_adder = SchematicBuilder::new()
    .map_schematic('F', full_adder)
    .layers(&[&["FFFF"]])  // 4 full-adders in a row
    .build()?;
```

See [4-Bit Adder Example](docs/examples/4-bit-adder.md) for a complete hierarchical design.

### CLI Tool

```bash
# Build schematic from text template
cat circuit.txt | schematic-builder -o circuit.litematic

# From file
schematic-builder -i circuit.txt -o circuit.litematic

# Choose format
schematic-builder -i circuit.txt -o circuit.schem --format schem
```

---

## Advanced Examples

### Setting Blocks with Properties

```js
const schematic = new SchematicWrapper();
schematic.set_block(0, 1, 0, "minecraft:lever[facing=east,powered=false,face=floor]");
schematic.set_block(5, 1, 0, "minecraft:redstone_wire[power=15,east=side,west=side]");
```

[More in `examples/rust.md`](examples/rust.md)

### Redstone Circuit Simulation

```js
const simWorld = schematic.create_simulation_world();
simWorld.on_use_block(0, 1, 0); // Toggle lever
simWorld.tick(2);
simWorld.flush();
const isLit = simWorld.is_lit(15, 1, 0); // Check if lamp is lit
```

### High-Level Typed Executor

```rust
use nucleation::{TypedCircuitExecutor, IoType, Value, ExecutionMode};

// Create executor with typed IO
let mut executor = TypedCircuitExecutor::new(world, inputs, outputs);

// Execute with typed values
let mut input_values = HashMap::new();
input_values.insert("a".to_string(), Value::Bool(true));
input_values.insert("b".to_string(), Value::Bool(true));

let result = executor.execute(
    input_values,
    ExecutionMode::FixedTicks { ticks: 100 }
)?;

// Get typed output
let output = result.outputs.get("result").unwrap();
assert_eq!(*output, Value::Bool(true));  // AND gate result
```

**Supported types**: `Bool`, `U8`, `U16`, `U32`, `I8`, `I16`, `I32`, `Float32`, `Ascii`, `Array`, `Matrix`, `Struct`

See [TypedCircuitExecutor Guide](docs/guide/typed-executor.md) for execution modes, state management, and more.

---

## Development

```bash
# Build the Rust core
cargo build --release

# Build with simulation support
cargo build --release --features simulation

# Build WASM module (includes simulation)
./build-wasm.sh

# Build Python bindings locally
maturin develop --features python

# Build FFI libs
./build-ffi.sh

# Run tests
cargo test
cargo test --features simulation
./test-wasm.sh  # WASM tests with simulation

# Pre-push verification (recommended before pushing)
./pre-push.sh  # Runs all checks that CI runs
```

---

## Documentation

### 📖 Language-Specific Documentation

Choose your language for complete API reference and examples:

- **[Rust Documentation](docs/rust/)** - Complete Rust API reference
- **[JavaScript/TypeScript Documentation](docs/javascript/)** - WASM API for web and Node.js
- **[Python Documentation](docs/python/)** - Python bindings API
- **[C/FFI Documentation](examples/ffi.md)** - C-compatible FFI for PHP, Go, etc.

### 📚 Shared Guides

These guides apply to all languages:

- [SchematicBuilder Guide](docs/shared/guide/schematic-builder.md) - ASCII art and compositional design
- [TypedCircuitExecutor Guide](docs/shared/guide/typed-executor.md) - High-level circuit simulation
- [Unicode Palette Reference](docs/shared/unicode-palette.md) - Visual circuit characters

### 🎯 Quick Links

- [Main Documentation Index](docs/) - Overview and comparison
- [Examples Directory](examples/) - Working code examples

---

## License

Licensed under the **GNU AGPL-3.0-only**.
See [`LICENSE`](./LICENSE) for full terms.

Made by [@Nano112](https://github.com/Nano112)
