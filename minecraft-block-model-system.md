# Minecraft's Block Model System: From Block States to Rendered Meshes

Minecraft Java Edition (vanilla) uses a data-driven resource pack model system to determine how blocks (and items) look based on their block state (formerly block ID and metadata). In essence, each block has a blockstates JSON file that maps its state values to one or more model definitions, and each model JSON describes the block's geometry and textures.

## 1. Block States and Model Resolution

**Blockstates JSON**: In vanilla Minecraft, every block has a corresponding JSON file in `assets/<namespace>/blockstates/` that defines its possible states (variants) and links them to model files. The block's in-game ID (e.g. `minecraft:oak_log`) is used to locate the JSON.

This blockstate file lists all valid combinations of that block's state properties and the model(s) to use for each. For example:
- A block with no variants will use `""` (empty string) as the default variant
- A block with properties will have entries like `property1=value1,property2=value2` as keys

When the game renders a block at a given position, it checks the block's state (e.g. a log block with `axis=y`). The engine then looks up the block's blockstate JSON and finds the entry matching those state values. This yields a model resource location (the path to a model JSON) and possibly some transform parameters.

Under the hood, Minecraft constructs a variant string from the state (like `"axis=y"`) and uses that to find the model. For example, the oak_log blockstate file defines variants for `axis=y`, `axis=x`, `axis=z`, etc., each mapping to an appropriate model: the upright log vs. the sideways log, etc.

In code, the combination of block ID + state is resolved to a ModelResourceLocation, which points to the model file.

**Variants vs. Multipart**:

There are two ways blockstate files define models:
- **Variants**: Each state combination selects one model/variant. If multiple models are listed (as an array), the game will randomly choose one, optionally using weights to bias the probability.
- **Multipart**: Multiple models can be applied together based on conditions. The multipart format is used for blocks that may render several model pieces at once. Instead of enumerating every combination, it lists conditional model parts: each entry has a "when" clause (state condition) and an "apply" clause (model to use if the condition matches). This allows combining several sub-models depending on state.

For instance, fences use multipart: there's always a post model, and then side models that appear only if the fence connects in a given direction.

## 2. Determining Rotation, Variants, and Metadata for Orientation

Many blocks have orientation or variant properties (formerly encoded as metadata) that affect their appearance. Minecraft's blockstate definitions handle these by specifying model rotations or different models for each variant.

**Rotation (x, y) in Blockstates**:
Instead of duplicating geometry for each facing direction, the blockstate can instruct the engine to rotate a model on the X or Y axis in 90° increments. For example:
- Stair blocks have a `facing` property (north, south, east, west) and a `half` property (top or bottom). The stair's blockstate JSON will often use one base model for the stair shape and apply y rotations to orient that stair model north/south/east/west, and an x rotation (usually 180°) if the stair is upside-down.
- Logs/pillars have an `axis` (x, y, z); the oak_log.json blockstate uses the same model for a horizontal log oriented along Z vs. X by just rotating it 90° around Y for the X-axis case.

**Variants and Alternate Models**:
Some blocks use different models entirely for certain state combinations:
- Stairs have a `shape` property (straight, inner corner, outer corner) which changes the model geometry.
- Doors have different models for open vs. closed states.
- Logs use one model for upright (ends on top/bottom) and a different model for horizontal.

**Random Variants**:
Blockstates also allow random variety. If a variant entry in the JSON contains an array of models, Minecraft will randomly choose one each time that block is rendered.

For example, grass blocks in vanilla use four rotations of the same model for the default `snowy=false` state, each rotated 0°, 90°, 180°, 270° on the Y axis. Because no weight is specified, each rotation has equal 25% chance.

**Handling "Metadata"**:
In older Minecraft (pre-1.13), blocks had numeric metadata values (0–15) for variants. The modern system replaces this with named properties in the blockstate JSON. However, the concept is similar: those properties (like `facing=east`, `half=top`) represent what was once encoded in metadata.

**Example – Redstone Wire**:
Blocks like redstone dust have multiple connection states. Redstone wire's blockstate uses multipart definitions with conditions for each possible connection configuration:
- If a redstone wire has no adjacent connections (all sides "none") or is forming a closed loop, the blockstate triggers the "dot" model.
- For each side that is connected, it includes a straight or curved segment model in that direction.
- If a side is "up", the model uses a different part: a little raised segment that goes up one voxel and ends in a pad.

