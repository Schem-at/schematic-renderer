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
        // this.ffmpeg = new FFmpeg();
        
        // // Initialize FFmpeg early
        // const initFFmpeg = async () => {
        //     const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        //     await this.ffmpeg.load({
        //         coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        //         wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        //         // classWorkerURL: await toBlobURL(`https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js`, 'text/javascript')
        //     });
        // };
        // initFFmpeg();
        // instead of loading ffmpeg from here it will be passed as an option from the main app
        //check if the ffmpeg is passed as an option
        if(!this.schematicRenderer.options.ffmpeg) {
            console.error('FFmpeg not found in options');
            console.error('Recording will not work');
            return;
        }

        //initialize ffmpeg from the options
        this.ffmpeg = this.schematicRenderer.options.ffmpeg;


    }

    private async captureFrame(): Promise<Uint8Array> {
        //if ffmpeg is null then return an empty array
        if(!this.ffmpeg) {
            console.error('FFmpeg not found');
            return new Uint8Array();
        }
        if (!this.ctx2d) throw new Error('Recording context not initialized');
        const mainCanvas = this.schematicRenderer.renderManager?.renderer.domElement;
        if (!mainCanvas) throw new Error('Main canvas not found');
        
        return new Promise<Uint8Array>((resolve) => {
            this.ctx2d!.drawImage(mainCanvas, 0, 0);
            this.recordingCanvas.toBlob((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(new Uint8Array(reader.result as ArrayBuffer));
                };
                reader.readAsArrayBuffer(blob!);
            }, 'image/png', 0.9);
        });
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
        if (!this.ffmpeg) {
            console.error('FFmpeg not found');
            this.stopRecording();
            return;
        }
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
                            '-crf', '23',  // Balance between quality and size
                            '-pix_fmt', 'yuv420p',
                            'output.mp4'
                        ]);
                        const data = await this.ffmpeg.readFile('output.mp4');
                        console.log('Video encoding complete');
                        //@ts-ignore
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