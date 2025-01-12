import * as THREE from 'three';
import { SchematicRenderer } from '../SchematicRenderer';
import { FFmpeg } from '@ffmpeg/ffmpeg';

export interface RecordingOptions {
    width?: number;
    height?: number;
    frameRate?: number;
    quality?: number;
    onStart?: () => void;
    onProgress?: (progress: number) => void;
    onComplete?: (blob: Blob) => void;
}

export interface ScreenshotOptions {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'image/png' | 'image/jpeg';
}

export class RecordingManager {
    public isRecording: boolean = false;
    private schematicRenderer: SchematicRenderer;
    private recordingCanvas: HTMLCanvasElement;
    private ctx2d: CanvasRenderingContext2D | null = null;
    private ffmpeg?: FFmpeg;
    private frameCount: number = 0;
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

        if(!this.schematicRenderer.options.ffmpeg) {
            console.error('FFmpeg not found in options');
            console.error('Recording will not work');
            return;
        }

        this.ffmpeg = this.schematicRenderer.options.ffmpeg;
    }

    private async captureFrame(): Promise<Uint8Array> {
        if(!this.ffmpeg) {
            console.error('FFmpeg not found');
            return new Uint8Array();
        }
        if (!this.ctx2d) throw new Error('Recording context not initialized');
        const mainCanvas = this.schematicRenderer.renderManager?.renderer.domElement;
        if (!mainCanvas) throw new Error('Main canvas not found');
       
        return new Promise<Uint8Array>((resolve) => {
            if (!this.schematicRenderer) {
                console.error('SchematicRenderer not found');
                return new Uint8Array();
            }
            if (!this.schematicRenderer.renderManager) throw new Error('Render manager not found');
            // Force a render through the EffectComposer
            this.schematicRenderer.renderManager.render();
            
            const composer = (this.schematicRenderer.renderManager as any).composer;
            const readBuffer = composer.outputBuffer;
            this.schematicRenderer.renderManager.renderer.setRenderTarget(readBuffer);
            
            this.ctx2d!.drawImage(this.schematicRenderer.renderManager.renderer.domElement, 0, 0);
            
            // Reset render target
            this.schematicRenderer.renderManager.renderer.setRenderTarget(null);
            
            this.recordingCanvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(new Uint8Array(reader.result as ArrayBuffer));
                };
                reader.readAsArrayBuffer(blob!);
            }, 'image/jpeg', 1.0); // Try JPEG with max quality instead of PNG
        });
    }

    /**
     * Takes a screenshot of the current view
     * @param options Screenshot options including dimensions and format
     * @returns Promise<Blob> A promise that resolves with the screenshot blob
     */
    public async takeScreenshot(options: ScreenshotOptions = {}): Promise<Blob> {
        const {
            width = this.schematicRenderer.renderManager?.renderer.domElement.width || 3840,
            height = this.schematicRenderer.renderManager?.renderer.domElement.height || 2160,
            // @ts-ignore
            quality = 0.9,
            format = 'image/png'
        } = options;

        // Store original settings
        const tempSettings = await this.setupTemporarySettings(width, height);
        
        try {
            // Force a render to ensure the latest state is captured
            this.schematicRenderer.renderManager?.renderer.render(
                this.schematicRenderer.sceneManager.scene,
                this.schematicRenderer.cameraManager.activeCamera.camera
            );

            // Reuse captureFrame for consistency
            const frameData = await this.captureFrame();
            
            // Convert Uint8Array to Blob
            // @ts-ignore
            return new Blob([frameData.buffer], { type: format });
        } catch (error) {
            throw error;
        } finally {
            // Restore original settings
            this.restoreSettings(tempSettings);
        }
    }

    private async setupTemporarySettings(width: number, height: number) {
        const renderer = this.schematicRenderer.renderManager?.renderer;
        if (!renderer) throw new Error('Renderer not found');
        const camera = this.schematicRenderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;

        // Store current settings
        const tempSettings = {
            width: renderer.domElement.width,
            height: renderer.domElement.height,
            pixelRatio: renderer.getPixelRatio(),
            aspect: camera.aspect
        };

        // Apply new settings
        this.recordingCanvas.width = width;
        this.recordingCanvas.height = height;
        renderer.setPixelRatio(1.0);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        return tempSettings;
    }

    private restoreSettings(settings: {
        width: number,
        height: number,
        pixelRatio: number,
        aspect: number
    }): void {
        const renderer = this.schematicRenderer.renderManager?.renderer;
        if (!renderer) throw new Error('Renderer not found');
        const camera = this.schematicRenderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;

        renderer.setSize(settings.width, settings.height, false);
        renderer.setPixelRatio(settings.pixelRatio);
        camera.aspect = settings.aspect;
        camera.updateProjectionMatrix();
    }

    private async setupRecording(width: number, height: number): Promise<void> {
        if(!this.ffmpeg) {
            console.error('FFmpeg not found');
            return;
        }
        const renderer = this.schematicRenderer.renderManager?.renderer;
        if (!renderer) throw new Error('Renderer not found');
        const camera = this.schematicRenderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;
     
        this.originalSettings = {
            width: renderer.domElement.clientWidth,
            height: renderer.domElement.clientHeight,
            pixelRatio: renderer.getPixelRatio(),
            aspect: camera.aspect
        };
     
        this.recordingCanvas.width = width;
        this.recordingCanvas.height = height;
        renderer.setPixelRatio(1.0);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    public async startRecording(duration: number, options: RecordingOptions = {}): Promise<void> {
        if(!this.ffmpeg) {
            console.error('FFmpeg not found');
            this.stopRecording();
            return;
        }
        if (this.isRecording) throw new Error('Recording already in progress');
        console.log('Starting recording...');

        const {
            width = 3840,
            height = 2160,
            frameRate = 60,
            onStart,
            onProgress,
            onComplete
        } = options;
        
        try {
            console.log('Setting up recording...');
            await this.setupRecording(width, height);
            console.log('Recording setup complete');
            this.frameCount = 0;
            this.isRecording = true;

            if (onStart) onStart();

            const totalFrames = duration * frameRate;
            console.log(`Recording ${totalFrames} frames at ${frameRate} FPS...`);
            this.schematicRenderer.cameraManager.animateCameraAlongPath({
                targetFps: frameRate,
                totalFrames,
                lookAtTarget: true,
                onUpdate: async () => {
                    if (!this.isRecording) return;
                    
                    const frame = await this.captureFrame();
                    const filename = `frame${this.frameCount.toString().padStart(6, '0')}.png`;
                    if(!this.ffmpeg) {
                        console.error('FFmpeg not found');
                        return;
                    }
                    await this.ffmpeg.writeFile(filename, frame);
                    this.frameCount++;
                    
                    if (onProgress) onProgress(this.frameCount / totalFrames);
                },
                onComplete: async () => {
                    if (!this.isRecording) return;
                    console.log('Recording complete');
                    console.log('Encoding video...');
                    try {
                        if (!this.ffmpeg) {
                            console.error('FFmpeg not found');
                            return;
                        }
                        await this.ffmpeg.exec([
                            '-framerate', frameRate.toString(),
                            '-pattern_type', 'sequence',
                            '-start_number', '0',
                            '-i', 'frame%06d.png',
                            '-c:v', 'libx264',
                            '-preset', 'ultrafast',
                            '-threads', '0',
                            '-crf', '23',
                            '-pix_fmt', 'yuv420p',
                            'output.mp4'
                        ]);
                        const data = await this.ffmpeg.readFile('output.mp4');
                        console.log('Video encoding complete');
                        // @ts-ignore
                        const blob = new Blob([data.buffer], { type: 'video/mp4' });
                        
                        if (onComplete) onComplete(blob);
                        this.stopRecording();
                    } catch (error) {
                        console.error('FFmpeg encoding failed:', error);
                        throw error;
                    }
                }
            });
        } catch (error) {
            this.cleanup();
            throw error;
        }
    }

    private cleanup(): void {
        if (this.originalSettings) {
            const renderer = this.schematicRenderer.renderManager?.renderer;
            if (!renderer) throw new Error('Renderer not found');
            const camera = this.schematicRenderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;

            renderer.setSize(this.originalSettings.width, this.originalSettings.height, false);
            renderer.setPixelRatio(this.originalSettings.pixelRatio);
            camera.aspect = this.originalSettings.aspect;
            camera.updateProjectionMatrix();

            this.originalSettings = null;
        }
    }

    public stopRecording(): void {
        this.isRecording = false;
        this.cleanup();
    }

    public dispose(): void {
        this.stopRecording();
        if(!this.ffmpeg) {
            console.error('FFmpeg not found');
            return;
        }
        this.ffmpeg.terminate();
    }
}