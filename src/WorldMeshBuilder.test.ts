import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock problematic imports BEFORE they are used/imported by other modules
vi.mock('nucleation-wasm', () => ({ default: 'mock-wasm' }));
vi.mock('./wasm/minecraft_schematic_utils_bg.wasm', () => ({ default: 'mock-utils-wasm' }));
vi.mock('nucleation', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  SchematicWrapper: class { }
}));
vi.mock('./workers/MeshBuilder.worker?worker&inline', () => ({
  default: class MockWorker {
    postMessage() { }
    terminate() { }
    onmessage = null;
  }
}));

import { WorldMeshBuilder } from './WorldMeshBuilder';
import { SchematicRenderer } from './SchematicRenderer';
import { Cubane } from 'cubane';

// Mock dependencies
vi.mock('./SchematicRenderer');
vi.mock('cubane', () => {
  return {
    Cubane: class MockCubane {
      getBlockMesh = vi.fn().mockResolvedValue(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
      getBlockOptimizationData = vi.fn().mockResolvedValue({
        cullableFaces: new Map(),
        nonCullableFaces: [],
        hasTransparency: false
      });
    }
  };
});
vi.mock('./managers/SchematicObject');
vi.mock('./MaterialRegistry');
vi.mock('./InstancedBlockRenderer');

describe('WorldMeshBuilder', () => {
  let builder: WorldMeshBuilder;
  let mockRenderer: any;
  let mockCubane: any;

  beforeEach(() => {
    mockRenderer = new SchematicRenderer({} as any);
    mockCubane = new Cubane();
    builder = new WorldMeshBuilder(mockRenderer, mockCubane);
  });

  it('should be defined', () => {
    expect(builder).toBeDefined();
  });

  it('should handle chunk size configuration', () => {
    expect(builder.getChunkSize()).toBe(16); // Default
    builder.setChunkSize(32);
    expect(builder.getChunkSize()).toBe(32);
  });

  it('should validate chunk size', () => {
    expect(() => builder.setChunkSize(0)).toThrow();
    expect(() => builder.setChunkSize(128)).toThrow();
  });
});
