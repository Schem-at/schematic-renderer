// SchematicRendererOptions.ts

import { InteractionManagerOptions } from './managers/InteractionManager';
import { DragAndDropManagerOptions } from './managers/DragAndDropManager';
import { GizmoManagerOptions } from './managers/GizmoManager';
import { CameraManagerOptions } from './managers/CameraManager';
import { SelectableObject } from './managers/SelectableObject';

export interface SchematicRendererOptions {
  hdri?: string;
  resourcePackBlobs?: any;
  gamma?: number;
  // Global toggles for enabling/disabling functionalities
  enableInteraction?: boolean;
  enableDragAndDrop?: boolean;
  enableGizmos?: boolean;
  showGrid?: boolean;
  showAxes?: boolean;
  showCameraPathVisualization?: boolean;
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
  onRendererInitialized?: () => void;
  onSchematicLoaded?: (schematicName: string) => void;
  onObjectSelected?: (object: SelectableObject) => void;
  onObjectDeselected?: (object: SelectableObject) => void;
  onSchematicDropped?: (file: File) => void | Promise<void>;
  onSchematicDropSuccess?: (file: File) => void | Promise<void>;
  onSchematicDropFailed?: (file: File, error: Error) => void | Promise<void>;
  onInvalidFileType?: (file: File) => void | Promise<void>;
  // Add other callbacks as needed
}
