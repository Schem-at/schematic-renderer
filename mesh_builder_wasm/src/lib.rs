//! High-performance WASM mesh builder for voxel geometry merging
//! 
//! This module provides Rust implementations of geometry merging and face culling
//! that are significantly faster than the JavaScript equivalents.
//!
//! Includes greedy meshing to merge coplanar faces into larger quads.

use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Array, Object, Reflect};
use std::collections::HashMap;

// Constants matching the JavaScript implementation
const POSITION_SCALE: f32 = 1024.0;
const NORMAL_SCALE: f32 = 127.0;

/// Face direction for greedy meshing
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
enum FaceDir {
    PosX = 0, // East  (+X)
    NegX = 1, // West  (-X)
    PosY = 2, // Up    (+Y)
    NegY = 3, // Down  (-Y)
    PosZ = 4, // South (+Z)
    NegZ = 5, // North (-Z)
}

impl FaceDir {
    fn normal(&self) -> (f32, f32, f32) {
        match self {
            FaceDir::PosX => (1.0, 0.0, 0.0),
            FaceDir::NegX => (-1.0, 0.0, 0.0),
            FaceDir::PosY => (0.0, 1.0, 0.0),
            FaceDir::NegY => (0.0, -1.0, 0.0),
            FaceDir::PosZ => (0.0, 0.0, 1.0),
            FaceDir::NegZ => (0.0, 0.0, -1.0),
        }
    }
    
    fn delta(&self) -> (i32, i32, i32) {
        match self {
            FaceDir::PosX => (1, 0, 0),
            FaceDir::NegX => (-1, 0, 0),
            FaceDir::PosY => (0, 1, 0),
            FaceDir::NegY => (0, -1, 0),
            FaceDir::PosZ => (0, 0, 1),
            FaceDir::NegZ => (0, 0, -1),
        }
    }
    
    /// Get the face index for occlusion flags (matches the existing convention)
    fn occlusion_face_index(&self) -> u32 {
        match self {
            FaceDir::PosX => 1, // East
            FaceDir::NegX => 0, // West
            FaceDir::PosY => 3, // Up
            FaceDir::NegY => 2, // Down
            FaceDir::PosZ => 5, // South
            FaceDir::NegZ => 4, // North
        }
    }
    
    /// Get the opposite face index for checking neighbor occlusion
    fn opposite_occlusion_index(&self) -> u32 {
        match self {
            FaceDir::PosX => 0, // West face of neighbor
            FaceDir::NegX => 1, // East face of neighbor
            FaceDir::PosY => 2, // Down face of neighbor
            FaceDir::NegY => 3, // Up face of neighbor
            FaceDir::PosZ => 4, // North face of neighbor
            FaceDir::NegZ => 5, // South face of neighbor
        }
    }
}

/// A face to be potentially merged in greedy meshing
#[derive(Clone)]
struct GreedyFace {
    // Block position
    bx: i32,
    by: i32,
    bz: i32,
    // Material index for grouping
    material_index: u32,
    // UV region from the original texture (for tiling)
    uv_min: (f32, f32),
    uv_max: (f32, f32),
}

