// SchematicRendererOptions.ts

import { InteractionManagerOptions } from './managers/InteractionManager';
import { DragAndDropManagerOptions } from './managers/DragAndDropManager';
import { GizmoManagerOptions } from './managers/GizmoManager';
import { CameraManagerOptions } from './managers/CameraManager';
import { SelectableObject } from './managers/SelectableObject';

export interface SchematicRendererOptions {
  // Global toggles for enabling/disabling functionalities
  enableInteraction?: boolean;
  enableDragAndDrop?: boolean;
  enableGizmos?: boolean;
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

export interface Callbacks {
  onRendererInitialized?: () => void;
  onSchematicLoaded?: (schematicName: string) => void;
  onObjectSelected?: (object: SelectableObject) => void;
  onObjectDeselected?: (object: SelectableObject) => void;
  // Add other callbacks as needed
}
