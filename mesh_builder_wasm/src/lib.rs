//! High-performance WASM mesh builder for voxel geometry merging
//! 
//! This module provides Rust implementations of geometry merging and face culling
//! that are significantly faster than the JavaScript equivalents.

use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Array, Object, Reflect};

// Constants matching the JavaScript implementation
const POSITION_SCALE: f32 = 1024.0;
const NORMAL_SCALE: f32 = 127.0;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
    
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}

/// Initialize the WASM module with better panic messages
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Palette geometry entry - stores precomputed geometry for a block type
#[wasm_bindgen]
pub struct PaletteEntry {
    index: u32,
    occlusion_flags: u32,
    // Geometry data stored as flat arrays
    positions: Vec<f32>,      // [x, y, z, x, y, z, ...]
    normals: Vec<f32>,        // [nx, ny, nz, ...]
    uvs: Vec<f32>,            // [u, v, u, v, ...]
    indices: Vec<u32>,        // Triangle indices
    material_index: u32,
    vertex_count: u32,
}

#[wasm_bindgen]
impl PaletteEntry {
    #[wasm_bindgen(constructor)]
    pub fn new(
        index: u32,
        occlusion_flags: u32,
        positions: Float32Array,
        normals: Float32Array,
        uvs: Float32Array,
        indices: Uint32Array,
        material_index: u32,
    ) -> PaletteEntry {
        PaletteEntry {
            index,
            occlusion_flags,
            positions: positions.to_vec(),
            normals: normals.to_vec(),
            uvs: uvs.to_vec(),
            indices: indices.to_vec(),
            material_index,
            vertex_count: (positions.length() / 3) as u32,
        }
    }
}

/// Main mesh builder that holds palette data and performs chunk building
#[wasm_bindgen]
pub struct MeshBuilder {
    palette: Vec<Option<PaletteEntryData>>,
    // Accumulators for batch mode - one per category
    accumulators: std::collections::HashMap<String, GeometryAccumulator>,
    batch_mode: bool,
}

/// Internal palette entry data (not exposed to JS)
struct PaletteEntryData {
    occlusion_flags: u32,
    geometries: Vec<GeometryData>,
    category: String,
}

struct GeometryData {
    positions: Vec<f32>,
    normals: Vec<f32>,
    uvs: Vec<f32>,
    indices: Vec<u32>,
    material_index: u32,
}

/// Accumulator for batch mode - collects geometry across multiple chunks
struct GeometryAccumulator {
    positions: Vec<i16>,
    normals: Vec<i8>,
    uvs: Vec<f32>,
    indices: Vec<u32>,
    groups: Vec<(u32, u32, u32)>, // (start, count, materialIndex)
    vertex_count: u32,
    index_count: u32,
}