/// A merged quad from greedy meshing
struct MergedQuad {
    // Starting position
    x: i32,
    y: i32,
    z: i32,
    // Size in the two axes perpendicular to normal
    width: i32,
    height: i32,
}

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
    
    /// Build a chunk mesh with greedy meshing optimization
    /// 
    /// This merges coplanar faces of the same material into larger quads,
    /// dramatically reducing vertex count for large flat surfaces.
    #[wasm_bindgen]
    pub fn build_chunk_greedy(
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
        let stride_z = stride_y * (size_y + 2 * pad);
        let map_size = stride_z * (size_z + 2 * pad);
        
        let mut voxel_map = vec![0i32; map_size];
        
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
            voxel_map[get_index(x, y, z)] = palette_idx + 1;
        }
        
        // Collect visible faces grouped by direction and material
        // Key: (direction, material_index), Value: list of faces
        let mut face_groups: HashMap<(FaceDir, u32), Vec<GreedyFace>> = HashMap::new();
        
        let directions = [
            FaceDir::PosX, FaceDir::NegX,
            FaceDir::PosY, FaceDir::NegY,
            FaceDir::PosZ, FaceDir::NegZ,
        ];
        
        // For each block, check each face direction
        for i in 0..block_count {
            let base = i * 4;
            let bx = blocks_vec[base];
            let by = blocks_vec[base + 1];
            let bz = blocks_vec[base + 2];
            let palette_idx = blocks_vec[base + 3] as usize;
            
            let palette_entry = match self.palette.get(palette_idx) {
                Some(Some(entry)) => entry,
                _ => continue,
            };
            
            // Skip non-solid blocks for greedy meshing (they have complex geometry)
            if palette_entry.category != "solid" {
                continue;
            }
            
            // Get material index from first geometry (assuming solid blocks have one material)
            let material_index = palette_entry.geometries
                .first()
                .map(|g| g.material_index)
                .unwrap_or(0);
            
            for &dir in &directions {
                let (dx, dy, dz) = dir.delta();
                let neighbor_idx = get_index(bx + dx, by + dy, bz + dz);
                let neighbor_val = voxel_map[neighbor_idx];
                
                // Check if this face is visible (no occluding neighbor)
                let is_visible = if neighbor_val > 0 {
                    let neighbor_palette_idx = (neighbor_val - 1) as usize;
                    if let Some(Some(neighbor_entry)) = self.palette.get(neighbor_palette_idx) {
                        // Check if neighbor occludes this face
                        let opp_face_idx = dir.opposite_occlusion_index();
                        (neighbor_entry.occlusion_flags & (1 << opp_face_idx)) == 0
                    } else {
                        true
                    }
                } else {
                    true // No neighbor = visible
                };
                
                if is_visible {
                    let key = (dir, material_index);
                    face_groups.entry(key).or_default().push(GreedyFace {
                        bx, by, bz,
                        material_index,
                        // Standard unit quad UVs - will be scaled based on merged size
                        uv_min: (0.0, 0.0),
                        uv_max: (1.0, 1.0),
                    });
                }
            }
        }
        
        // Now perform greedy meshing for each face group
        let mut merged_positions: Vec<i16> = Vec::new();
        let mut merged_normals: Vec<i8> = Vec::new();
        let mut merged_uvs: Vec<f32> = Vec::new();
        let mut merged_indices: Vec<u32> = Vec::new();
        let mut groups: Vec<(u32, u32, u32)> = Vec::new();
        let mut current_group: Option<(u32, u32, u32)> = None;
        let mut v_offset = 0u32;
        
        for ((dir, material_index), faces) in &face_groups {
            if faces.is_empty() {
                continue;
            }
            
            // Run greedy meshing for this direction + material combo
            let merged_quads = self.greedy_merge_faces(*dir, faces, min_x, min_y, min_z, max_x, max_y, max_z);
            
            let (nx, ny, nz) = dir.normal();
            let nx_i8 = (nx * NORMAL_SCALE) as i8;
            let ny_i8 = (ny * NORMAL_SCALE) as i8;
            let nz_i8 = (nz * NORMAL_SCALE) as i8;
            
            for quad in &merged_quads {
                // Generate 4 vertices for the quad
                let (v0, v1, v2, v3) = self.quad_vertices(*dir, quad);
                
                // Add vertices relative to origin
                let index_start = merged_indices.len() as u32;
                
                for (vx, vy, vz, u, v) in &[(v0.0, v0.1, v0.2, 0.0f32, 0.0f32),
                                             (v1.0, v1.1, v1.2, quad.width as f32, 0.0f32),
                                             (v2.0, v2.1, v2.2, quad.width as f32, quad.height as f32),
                                             (v3.0, v3.1, v3.2, 0.0f32, quad.height as f32)] {
                    let rx = (*vx as f32) - (origin_x as f32);
                    let ry = (*vy as f32) - (origin_y as f32);
                    let rz = (*vz as f32) - (origin_z as f32);
                    
                    merged_positions.push((rx * POSITION_SCALE) as i16);
                    merged_positions.push((ry * POSITION_SCALE) as i16);
                    merged_positions.push((rz * POSITION_SCALE) as i16);
                    
                    merged_normals.push(nx_i8);
                    merged_normals.push(ny_i8);
                    merged_normals.push(nz_i8);
                    
                    // Scale UVs by quad size for tiling
                    merged_uvs.push(*u);
                    merged_uvs.push(*v);
                }
                
                // Two triangles: 0-1-2, 0-2-3
                merged_indices.push(v_offset);
                merged_indices.push(v_offset + 1);
                merged_indices.push(v_offset + 2);
                merged_indices.push(v_offset);
                merged_indices.push(v_offset + 2);
                merged_indices.push(v_offset + 3);
                
                v_offset += 4;
                
                // Update groups
                let index_count = 6u32;
                match &mut current_group {
                    Some((_, count, current_mat)) if *current_mat == *material_index => {
                        *count += index_count;
                    }
                    Some(group) => {
                        groups.push(*group);
                        current_group = Some((index_start, index_count, *material_index));
                    }
                    None => {
                        current_group = Some((index_start, index_count, *material_index));
                    }
                }
            }
        }
        
        if let Some(group) = current_group {
            groups.push(group);
        }
        
        // Also process non-solid blocks with the regular method
        // (transparent, custom geometry blocks, etc.)
        let non_solid_result = self.build_non_solid_blocks(
            &blocks_vec,
            &voxel_map,
            &get_index,
            origin_x, origin_y, origin_z,
            min_x, min_y, min_z,
        );
        
        // Combine results
        let results = Array::new();
        
        // Add greedy-meshed solid geometry
        if !merged_positions.is_empty() {
            let solid_mesh = self.create_mesh_result(
                "solid",
                &merged_positions,
                &merged_normals,
                &merged_uvs,
                &merged_indices,
                &groups,
                v_offset,
            );
            results.push(&solid_mesh);
        }
        
        // Add non-solid geometries
        for mesh in non_solid_result {
            results.push(&mesh);
        }
        
        let result = Object::new();
        Reflect::set(&result, &"meshes".into(), &results)?;
        
        let origin = Array::new();
        origin.push(&JsValue::from(origin_x));
        origin.push(&JsValue::from(origin_y));
        origin.push(&JsValue::from(origin_z));
        Reflect::set(&result, &"origin".into(), &origin)?;
        
        Ok(result.into())
    }
    
    /// Perform greedy meshing on a set of faces with the same direction and material
    fn greedy_merge_faces(
        &self,
        dir: FaceDir,
        faces: &[GreedyFace],
        min_x: i32, min_y: i32, min_z: i32,
        max_x: i32, max_y: i32, max_z: i32,
    ) -> Vec<MergedQuad> {
        let mut result = Vec::new();
        
        // Group faces by their position along the normal axis
        // For PosY/NegY: group by Y, iterate over XZ
        // For PosX/NegX: group by X, iterate over YZ
        // For PosZ/NegZ: group by Z, iterate over XY
        
        let mut layers: HashMap<i32, Vec<(i32, i32)>> = HashMap::new();
        
        for face in faces {
            let (layer, u, v) = match dir {
                FaceDir::PosY | FaceDir::NegY => (face.by, face.bx, face.bz),
                FaceDir::PosX | FaceDir::NegX => (face.bx, face.by, face.bz),
                FaceDir::PosZ | FaceDir::NegZ => (face.bz, face.bx, face.by),
            };
            layers.entry(layer).or_default().push((u, v));
        }
        
        // Get bounds for the 2D grid
        let (u_min, u_max, v_min, v_max) = match dir {
            FaceDir::PosY | FaceDir::NegY => (min_x, max_x, min_z, max_z),
            FaceDir::PosX | FaceDir::NegX => (min_y, max_y, min_z, max_z),
            FaceDir::PosZ | FaceDir::NegZ => (min_x, max_x, min_y, max_y),
        };
        
        let u_size = (u_max - u_min + 1) as usize;
        let v_size = (v_max - v_min + 1) as usize;
        
        // Process each layer
        for (layer, face_coords) in layers {
            // Create 2D mask grid
            let mut mask = vec![false; u_size * v_size];
            
            for (u, v) in &face_coords {
                let ui = (*u - u_min) as usize;
                let vi = (*v - v_min) as usize;
                if ui < u_size && vi < v_size {
                    mask[vi * u_size + ui] = true;
                }
            }
            
            // Greedy algorithm: find rectangles
            for v_idx in 0..v_size {
                let mut u_idx = 0;
                while u_idx < u_size {
                    if !mask[v_idx * u_size + u_idx] {
                        u_idx += 1;
                        continue;
                    }
                    
                    // Found a face, expand width (along u)
                    let mut width = 1;
                    while u_idx + width < u_size && mask[v_idx * u_size + u_idx + width] {
                        width += 1;
                    }
                    
                    // Expand height (along v)
                    let mut height = 1;
                    'height_loop: while v_idx + height < v_size {
                        // Check if entire row is filled
                        for w in 0..width {
                            if !mask[(v_idx + height) * u_size + u_idx + w] {
                                break 'height_loop;
                            }
                        }
                        height += 1;
                    }
                    
                    // Clear the rectangle from mask
                    for h in 0..height {
                        for w in 0..width {
                            mask[(v_idx + h) * u_size + u_idx + w] = false;
                        }
                    }
                    
                    // Convert back to world coordinates
                    let u_world = u_idx as i32 + u_min;
                    let v_world = v_idx as i32 + v_min;
                    
                    let (x, y, z) = match dir {
                        FaceDir::PosY | FaceDir::NegY => (u_world, layer, v_world),
                        FaceDir::PosX | FaceDir::NegX => (layer, u_world, v_world),
                        FaceDir::PosZ | FaceDir::NegZ => (u_world, v_world, layer),
                    };
                    
                    result.push(MergedQuad {
                        x, y, z,
                        width: width as i32,
                        height: height as i32,
                    });
                    
                    u_idx += width;
                }
            }
        }
        
        result
    }
    
    /// Generate the 4 corner vertices for a quad based on direction and merged size
    fn quad_vertices(&self, dir: FaceDir, quad: &MergedQuad) -> ((i32, i32, i32), (i32, i32, i32), (i32, i32, i32), (i32, i32, i32)) {
        let x = quad.x;
        let y = quad.y;
        let z = quad.z;
        let w = quad.width;
        let h = quad.height;
        
        match dir {
            // For +Y face (top of block), we need y+1
            FaceDir::PosY => (
                (x, y + 1, z),
                (x + w, y + 1, z),
                (x + w, y + 1, z + h),
                (x, y + 1, z + h),
            ),
            // For -Y face (bottom of block), at y
            FaceDir::NegY => (
                (x, y, z + h),
                (x + w, y, z + h),
                (x + w, y, z),
                (x, y, z),
            ),
            // For +X face (east), at x+1
            FaceDir::PosX => (
                (x + 1, y, z),
                (x + 1, y, z + h),
                (x + 1, y + w, z + h),
                (x + 1, y + w, z),
            ),
            // For -X face (west), at x
            FaceDir::NegX => (
                (x, y, z + h),
                (x, y, z),
                (x, y + w, z),
                (x, y + w, z + h),
            ),
            // For +Z face (south), at z+1
            FaceDir::PosZ => (
                (x + w, y, z + 1),
                (x, y, z + 1),
                (x, y + h, z + 1),
                (x + w, y + h, z + 1),
            ),
            // For -Z face (north), at z
            FaceDir::NegZ => (
                (x, y, z),
                (x + w, y, z),
                (x + w, y + h, z),
                (x, y + h, z),
            ),
        }
    }
    
    /// Build non-solid blocks (transparent, custom geometry) with regular method
    fn build_non_solid_blocks<F>(
        &self,
        blocks: &[i32],
        voxel_map: &[i32],
        get_index: &F,
        origin_x: i32, origin_y: i32, origin_z: i32,
        _min_x: i32, _min_y: i32, _min_z: i32,
    ) -> Vec<JsValue>
    where
        F: Fn(i32, i32, i32) -> usize,
    {
        let block_count = blocks.len() / 4;
        let mut category_batches: HashMap<String, HashMap<u32, Vec<usize>>> = HashMap::new();
        
        for i in 0..block_count {
            let base = i * 4;
            let palette_idx = blocks[base + 3] as u32;
            
            if let Some(Some(palette_entry)) = self.palette.get(palette_idx as usize) {
                // Skip solid blocks (handled by greedy meshing)
                if palette_entry.category == "solid" {
                    continue;
                }
                
                category_batches
                    .entry(palette_entry.category.clone())
                    .or_default()
                    .entry(palette_idx)
                    .or_default()
                    .push(i);
            }
        }
        
        let mut results = Vec::new();
        
        for (category, palette_map) in category_batches {
            if let Some(mesh) = self.merge_category_geometries(
                &category,
                &palette_map,
                blocks,
                voxel_map,
                get_index,
                origin_x, origin_y, origin_z,
                _min_x, _min_y, _min_z,
            ) {
                results.push(mesh);
            }
        }
        
        results
    }
    
    /// Helper to create mesh result object
    fn create_mesh_result(
        &self,
        category: &str,
        positions: &[i16],
        normals: &[i8],
        uvs: &[f32],
        indices: &[u32],
        groups: &[(u32, u32, u32)],
        vertex_count: u32,
    ) -> JsValue {
        let positions_arr = Int16Array::new_with_length(positions.len() as u32);
        positions_arr.copy_from(positions);
        
        let normals_arr = Int8Array::new_with_length(normals.len() as u32);
        normals_arr.copy_from(normals);
        
        let uvs_arr = Float32Array::new_with_length(uvs.len() as u32);
        uvs_arr.copy_from(uvs);
        
        let indices_arr: JsValue = if vertex_count > 65535 {
            let arr = Uint32Array::new_with_length(indices.len() as u32);
            arr.copy_from(indices);
            arr.into()
        } else {
            let arr = Uint16Array::new_with_length(indices.len() as u32);
            let indices_u16: Vec<u16> = indices.iter().map(|&x| x as u16).collect();
            arr.copy_from(&indices_u16);
            arr.into()
        };
        
        let groups_arr = Array::new();
        for (start, count, mat_index) in groups {
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
        
        result.into()
    }
}

/// Get the version of the mesh builder
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
