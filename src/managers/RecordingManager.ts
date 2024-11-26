// RecordingManager.ts
import * as THREE from 'three';
import { SchematicRenderer } from './SchematicRenderer';

export interface RecordingOptions {
    width?: number;
    height?: number;
    frameRate?: number;
    videoBitsPerSecond?: number;
    mimeType?: string;
    onProgress?: (progress: number) => void;
    onComplete?: (blob: Blob) => void;
}

export class RecordingManager {
    public isRecording: boolean = false;
    private schematicRenderer: SchematicRenderer;
    private recordingCanvas: HTMLCanvasElement;
    private ctx2d: CanvasRenderingContext2D | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private recordingStartTime: number = 0;
    private animationFrameId: number | null = null;
    private chunks: BlobPart[] = [];
    private originalSettings: {
        width: number;
        height: number;
        pixelRatio: number;
        aspect: number;
    } | null = null;

    constructor(schematicRenderer: SchematicRenderer) {
        this.schematicRenderer = schematicRenderer;
        this.recordingCanvas = document.createElement('canvas');
        this.ctx2d = this.recordingCanvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });
    }

    private async setupRecording(width: number, height: number): Promise<void> {
        const renderer = this.schematicRenderer.renderManager.renderer;
        const camera = this.schematicRenderer.cameraManager.activeCamera.camera;

        // Store original settings
        this.originalSettings = {
            width: renderer.domElement.clientWidth,
            height: renderer.domElement.clientHeight,
            pixelRatio: renderer.getPixelRatio(),
            aspect: camera.aspect
        };

        // Set up recording size
        this.recordingCanvas.width = width;
        this.recordingCanvas.height = height;

        // Update renderer for high-res recording
        renderer.setPixelRatio(1.0);
        renderer.setSize(width, height, false);

        // Maintain display size
        renderer.domElement.style.width = `${this.originalSettings.width}px`;
        renderer.domElement.style.height = `${this.originalSettings.height}px`;

        // Update camera for new aspect ratio
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // Wait for renderer to adjust
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    public async startRecording(duration: number, options: RecordingOptions = {}): Promise<void> {
        if (this.isRecording) {
            throw new Error('Recording is already in progress');
        }

        const {
            width = 3840,
            height = 2160,
            frameRate = 60,
            videoBitsPerSecond = 20000000,
            mimeType = 'video/webm;codecs=vp9',
            onProgress,
            onComplete
        } = options;

        try {
            // Setup recording
            await this.setupRecording(width, height);

            // Clear previous chunks
            this.chunks = [];

            // Set up media recorder
            const stream = this.recordingCanvas.captureStream(frameRate);
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond
            });

            return new Promise((resolve, reject) => {
                if (!this.mediaRecorder) return reject(new Error('MediaRecorder not initialized'));

                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.chunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = () => {
                    if (this.chunks.length === 0) {
                        reject(new Error('No frames were captured'));
                        return;
                    }

                    const blob = new Blob(this.chunks, { type: mimeType });
                    this.cleanup();
                    
                    if (blob.size === 0) {
                        reject(new Error('Recording produced empty file'));
                        return;
                    }

                    if (onComplete) {
                        onComplete(blob);
                    }
                    resolve();
                };

                this.mediaRecorder.onerror = (event) => {
                    this.cleanup();
                    reject(new Error('Recording failed: ' + event));
                };

                // Start recording
                this.isRecording = true;
                this.recordingStartTime = performance.now();
                this.mediaRecorder.start(1000);

                // Start animation and recording
                this.startRenderLoop(duration, onProgress);
            });
        } catch (error) {
            this.cleanup();
            throw error;
        }
    }

    private startRenderLoop(duration: number, onProgress?: (progress: number) => void): void {
        const mainCanvas = this.schematicRenderer.renderManager.renderer.domElement;

        const captureFrame = () => {
            if (!this.isRecording || !this.ctx2d) return;

            // Copy the main canvas to the recording canvas
            this.ctx2d.drawImage(mainCanvas, 0, 0);

            // Calculate progress
            const elapsed = performance.now() - this.recordingStartTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);

            if (onProgress) {
                onProgress(progress);
            }

            if (progress < 1) {
                this.animationFrameId = requestAnimationFrame(captureFrame);
            } else {
                this.stopRecording();
            }
        };

        // Start camera animation
        this.schematicRenderer.cameraManager.animateCameraAlongPath({
            duration: duration,
            lookAtTarget: true,
            onUpdate: () => {
                captureFrame();
            }
        });
    }

    private cleanup(): void {
        if (this.originalSettings) {
            const renderer = this.schematicRenderer.renderManager.renderer;
            const camera = this.schematicRenderer.cameraManager.activeCamera.camera;

            // Reset renderer settings
            renderer.setSize(this.originalSettings.width, this.originalSettings.height, false);
            renderer.setPixelRatio(this.originalSettings.pixelRatio);

            // Reset camera
            camera.aspect = this.originalSettings.aspect;
            camera.updateProjectionMatrix();

            this.originalSettings = null;
        }
    }

    public stopRecording(): void {
        if (!this.isRecording || !this.mediaRecorder) return;

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        this.isRecording = false;
        
        if (this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        this.mediaRecorder = null;
        this.cleanup();
    }

    public dispose(): void {
        this.stopRecording();
        if (this.originalSettings) {
            this.cleanup();
        }
    }
}