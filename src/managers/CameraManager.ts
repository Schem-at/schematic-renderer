// CameraManager.ts
import * as THREE from "three";
import { EventEmitter } from "events";
import { SchematicRenderer } from "../SchematicRenderer";
import { CameraWrapper } from "./CameraWrapper";
import { CameraPath } from '../camera/CameraPath';
import { SceneManager } from "./SceneManager";
import { CameraPathManager } from "./CameraPathManager";
import { EasingFunctions } from '../utils/EasingFunctions';

export interface CameraManagerOptions {
  position?: [number, number, number];
  showCameraPathVisualization?: boolean;
}

export interface CameraAnimationOptions {
  pathName?: string;
  duration?: number;
  easing?: (t: number) => number;
  lookAtTarget?: boolean;
  updateControls?: boolean;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}
type CameraType = "perspective" | "orthographic";
type ControlType = "orbit" | "pointerLock" | "none";
export class CameraManager extends EventEmitter {
  private schematicRenderer: SchematicRenderer;
  private cameras: Map<string, CameraWrapper> = new Map();
  private activeCameraKey: string;
  public controls: Map<string, any> = new Map();
  private activeControlKey: string;
  private rendererDomElement: HTMLCanvasElement;
  private animationRequestId: number | null = null;
  private isAnimating: boolean = false;
  private animationStartTime: number = 0;
  private animationStartPosition: THREE.Vector3 = new THREE.Vector3();
  private animationStartRotation: THREE.Euler = new THREE.Euler();
  private tempQuaternion: THREE.Quaternion = new THREE.Quaternion();

  public cameraPathManager: CameraPathManager;

  constructor(
    schematicRenderer: SchematicRenderer,
    options: CameraManagerOptions = {}
  ) {
    super();
    this.schematicRenderer = schematicRenderer;
    this.rendererDomElement = this.schematicRenderer.canvas;

    // Initialize with a default perspective camera
    const defaultCamera = this.createCamera("perspective", {
      position: options.position || [0, 0, 0],
      rotation: [0, 0, 0],
      lookAt: [0, 0, 0],
    });
    this.cameras.set("default", defaultCamera);
    this.activeCameraKey = "default";

    // Initialize with default controls (OrbitControls)
    const defaultControls = defaultCamera.createControls("orbit");
    this.controls.set("orbit", defaultControls);
    this.activeControlKey = "orbit";

    // Listen to control changes
    this.setupControlEvents(defaultControls);

    // Initialize CameraPathManager
    this.cameraPathManager = new CameraPathManager(
      this.schematicRenderer,
      {
        showVisualization: options.showCameraPathVisualization || false,
      }
    );
  }

  private createCamera(type: CameraType, params: any): CameraWrapper {
    let camera: CameraWrapper;
    if (type === "perspective") {
      camera = new CameraWrapper(
        "perspective",
        this.rendererDomElement,
        params
      );
    } else {
      camera = new CameraWrapper(
        "orthographic",
        this.rendererDomElement,
        params
      );
    }
    return camera;
  }

  private getDefaultCameraPath(): { path: CameraPath, name: string } | null {
    const paths = Array.from(this.cameraPathManager['paths'].entries());
    if (paths.length > 0) {
      return { path: paths[0][1], name: paths[0][0] };
    }
    return null;
  }

  public animateCameraAlongPath(
    pathOrOptions?: CameraPath | CameraAnimationOptions
  ): Promise<void> {
    let cameraPath: CameraPath | undefined;
    let options: CameraAnimationOptions = {};

    // Handle different input cases
    if (pathOrOptions instanceof CameraPath) {
      cameraPath = pathOrOptions;
    } else if (typeof pathOrOptions === 'object') {
      options = pathOrOptions;
      if (options.pathName) {
        cameraPath = this.cameraPathManager.getPath(options.pathName);
      }
    }

    // If no path is specified, try to get the default path
    if (!cameraPath) {
      const defaultPath = this.getDefaultCameraPath();
      if (!defaultPath) {
        return Promise.reject(new Error('No camera path available'));
      }
      cameraPath = defaultPath.path;
      console.log(`Using default camera path: ${defaultPath.name}`);
    }

    const {
      duration = 5,
      easing = EasingFunctions.linear,
      lookAtTarget = true,
      updateControls = true,
      onUpdate,
      onComplete
    } = options;

    // Stop any existing animation
    this.stopAnimation();

    return new Promise((resolve, reject) => {
      this.isAnimating = true;
      this.animationStartTime = performance.now();
      
      // Store initial camera state
      this.animationStartPosition.copy(this.activeCamera.position);
      this.animationStartRotation.copy(this.activeCamera.rotation);

      // Temporarily disable controls if they exist
      if (updateControls) {
        const controls = this.controls.get(this.activeControlKey);
        if (controls && controls.enabled) {
          controls.enabled = false;
        }
      }

      const animate = () => {
        const currentTime = performance.now();
        const elapsed = (currentTime - this.animationStartTime) / 1000;
        let t = Math.min(elapsed / duration, 1);
      
        // Apply easing
        t = easing(t);
      
        // Get position and rotation from the path
        const { position, rotation, target } = cameraPath!.getPoint(t);
      
        // Set camera position directly
        this.activeCamera.position.copy(position);
      
        if (lookAtTarget) {
          // Look at the target point
          this.activeCamera.lookAt(target);
        } else {
          // Set camera rotation directly
          this.activeCamera.rotation.copy(rotation);
        }
      
        // Call update callback if provided
        if (onUpdate) {
          onUpdate(t);
        }
      
        // Emit camera movement event
        this.emit("cameraMove", {
          position: this.activeCamera.position.clone(),
          rotation: this.activeCamera.rotation.clone(),
          progress: t,
        });
      
        // Continue animation if not complete
        if (t < 1) {
          this.animationRequestId = requestAnimationFrame(animate);
        } else {
          // Animation complete
          this.isAnimating = false;
      
          // Re-enable controls if they were disabled
          if (updateControls) {
            const controls = this.controls.get(this.activeControlKey);
            if (controls) {
              controls.enabled = true;
            }
          }
      
          // Call complete callback if provided
          if (onComplete) {
            onComplete();
          }
      
          resolve();
        }
      };
      

      // Start animation
      this.animationRequestId = requestAnimationFrame(animate);
    });
  }