#[wasm_bindgen]
impl MeshBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MeshBuilder {
        MeshBuilder {
            palette: Vec::new(),
            accumulators: std::collections::HashMap::new(),
            batch_mode: false,
        }
    }
    
    /// Enable batch mode - chunks will be accumulated instead of returned immediately
    #[wasm_bindgen]
    pub fn start_batch(&mut self) {
        self.batch_mode = true;
        self.accumulators.clear();
    }
    
    /// Disable batch mode and return all accumulated geometry
    #[wasm_bindgen]
    pub fn finish_batch(&mut self) -> Result<JsValue, JsValue> {
        self.batch_mode = false;
        
        let results = Array::new();
        
        for (category, acc) in &self.accumulators {
            if acc.vertex_count == 0 {
                continue;
            }
            
            // Create JS typed arrays
            let positions_arr = Int16Array::new_with_length(acc.positions.len() as u32);
            positions_arr.copy_from(&acc.positions);
            
            let normals_arr = Int8Array::new_with_length(acc.normals.len() as u32);
            normals_arr.copy_from(&acc.normals);
            
            let uvs_arr = Float32Array::new_with_length(acc.uvs.len() as u32);
            uvs_arr.copy_from(&acc.uvs);
            
            // Use 32-bit indices for large batches
            let indices_arr: JsValue = if acc.vertex_count > 65535 {
                let arr = Uint32Array::new_with_length(acc.indices.len() as u32);
                arr.copy_from(&acc.indices);
                arr.into()
            } else {
                let arr = Uint16Array::new_with_length(acc.indices.len() as u32);
                let indices_u16: Vec<u16> = acc.indices.iter().map(|&x| x as u16).collect();
                arr.copy_from(&indices_u16);
                arr.into()
            };
            
            // Create groups array
            let groups_arr = Array::new();
            for (start, count, mat_index) in &acc.groups {
                let group_obj = Object::new();
                Reflect::set(&group_obj, &"start".into(), &JsValue::from(*start)).ok();
                Reflect::set(&group_obj, &"count".into(), &JsValue::from(*count)).ok();
                Reflect::set(&group_obj, &"materialIndex".into(), &JsValue::from(*mat_index)).ok();
                groups_arr.push(&group_obj);
            }
            
            let result = Object::new();
            Reflect::set(&result, &"category".into(), &JsValue::from_str(category)).ok();
            Reflect::set(&result, &"positions".into(), &positions_arr).ok();
            Reflect::set(&result, &"normals".into(), &normals_arr).ok();
            Reflect::set(&result, &"uvs".into(), &uvs_arr).ok();
            Reflect::set(&result, &"indices".into(), &indices_arr).ok();
            Reflect::set(&result, &"groups".into(), &groups_arr).ok();
            Reflect::set(&result, &"vertexCount".into(), &JsValue::from(acc.vertex_count)).ok();
            
            results.push(&result);
        }
        
        self.accumulators.clear();
        
        let output = Object::new();
        Reflect::set(&output, &"meshes".into(), &results).ok();
        Reflect::set(&output, &"origin".into(), &Array::of3(&0.into(), &0.into(), &0.into())).ok();
        
        Ok(output.into())
    }
    
    /// Clear accumulators without returning data
    #[wasm_bindgen]
    pub fn clear_batch(&mut self) {
        self.accumulators.clear();
        self.batch_mode = false;
    }
    
    /// Get batch mode status
    #[wasm_bindgen]
    pub fn is_batch_mode(&self) -> bool {
        self.batch_mode
    }

    /// Update palette with geometry data from JavaScript
    /// palette_data is an array of objects with: { index, occlusionFlags, category, geometries: [...] }
    #[wasm_bindgen]
    pub fn update_palette(&mut self, palette_data: &Array) {
        // Clear and resize palette
        self.palette.clear();
        
        for i in 0..palette_data.length() {
            let item = palette_data.get(i);
            if let Ok(obj) = item.dyn_into::<Object>() {
                let index = Reflect::get(&obj, &"index".into())
                    .ok()
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as usize;
                
                let occlusion_flags = Reflect::get(&obj, &"occlusionFlags".into())
                    .ok()
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as u32;
                
                let category = Reflect::get(&obj, &"category".into())
                    .ok()
                    .and_then(|v| v.as_string())
                    .unwrap_or_else(|| "solid".to_string());
                
                // Ensure palette is large enough
                while self.palette.len() <= index {
                    self.palette.push(None);
                }
                
                // Parse geometries array
                let mut geometries = Vec::new();
                if let Ok(geoms_val) = Reflect::get(&obj, &"geometries".into()) {
                    if let Ok(geoms_arr) = geoms_val.dyn_into::<Array>() {
                        for j in 0..geoms_arr.length() {
                            if let Ok(geom_obj) = geoms_arr.get(j).dyn_into::<Object>() {
                                let positions = Self::get_float32_array(&geom_obj, "positions");
                                let normals = Self::get_float32_array(&geom_obj, "normals");
                                let uvs = Self::get_float32_array(&geom_obj, "uvs");
                                let indices = Self::get_uint_array(&geom_obj, "indices");
                                let material_index = Reflect::get(&geom_obj, &"materialIndex".into())
                                    .ok()
                                    .and_then(|v| v.as_f64())
                                    .unwrap_or(0.0) as u32;
                                
                                geometries.push(GeometryData {
                                    positions,
                                    normals,
                                    uvs,
                                    indices,
                                    material_index,
                                });
                            }
                        }
                    }
                }
                
                self.palette[index] = Some(PaletteEntryData {
                    occlusion_flags,
                    geometries,
                    category,
                });
            }
        }
    }

    fn get_float32_array(obj: &Object, key: &str) -> Vec<f32> {
        Reflect::get(obj, &key.into())
            .ok()
            .and_then(|v| v.dyn_into::<Float32Array>().ok())
            .map(|arr| arr.to_vec())
            .unwrap_or_default()
    }

    fn get_uint_array(obj: &Object, key: &str) -> Vec<u32> {
        if let Ok(val) = Reflect::get(obj, &key.into()) {
            // Try Uint32Array first
            if let Ok(arr) = val.clone().dyn_into::<Uint32Array>() {
                return arr.to_vec();
            }
            // Fall back to Uint16Array
            if let Ok(arr) = val.dyn_into::<Uint16Array>() {
                return arr.to_vec().into_iter().map(|x| x as u32).collect();
            }
        }
        Vec::new()
    }

    /// Build a chunk mesh from block data
    /// 
    /// blocks: Int32Array with [x, y, z, paletteIndex] for each block
    /// chunk_origin: [originX, originY, originZ]
    /// 
    /// Returns a JavaScript object with the merged mesh data
    #[wasm_bindgen]
    pub fn build_chunk(
        &self,
        blocks: &Int32Array,
        origin_x: i32,
        origin_y: i32,
        origin_z: i32,
    ) -> Result<JsValue, JsValue> {
        let blocks_vec = blocks.to_vec();
        let block_count = blocks_vec.len() / 4;
        
        if block_count == 0 {
            return Ok(Self::create_empty_result());
        }
        
        // Calculate bounds
        let (min_x, min_y, min_z, max_x, max_y, max_z) = self.calculate_bounds(&blocks_vec);
        
        let size_x = (max_x - min_x + 1) as usize;
        let size_y = (max_y - min_y + 1) as usize;
        let size_z = (max_z - min_z + 1) as usize;
        
        // Build voxel map with padding
        let pad = 1usize;
        let stride_y = size_x + 2 * pad;
        let stride_z = (size_x + 2 * pad) * (size_y + 2 * pad);
        let map_size = stride_z * (size_z + 2 * pad);
        
        let mut voxel_map = vec![0i32; map_size];
        
        // Helper to get index in voxel map
        let get_index = |x: i32, y: i32, z: i32| -> usize {
            let lx = (x - min_x) as usize + pad;
            let ly = (y - min_y) as usize + pad;
            let lz = (z - min_z) as usize + pad;
            lx + ly * stride_y + lz * stride_z
        };
        
        // Populate voxel map
        for i in 0..block_count {
            let base = i * 4;
            let x = blocks_vec[base];
            let y = blocks_vec[base + 1];
            let z = blocks_vec[base + 2];
            let palette_idx = blocks_vec[base + 3];
            voxel_map[get_index(x, y, z)] = palette_idx + 1; // +1 so 0 means empty
        }
        
        // Group blocks by category and palette index
        let mut category_batches: std::collections::HashMap<String, std::collections::HashMap<u32, Vec<usize>>> = 
            std::collections::HashMap::new();
        
        for i in 0..block_count {
            let base = i * 4;
            let palette_idx = blocks_vec[base + 3] as u32;
            
            if let Some(Some(palette_entry)) = self.palette.get(palette_idx as usize) {
                let category = &palette_entry.category;
                
                category_batches
                    .entry(category.clone())
                    .or_default()
                    .entry(palette_idx)
                    .or_default()
                    .push(i);
            }
        }
        
        // Process each category and merge geometries
        let results = Array::new();
        
        for (category, palette_map) in category_batches {
            let merged = self.merge_category_geometries(
                &category,
                &palette_map,
                &blocks_vec,
                &voxel_map,
                &get_index,
                origin_x,
                origin_y,
                origin_z,
                min_x,
                min_y,
                min_z,
            );
            
            if let Some(mesh_data) = merged {
                results.push(&mesh_data);
            }
        }
        
        // Create result object
        let result = Object::new();
        Reflect::set(&result, &"meshes".into(), &results)?;
        
        let origin = Array::new();
        origin.push(&JsValue::from(origin_x));
        origin.push(&JsValue::from(origin_y));
        origin.push(&JsValue::from(origin_z));
        Reflect::set(&result, &"origin".into(), &origin)?;
        
        Ok(result.into())
    }

    fn calculate_bounds(&self, blocks: &[i32]) -> (i32, i32, i32, i32, i32, i32) {
        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut min_z = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;
        let mut max_z = i32::MIN;
        
        let block_count = blocks.len() / 4;
        for i in 0..block_count {
            let base = i * 4;
            let x = blocks[base];
            let y = blocks[base + 1];
            let z = blocks[base + 2];
            
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            min_z = min_z.min(z);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
            max_z = max_z.max(z);
        }
        
        (min_x, min_y, min_z, max_x, max_y, max_z)
    }

    fn merge_category_geometries<F>(
        &self,
        category: &str,
        palette_map: &std::collections::HashMap<u32, Vec<usize>>,
        blocks: &[i32],
        voxel_map: &[i32],
        get_index: &F,
        origin_x: i32,
        origin_y: i32,
        origin_z: i32,
        _min_x: i32,
        _min_y: i32,
        _min_z: i32,
    ) -> Option<JsValue>
    where
        F: Fn(i32, i32, i32) -> usize,
    {
        // First pass: count total vertices and indices needed
        let mut total_verts = 0usize;
        let mut total_indices = 0usize;
        
        // Collect all geometry instances to process
        let mut instances: Vec<(i32, i32, i32, &GeometryData, u32)> = Vec::new();
        
        // Sort palette indices for consistent ordering
        let mut sorted_palette_indices: Vec<_> = palette_map.keys().collect();
        sorted_palette_indices.sort();
        
        for &palette_idx in &sorted_palette_indices {
            if let Some(Some(palette_entry)) = self.palette.get(*palette_idx as usize) {
                if let Some(block_indices) = palette_map.get(palette_idx) {
                    for &block_idx in block_indices {
                        let base = block_idx * 4;
                        let x = blocks[base];
                        let y = blocks[base + 1];
                        let z = blocks[base + 2];
                        
                        for geom in &palette_entry.geometries {
                            let vert_count = geom.positions.len() / 3;
                            total_verts += vert_count;
                            total_indices += geom.indices.len();
                            instances.push((x, y, z, geom, palette_entry.occlusion_flags));
                        }
                    }
                }
            }
        }
        
        if total_verts == 0 {
            return None;
        }
        
        // Allocate output buffers
        let mut merged_positions: Vec<i16> = Vec::with_capacity(total_verts * 3);
        let mut merged_normals: Vec<i8> = Vec::with_capacity(total_verts * 3);
        let mut merged_uvs: Vec<f32> = Vec::with_capacity(total_verts * 2);
        let mut merged_indices: Vec<u32> = Vec::with_capacity(total_indices);
        
        let mut groups: Vec<(u32, u32, u32)> = Vec::new(); // (start, count, materialIndex)
        let mut current_group: Option<(u32, u32, u32)> = None;
        let mut v_offset = 0u32;
        
        // Process each geometry instance
        for (px, py, pz, geom, occlusion_flags) in instances {
            let num_local_verts = geom.positions.len() / 3;
            
            // Perform face culling - collect valid indices
            let mut valid_indices: Vec<u32> = Vec::new();
            
            let local_indices = &geom.indices;
            let mut j = 0;
            while j < local_indices.len() {
                let idx0 = local_indices[j] as usize;
                let idx1 = local_indices[j + 1] as usize;
                let idx2 = local_indices[j + 2] as usize;
                
                let mut is_visible = true;
                
                // Get face normal from first vertex
                if geom.normals.len() > idx0 * 3 + 2 {
                    let nx = geom.normals[idx0 * 3];
                    let ny = geom.normals[idx0 * 3 + 1];
                    let nz = geom.normals[idx0 * 3 + 2];
                    
                    let dx = nx.round() as i32;
                    let dy = ny.round() as i32;
                    let dz = nz.round() as i32;
                    
                    // Only cull axis-aligned faces
                    if dx.abs() + dy.abs() + dz.abs() == 1 {
                        // Check if face is flush with block edge
                        let v0x = geom.positions[idx0 * 3];
                        let v0y = geom.positions[idx0 * 3 + 1];
                        let v0z = geom.positions[idx0 * 3 + 2];
                        
                        const EPSILON: f32 = 0.01;
                        let is_flush = match (dx, dy, dz) {
                            (1, 0, 0) => (v0x - 1.0).abs() < EPSILON || (v0x - 0.5).abs() < EPSILON,
                            (-1, 0, 0) => v0x.abs() < EPSILON || (v0x + 0.5).abs() < EPSILON,
                            (0, 1, 0) => (v0y - 1.0).abs() < EPSILON || (v0y - 0.5).abs() < EPSILON,
                            (0, -1, 0) => v0y.abs() < EPSILON || (v0y + 0.5).abs() < EPSILON,
                            (0, 0, 1) => (v0z - 1.0).abs() < EPSILON || (v0z - 0.5).abs() < EPSILON,
                            (0, 0, -1) => v0z.abs() < EPSILON || (v0z + 0.5).abs() < EPSILON,
                            _ => false,
                        };
                        
                        if is_flush {
                            // Check neighbor
                            let neighbor_idx = get_index(px + dx, py + dy, pz + dz);
                            let neighbor_val = voxel_map[neighbor_idx];
                            
                            if neighbor_val > 0 {
                                let neighbor_palette_idx = (neighbor_val - 1) as usize;
                                if let Some(Some(neighbor_entry)) = self.palette.get(neighbor_palette_idx) {
                                    // Map direction to face index for occlusion check
                                    let neighbor_face_index = match (dx, dy, dz) {
                                        (1, 0, 0) => 0,  // West face of neighbor
                                        (-1, 0, 0) => 1, // East face of neighbor
                                        (0, 1, 0) => 2,  // Down face of neighbor
                                        (0, -1, 0) => 3, // Up face of neighbor
                                        (0, 0, 1) => 4,  // North face of neighbor
                                        (0, 0, -1) => 5, // South face of neighbor
                                        _ => 6,
                                    };
                                    
                                    if neighbor_face_index < 6 {
                                        if (neighbor_entry.occlusion_flags & (1 << neighbor_face_index)) != 0 {
                                            is_visible = false;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                if is_visible {
                    valid_indices.push(local_indices[j]);
                    valid_indices.push(local_indices[j + 1]);
                    valid_indices.push(local_indices[j + 2]);
                }
                
                j += 3;
            }
            
            if valid_indices.is_empty() {
                continue;
            }
            
            // Copy vertex data with position quantization
            for v in 0..num_local_verts {
                // Position relative to chunk origin
                let rx = (px - origin_x) as f32 + geom.positions[v * 3];
                let ry = (py - origin_y) as f32 + geom.positions[v * 3 + 1];
                let rz = (pz - origin_z) as f32 + geom.positions[v * 3 + 2];
                
                // Quantize
                merged_positions.push((rx * POSITION_SCALE) as i16);
                merged_positions.push((ry * POSITION_SCALE) as i16);
                merged_positions.push((rz * POSITION_SCALE) as i16);
                
                // Normals
                if geom.normals.len() > v * 3 + 2 {
                    merged_normals.push((geom.normals[v * 3] * NORMAL_SCALE) as i8);
                    merged_normals.push((geom.normals[v * 3 + 1] * NORMAL_SCALE) as i8);
                    merged_normals.push((geom.normals[v * 3 + 2] * NORMAL_SCALE) as i8);
                } else {
                    merged_normals.push(0);
                    merged_normals.push(127);
                    merged_normals.push(0);
                }
                
                // UVs
                if geom.uvs.len() > v * 2 + 1 {
                    merged_uvs.push(geom.uvs[v * 2]);
                    merged_uvs.push(geom.uvs[v * 2 + 1]);
                } else {
                    merged_uvs.push(0.0);
                    merged_uvs.push(0.0);
                }
            }
            
            // Copy indices with offset
            let index_start = merged_indices.len() as u32;
            for idx in &valid_indices {
                merged_indices.push(*idx + v_offset);
            }
            
            // Update material groups
            let mat_index = geom.material_index;
            let index_count = valid_indices.len() as u32;
            
            match &mut current_group {
                Some((start, count, current_mat)) if *current_mat == mat_index => {
                    *count += index_count;
                }
                Some(group) => {
                    groups.push(*group);
                    current_group = Some((index_start, index_count, mat_index));
                }
                None => {
                    current_group = Some((index_start, index_count, mat_index));
                }
            }
            
            v_offset += num_local_verts as u32;
        }
        
        if let Some(group) = current_group {
            groups.push(group);
        }
        
        // Create JavaScript typed arrays from our data
        let positions_arr = Int16Array::new_with_length(merged_positions.len() as u32);
        positions_arr.copy_from(&merged_positions);
        
        let normals_arr = Int8Array::new_with_length(merged_normals.len() as u32);
        normals_arr.copy_from(&merged_normals);
        
        let uvs_arr = Float32Array::new_with_length(merged_uvs.len() as u32);
        uvs_arr.copy_from(&merged_uvs);
        
        let indices_arr = if v_offset > 65535 {
            let arr = Uint32Array::new_with_length(merged_indices.len() as u32);
            arr.copy_from(&merged_indices);
            arr.into()
        } else {
            let arr = Uint16Array::new_with_length(merged_indices.len() as u32);
            let indices_u16: Vec<u16> = merged_indices.iter().map(|&x| x as u16).collect();
            arr.copy_from(&indices_u16);
            arr.into()
        };
        
        // Create groups array
        let groups_arr = Array::new();
        for (start, count, mat_index) in groups {
            let group_obj = Object::new();
            Reflect::set(&group_obj, &"start".into(), &JsValue::from(start)).ok();
            Reflect::set(&group_obj, &"count".into(), &JsValue::from(count)).ok();
            Reflect::set(&group_obj, &"materialIndex".into(), &JsValue::from(mat_index)).ok();
            groups_arr.push(&group_obj);
        }
        
        // Create result object
        let result = Object::new();
        Reflect::set(&result, &"category".into(), &JsValue::from_str(category)).ok();
        Reflect::set(&result, &"positions".into(), &positions_arr).ok();
        Reflect::set(&result, &"normals".into(), &normals_arr).ok();
        Reflect::set(&result, &"uvs".into(), &uvs_arr).ok();
        Reflect::set(&result, &"indices".into(), &indices_arr).ok();
        Reflect::set(&result, &"groups".into(), &groups_arr).ok();
        
        Some(result.into())
    }

    fn create_empty_result() -> JsValue {
        let result = Object::new();
        Reflect::set(&result, &"meshes".into(), &Array::new()).ok();
        let origin = Array::new();
        origin.push(&JsValue::from(0));
        origin.push(&JsValue::from(0));
        origin.push(&JsValue::from(0));
        Reflect::set(&result, &"origin".into(), &origin).ok();
        result.into()
    }
}

/// Get the version of the mesh builder
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