The combination of these pieces creates the final redstone wire appearance based on its connections.

## 3. Loading Textures and Model Parts from Resource Packs

Once the blockstate has pointed to a model (or several models), Minecraft will load the model JSON file(s) from the resource pack. Model files are located in `assets/<namespace>/models/block/` (for block models). The JSON model defines the geometry (as a set of cuboid "elements") and references to textures.

**Parent Models and Inheritance**:
Many model JSON files use a `parent` property. This allows models to inherit geometry and/or texture mappings from a base model. For example:
- Many simple cube blocks use `"parent": "block/cube_all"` which is a built-in model that already defines a full 1x1x1 cube shape with all faces using the same texture variable.
- The child model can then just specify which texture to use (e.g., dirt, stone, etc.) without redefining the cube geometry every time.
- If a model JSON has both a parent and its own elements, the child can add or override elements from the parent.

There are also specialized built-in parents like `"builtin/generated"` used for generated item sprites.

**Textures Resolution**:
Each model JSON has a `textures` object mapping texture variables (like "side", "end", "particle") to actual texture file paths:
- If the texture value starts with "#" (e.g., `"texture": "#side"` on a face), it's referencing one of the texture variables defined in the model (or inherited from its parent).
- If the model has a parent, any texture not defined in the child will be inherited from the parent's textures.
- The "particle" texture is a special entry often present in models. It defines the texture used for the particle effects when the block breaks or for the block's item form particles.

**Geometry Elements**:
The model JSON's core is the `elements` list:
- Each element is basically one rectangular cuboid piece of the model, defined by its `from` and `to` coordinates in a 3D space that spans 0 to 16 in each axis.
- These units correspond to the 16×16 pixel texture grid of a full block.
- Each element can include a `rotation` sub-object to tilt or rotate that cuboid about an axis.

**Faces and UV mapping**:
Each element has up to six faces (down, up, north, south, west, east):
- In the JSON, you only list the faces that should be rendered; any face not listed is considered invisible (transparent).
- For each face, the model defines which texture to use (by reference to the texture variables, e.g. `"#side"`).
- The `uv` coordinates determine how the texture maps to the face (given as `[x1, y1, x2, y2]` on the 16x16 texture grid).
- A face can have a `rotation` parameter (0, 90, 180, 270) to rotate the texture on that face without rotating the geometry.

**Cullface**:
Each face can also specify `"cullface"` with a direction. This tells the engine that if there is an opaque block adjacent on that side, this face should be culled (not rendered) because it would never be visible.

## 4. From Model JSON to a Renderable 3D Mesh

Once the model JSON is parsed (giving us elements and faces), Minecraft "bakes" the model. Baking means converting the abstract model into a set of static geometry — typically a list of textured quads ready for rendering.

**Coordinate System**:
- Minecraft's model coordinates go from 0 to 16, where (0,0,0) is the bottom-west-south corner of the block, and (16,16,16) the opposite top-east-north corner.
- If you treat one block as one unit in your engine, you'd scale these by 1/16.
- For each face, you create a quad with the correct dimensions.

**Applying Element Rotations**:
If an element has a rotation (say 45° around the Y axis), the loader will rotate all eight vertices of that cuboid around the specified origin. This can result in faces that are no longer axis-aligned.

**Overall Model Rotation**:
In addition to element rotations, the blockstate may have specified an overall rotation (the x and y in the blockstate variant). This is essentially a rotation of the entire model instance after it's baked.

A special case is `uvlock`: if `uvlock:true` in the blockstate, when you rotate the model, the faces' texture UV orientations should remain as if the block was not rotated.

**Combining Multipart Models**:
For blocks that use multipart (like fences, walls, redstone, etc.), the final mesh is composed of several model pieces:
- The game evaluates each "when" condition in the blockstate's multipart list against the block's state.
- For every entry that matches, it adds those element faces into the block's render mesh.

For example, the oak fence state always matches the first entry (with no condition) which applies the fence post model. Then it checks each direction: if the fence block has a neighbor to the north (`north=true` in state), it applies the fence_side model rotated Y=0. If `east=true`, it applies the same side model with Y=90, and so on.

