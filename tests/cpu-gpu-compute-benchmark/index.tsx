/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- WGSL COMPUTE SHADER (MANDELBROT SET CALCULATION) ---
const computeShaderWGSL = `
  struct Params {
    width: f32,
    height: f32,
    max_iter: f32,
  };

  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var<storage, read_write> output: array<u32>;

  @compute @workgroup_size(8, 8)
  fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= u32(params.width) || global_id.y >= u32(params.height)) {
      return;
    }

    let cx = (f32(global_id.x) / params.width - 0.75) * 2.5;
    let cy = (f32(global_id.y) / params.height - 0.5) * 2.0;

    var zx = 0.0;
    var zy = 0.0;
    var i: u32 = 0;

    while (i < u32(params.max_iter) && zx * zx + zy * zy < 4.0) {
      let temp_zx = zx * zx - zy * zy + cx;
      zy = 2.0 * zx * zy + cy;
      zx = temp_zx;
      i = i + 1;
    }

    let index = global_id.y * u32(params.width) + global_id.x;
    output[index] = i;
  }
`;

const RESOLUTION_OPTIONS = [256, 512, 1024, 2048, 4096];
const MAX_ITERATIONS = 255;

// --- Helper function to draw the Mandelbrot set ---
const drawMandelbrot = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: Uint32Array
) => {
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
        const iter = data[i];
        const pixelIndex = i * 4;
        
        if (iter >= MAX_ITERATIONS) {
            imageData.data[pixelIndex] = 0;
            imageData.data[pixelIndex + 1] = 0;
            imageData.data[pixelIndex + 2] = 0;
        } else {
            const hue = (360 * iter) / MAX_ITERATIONS;
            const saturation = 1;
            const lightness = 0.5;
            
            const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
            const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
            const m = lightness - c / 2;
            
            let r=0, g=0, b=0;
            if (hue < 60) { [r,g,b] = [c,x,0]; }
            else if (hue < 120) { [r,g,b] = [x,c,0]; }
            else if (hue < 180) { [r,g,b] = [0,c,x]; }
            else if (hue < 240) { [r,g,b] = [0,x,c]; }
            else if (hue < 300) { [r,g,b] = [x,0,c]; }
            else { [r,g,b] = [c,0,x]; }

            imageData.data[pixelIndex] = (r + m) * 255;
            imageData.data[pixelIndex + 1] = (g + m) * 255;
            imageData.data[pixelIndex + 2] = (b + m) * 255;
        }
        imageData.data[pixelIndex + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
};

// --- CPU Implementation ---
const calculateMandelbrotCPU = (width: number, height: number, max_iter: number) => {
    const data = new Uint32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cx = (x / width - 0.75) * 2.5;
            const cy = (y / height - 0.5) * 2.0;

            let zx = 0.0;
            let zy = 0.0;
            let i = 0;
            
            while (i < max_iter && zx * zx + zy * zy < 4.0) {
                const temp_zx = zx * zx - zy * zy + cx;
                zy = 2.0 * zx * zy + cy;
                zx = temp_zx;
                i++;
            }
            data[y * width + x] = i;
        }
    }
    return data;
};

