// SchematicRendererOptions.ts

import { InteractionManagerOptions } from './managers/InteractionManager';
import { DragAndDropManagerOptions } from './managers/DragAndDropManager';
import { GizmoManagerOptions } from './managers/GizmoManager';
import { CameraManagerOptions } from './managers/CameraManager';
import { SelectableObject } from './managers/SelectableObject';

export interface SchematicRendererOptions {
  hdri?: string;
  resourcePackBlobs?: any;
  ffmpeg?: any;
  gamma?: number;
  // Global toggles for enabling/disabling functionalities
  enableInteraction?: boolean;
  enableDragAndDrop?: boolean;
  enableGizmos?: boolean;
  showGrid?: boolean;
  showAxes?: boolean;
  showCameraPathVisualization?: boolean;
  // Enable auto-orbit around default camera path
  enableAutoOrbit?: boolean;
  // Auto-orbit speed in seconds for a full rotation (higher = slower)
  autoOrbitDuration?: number;
  // Enable single schematic mode (only one schematic can be loaded at a time)
  singleSchematicMode?: boolean;
  // Options for individual managers
  interactionOptions?: InteractionManagerOptions;
  dragAndDropOptions?: DragAndDropManagerOptions;
  gizmoOptions?: GizmoManagerOptions;
  cameraOptions?: CameraManagerOptions;
  // Callbacks for lifecycle events
  callbacks?: Callbacks;
  // Additional options can be added here
}

export const DEFAULT_OPTIONS: SchematicRendererOptions = {
  hdri: '',
  gamma: 0.5,
  showCameraPathVisualization: false,
  enableAutoOrbit: false,
  autoOrbitDuration: 10,
  enableInteraction: false,
  enableDragAndDrop: false,
  enableGizmos: false,
  showGrid: false,
  showAxes: false,
  callbacks: {},
  interactionOptions: {
      enableSelection: false,
      enableMovingSchematics: false,
  },
  dragAndDropOptions: {
      acceptedFileTypes: [],
  },
  gizmoOptions: {
      enableRotation: false,
      enableScaling: false,
  },
  cameraOptions: {
      position: [5, 5, 5],
  },
  resourcePackBlobs: {},
};

export interface Callbacks {
  // Renderer lifecycle callbacks
  onRendererInitialized?: () => void;
  
  // Schematic callbacks
  onSchematicRendered?: (schematicName: string) => void;
  onSchematicLoaded?: (schematicName: string) => void;
  onSchematicDropped?: (file: File) => void | Promise<void>;
  onSchematicDropSuccess?: (file: File) => void | Promise<void>;
  onSchematicDropFailed?: (file: File, error: Error) => void | Promise<void>;
  
  // Resource pack callbacks
  onResourcePackLoaded?: (packName: string) => void | Promise<void>;
  onResourcePackDropped?: (file: File) => void | Promise<void>;
  onResourcePackDropSuccess?: (file: File) => void | Promise<void>;
  onResourcePackDropFailed?: (file: File, error: Error) => void | Promise<void>;
  
  // Interaction callbacks
  onObjectSelected?: (object: SelectableObject) => void;
  onObjectDeselected?: (object: SelectableObject) => void;
  
  // File handling callbacks
  onInvalidFileType?: (file: File) => void | Promise<void>;
  onLoadingProgress?: (file: File, progress: number) => void | Promise<void>;
  
}