**Multiple Variant Choices**:
If the blockstate had an array of models for a variant (random choices), the game will pick one based on a consistency algorithm (often using the block position's hash to ensure the choice stays the same unless the block changes).

**Baking to a Mesh**:
After applying all relevant transforms and gathering all elements, we have a collection of faces with specific vertices and texture coordinates. Minecraft will typically convert each face into 4 vertices and indices for two triangles. These get uploaded to the GPU or stored for rendering.

## 5. Handling Complex Blocks: Redstone Dust, Rails, Fences, and More

Certain blocks have especially dynamic models that depend on the environment (neighbors, etc.).

**Fences and Walls**:
These are connectivity-based models:
- A center post (always present)
- A side bar for each side that connects (rotated into place)

When rendering a fence, you check the blocks at adjacent positions. If any neighbor is a fence or wall or a block that a fence can attach to, then include the arm in that direction.

**Redstone Dust**:
Redstone wire is essentially a cross-shaped blob that connects on up to four sides:
- A center dot if there are no connections, or if connections make a loop
- For each connected side, a straight line segment in that direction
- If a side is "up", the model uses a different part: a little raised segment

All these pieces (center, lines, up ramps) are combined based on the block's state.

**Rails (Tracks)**:
Rails have a property `shape` which can be one of several types:
- Straight tracks (north_south, east_west)
- Sloped tracks (ascending_north/south/east/west)
- Corner pieces (north_east, north_west, south_east, south_west)

Each shape uses a different model or transformation.

**Stairs**:
Stairs combine two small cubes (an upper step and a lower step):
- Check if the stair is straight, inner, or outer as given by its state
- Load the appropriate stair model geometry
- If the stair is top-half (`half=top`), flip it upside down
- Rotate the model around Y so that its open side faces the correct direction

**Other Complex Blocks**:
- Doors have top and bottom parts, and open in different directions
- Pistons have moving parts
- Crops and flowers use a special cross-shaped model (two perpendicular flat quads)
- Fluids (water, lava) don't use block models at all – they have a special renderer

## 6. Item Models and Basic Entity Models (Armor Stands, Falling Blocks)

**Item Models**:
Items have their own model files in `assets/<namespace>/models/item/`. Unlike blocks, items do not usually have multiple states/variants. Generally, each item has one model definition.

If a block has a corresponding item, there are two common approaches:
1. The item model is linked to the block model (`"parent": "minecraft:block/your_block_model"`)
2. The item model is a flat sprite (using `"parent": "item/generated"`)

Items can also have:
- Multiple layers (layer0, layer1, etc.) for things like spawn eggs or maps
- A display section that specifies transformations for various render contexts
- Special parents like `"builtin/entity"` for complex items like chests or shields

**Falling Block Entities**:
A falling block uses the block's model directly. The game simply takes the block state of the falling block and renders it as if that block were in the world at the entity's location.

**Armor Stand (Basic Entity Model)**:
The armor stand is an entity, not a block, and its model isn't defined by the blockstate/model JSON system. Instead, the armor stand's shape is defined in code and uses a texture from the resource pack.

For rendering an armor stand, you'd create a model for it using cubes or import a premade model:
- The base is a flat slab (roughly 0.5×0.5×0.125 of a block in size)
- The post is a vertical stick in the center
- It has two arms angled out, and little feet

**Other Entities**:
Most entities (like minecarts or mobs) are not defined in block model JSONs – they are either hardcoded models or use entity model formats. Chests are a special case – the chest in-world is actually rendered via an entity model because it has an opening animation and 3D latch.

## Summary

Minecraft's block rendering system flows from blockstates JSON to model files to actual rendered meshes:
1. The game first resolves a block's state to model file(s) via the blockstate JSON
2. It loads those model files, which define elements (cuboids) and textures
3. It applies rotations and transformations specified in the blockstate
4. For complex blocks, it may combine multiple model pieces based on conditions
5. The final result is a 3D mesh with textures mapped to its faces

This data-driven approach allows for immense flexibility while keeping the actual rendering relatively simple – most blocks are just collections of textured cuboids arranged and rotated in specific ways.