type Result = { method: string; time: number; res: number };

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [resolution, setResolution] = useState(1024);
  const [results, setResults] = useState<{ cpu: Result | null; gpu: Result | null }>({ cpu: null, gpu: null });
  const [hardwareInfo, setHardwareInfo] = useState<{ cpuCores: number | string; gpuRenderer: string }>({ cpuCores: 'N/A', gpuRenderer: 'Detecting...' });
  
  const canvasRefs = {
      cpu: useRef<HTMLCanvasElement>(null),
      gpu: useRef<HTMLCanvasElement>(null)
  };
  
  useEffect(() => {
    const getHardwareInfo = async () => {
      const cpuCores = navigator.hardwareConcurrency || 'N/A';
      let gpuRenderer = 'N/A';
      try {
        if ('gpu' in navigator) {
            const adapter = await (navigator as any).gpu.requestAdapter();
            if (adapter) {
              if (typeof adapter.requestAdapterInfo === 'function') {
                const info = await adapter.requestAdapterInfo();
                gpuRenderer = info.description || 'N/A';
              }
            }
        }
      } catch (e) {
        console.error("Could not get WebGPU adapter info:", e);
      }

      if (gpuRenderer === 'N/A' || gpuRenderer === '') {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const webgl = gl as WebGLRenderingContext;
                const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info');
                gpuRenderer = (debugInfo && webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) || webgl.getParameter(webgl.RENDERER) || 'N/A';
            }
        } catch (e) { console.error("Could not get WebGL renderer info:", e); }
      }
      setHardwareInfo({ cpuCores, gpuRenderer });
    };
    getHardwareInfo();
  }, []);

  const clearCanvases = useCallback(() => {
      Object.values(canvasRefs).forEach(ref => {
          const canvas = ref.current;
          if(canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.fillStyle = '#2a2a2a';
                  ctx.fillRect(0,0, canvas.width, canvas.height);
              }
          }
      });
  }, []);

  useEffect(() => {
    clearCanvases();
    setResults({ cpu: null, gpu: null });
  }, [resolution, clearCanvases]);

  const handleRun = useCallback(async (type: 'cpu' | 'gpu') => {
    const canvas = canvasRefs[type].current;
    if (isLoading || !canvas) return;

    setIsLoading(true);
    setResults(prev => ({ ...prev, [type]: null }));

    // Clear just the target canvas before running
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const width = resolution;
    const height = resolution;
    canvas.width = width;
    canvas.height = height;
    
    let computationTime = 0;
    let resultData: Uint32Array | null = null;

    try {
        const startTime = performance.now();
        if (type === 'cpu') {
            resultData = calculateMandelbrotCPU(width, height, MAX_ITERATIONS);
        } else { // GPU
            if (!(navigator as any).gpu) {
                throw new Error('WebGPU not supported on this browser.');
            }
            const adapter = await (navigator as any).gpu.requestAdapter();
            if (!adapter) {
                throw new Error('No appropriate GPUAdapter found.');
            }
            const device = await adapter.requestDevice();

            const outputBufferSize = width * height * Uint32Array.BYTES_PER_ELEMENT;
            const outputBuffer = device.createBuffer({
                size: outputBufferSize,
                usage: 128 | 4 // GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            });
            
            const stagingBuffer = device.createBuffer({
                size: outputBufferSize,
                usage: 1 | 8, // GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });

            const params = new Float32Array([width, height, MAX_ITERATIONS, 0]);
            const paramsBuffer = device.createBuffer({
                size: params.byteLength,
                usage: 64 | 8 // GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(paramsBuffer, 0, params);
            
            const shaderModule = device.createShaderModule({ code: computeShaderWGSL });
            
            const pipeline = device.createComputePipeline({
                layout: 'auto',
                compute: { module: shaderModule, entryPoint: 'main' }
            });

            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: paramsBuffer } },
                    { binding: 1, resource: { buffer: outputBuffer } }
                ]
            });
            
            const commandEncoder = device.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
            passEncoder.end();
            
            commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputBufferSize);
            device.queue.submit([commandEncoder.finish()]);

            await stagingBuffer.mapAsync(1 /* GPUMapMode.READ */);
            const arrayBuffer = stagingBuffer.getMappedRange();
            resultData = new Uint32Array(arrayBuffer.slice(0));
            stagingBuffer.unmap();
            
            device.destroy();
        }
        const endTime = performance.now();
        computationTime = endTime - startTime;

        if (resultData) {
            const renderCtx = canvas.getContext('2d');
            if (renderCtx) {
                drawMandelbrot(renderCtx, width, height, resultData);
            }
        }
        setResults(prev => ({ 
            ...prev,
            [type]: { method: type.toUpperCase(), time: computationTime, res: resolution }
        }));

    } catch (error) {
        console.error(`Failed to run ${type} computation:`, error);
        alert(`Error during ${type.toUpperCase()} computation. Check console for details.`);
    } finally {
        setIsLoading(false);
    }
  }, [isLoading, resolution, canvasRefs]);
  
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newRes = parseInt(event.target.value, 10);
    setResolution(newRes);
  };

  const RenderWinner = () => {
    if (!results.cpu || !results.gpu) return null;

    const cpuTime = results.cpu.time;
    const gpuTime = results.gpu.time;
    const fasterMethod = cpuTime < gpuTime ? 'CPU' : 'GPU';
    const slowerMethod = fasterMethod === 'CPU' ? 'GPU' : 'CPU';
    const difference = Math.abs(cpuTime - gpuTime);
    const factor = Math.max(cpuTime, gpuTime) / Math.min(cpuTime, gpuTime);

    return (
        <div className="winner-box">
            At {results.cpu.res}x{results.cpu.res}, the{' '}
            <strong className="winner">{fasterMethod}</strong> was{' '}
            <strong>{difference.toFixed(2)}ms</strong> ({factor.toFixed(2)}x) faster than the{' '}
            <strong className="loser">{slowerMethod}</strong>.
        </div>
    );
  };
  
  return (
    <div className="container">
      <h1>CPU vs. GPU Compute Benchmark</h1>
      <p className="description">
        Calculating a {resolution}x{resolution} Mandelbrot set. Select a resolution and run on both devices to compare.
      </p>
      <div className="hardware-info">
        <span>CPU Cores: <strong>{hardwareInfo.cpuCores}</strong></span>
        <span>GPU: <strong>{hardwareInfo.gpuRenderer}</strong></span>
      </div>

      <div className="comparison-area">
        <div className="result-panel">
            <h3>CPU Result</h3>
            <div className="canvas-wrapper">
                <canvas ref={canvasRefs.cpu} aria-label="Mandelbrot set visualization by CPU"></canvas>
            </div>
            {results.cpu ? (
                <div className="stats-box">
                    <span>Time: <strong>{results.cpu.time.toFixed(2)} ms</strong></span>
                </div>
            ) : <div className="stats-box-placeholder"></div>}
        </div>
        <div className="result-panel">
            <h3>GPU Result</h3>
            <div className="canvas-wrapper">
                <canvas ref={canvasRefs.gpu} aria-label="Mandelbrot set visualization by GPU"></canvas>
            </div>
            {results.gpu ? (
                <div className="stats-box">
                    <span>Time: <strong>{results.gpu.time.toFixed(2)} ms</strong></span>
                </div>
            ) : <div className="stats-box-placeholder"></div>}
        </div>
      </div>
      
      <RenderWinner />

      <div className="slider-container">
        <label htmlFor="resolution-slider">Resolution: {resolution.toLocaleString()}x{resolution.toLocaleString()}</label>
        <input 
          id="resolution-slider"
          type="range" 
          min={RESOLUTION_OPTIONS[0]} 
          max={RESOLUTION_OPTIONS[RESOLUTION_OPTIONS.length - 1]}
          step={RESOLUTION_OPTIONS[0]}
          list="resolution-markers"
          value={resolution} 
          onChange={handleSliderChange}
          disabled={isLoading}
        />
        <datalist id="resolution-markers">
            {RESOLUTION_OPTIONS.map(res => <option key={res} value={res}></option>)}
        </datalist>
      </div>

      <div className="controls">
          <button onClick={() => handleRun('cpu')} disabled={isLoading}>
            Run on CPU
          </button>
          <button onClick={() => handleRun('gpu')} disabled={isLoading}>
            Run on WebGPU (GPU)
          </button>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);