  public isCurrentlyAnimating(): boolean {
    return this.isAnimating;
  }

  public stopAnimation(): void {
    if (this.animationRequestId !== null) {
      cancelAnimationFrame(this.animationRequestId);
      this.animationRequestId = null;
      this.isAnimating = false;

      // Re-enable controls if they exist
      const controls = this.controls.get(this.activeControlKey);
      if (controls) {
        controls.enabled = true;
      }
    }
  }

  // Methods to interact with CameraPathManager
  public updatePathParameters(name: string, params: any): void {
    this.cameraPathManager.updatePathParameters(name, params);
  }

  public showPathVisualization(name: string): void {
    this.cameraPathManager.showPathVisualization(name);
  }

  public hidePathVisualization(name: string): void {
    this.cameraPathManager.hidePathVisualization(name);
  }

  public getCameraPath(name: string): CameraPath | undefined {
    return this.cameraPathManager.getPath(name);
  }

  // Control Management
  private createControls(type: ControlType, camera: CameraWrapper): any {
    return camera.createControls(type);
  }

  switchControls(type: ControlType) {
    // Dispose of current controls
    const currentControls = this.controls.get(this.activeControlKey);
    if (currentControls && currentControls.dispose) {
      currentControls.dispose();
    }

    // Create new controls
    const camera = this.activeCamera;
    const newControls = this.createControls(type, camera);
    this.controls.set(type, newControls);
    this.activeControlKey = type;

    // Listen to control events
    if (newControls) {
      this.setupControlEvents(newControls);
    }
  }

  private setupControlEvents(controls: any) {
    controls.addEventListener("change", () => {
      // Emit position change
      this.emit("propertyChanged", {
        property: "position",
        value: this.activeCamera.position.clone(),
      });

      // Emit rotation change
      this.emit("propertyChanged", {
        property: "rotation",
        value: this.activeCamera.rotation.clone(),
      });
    });
  }

  // Update loop for controls
  public update(deltaTime: number = 0) {
    const controls = this.controls.get(this.activeControlKey);
    if (controls && controls.update) {
      controls.update(deltaTime);
    }
  }

  // Expose camera properties
  get activeCamera(): CameraWrapper {
    return this.cameras.get(this.activeCameraKey);
  }

  // Update aspect ratio on resize
  updateAspectRatio(aspect: number) {
    this.cameras.forEach((cameraWrapper) => {
      if (cameraWrapper.camera instanceof THREE.PerspectiveCamera) {
        cameraWrapper.camera.aspect = aspect;
        cameraWrapper.camera.updateProjectionMatrix();
      } else if (cameraWrapper.camera instanceof THREE.OrthographicCamera) {
        const frustumSize = 10;
        cameraWrapper.camera.left = (frustumSize * aspect) / -2;
        cameraWrapper.camera.right = (frustumSize * aspect) / 2;
        cameraWrapper.camera.top = frustumSize / 2;
        cameraWrapper.camera.bottom = frustumSize / -2;
        cameraWrapper.camera.updateProjectionMatrix();
      }
    });
  }

  // Look at a target
  public lookAt(target: THREE.Vector3 | THREE.Vector3Tuple) {
    if (Array.isArray(target)) {
      this.activeCamera.lookAt(new THREE.Vector3(...target));
    } else {
      this.activeCamera.lookAt(target);
    }
  }

  public focusOnSchematics() {
    if (this.schematicRenderer.schematicManager.isEmpty()) {
      return;
    }
    const averagePosition = this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
    const maxDimensions = this.schematicRenderer.schematicManager.getMaxSchematicDimensions();

    this.activeCamera.lookAt(averagePosition);
    this.activeCamera.position.set(
      averagePosition.x + maxDimensions.x,
      averagePosition.y + maxDimensions.y,
      averagePosition.z + maxDimensions.z
    );
    this.update();
  }
}