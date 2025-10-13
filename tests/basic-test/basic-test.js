// --- Simple WebGPU Benchmark (Fixed version) ---
// by mkhuda.com
import { getGPUInfo } from '/utils/gpu-info.js';

const out = document.getElementById('output');
const canvas = document.getElementById('gpu-canvas');
const runBtn = document.getElementById('run');

function log(msg) {
  out.textContent += msg + '\n';
  out.scrollTop = out.scrollHeight;
}

async function initWebGPU() {
  if (!navigator.gpu) {
    log('❌ WebGPU is not supported by this browser.');
    throw new Error('WebGPU not supported');
  }

  const adapter =
    getGPUInfo().adapter || (await navigator.gpu.requestAdapter());
  const device = getGPUInfo().device || (await adapter.requestDevice());
  const context = canvas.getContext('webgpu');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  log(`✅ WebGPU initialized`);
  const infoGPU = getGPUInfo();
  log(`GPU: ${infoGPU.renderer} - (${infoGPU.vendor})`);

  return { device, context, format };
}

async function runBenchmark() {
  out.textContent = '';
  const { device, context, format } = await initWebGPU();

  // Simple triangle (in NDC coordinates)
  const vertexData = new Float32Array([
    0.0,
    0.6, // top
    -0.6,
    -0.6, // bottom left
    0.6,
    -0.6, // bottom right
  ]);

  // Create GPU buffer
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexData);

  // WGSL Shader
  const shader = /* wgsl */ `
    @vertex
    fn vs_main(@location(0) pos: vec2f) -> @builtin(position) vec4f {
      return vec4f(pos, 0.0, 1.0);
    }

    @fragment
    fn fs_main() -> @location(0) vec4f {
      return vec4f(0.2, 0.6, 1.0, 1.0); // bright blue
    }
  `;

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: shader }),
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: shader }),
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
  });

  // Draw once and measure
  const start = performance.now();

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: [0.05, 0.05, 0.07, 1.0], // dark background
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(3);
  pass.end();

  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const end = performance.now();
  const time = (end - start).toFixed(3);

  log(`🟦 Triangle rendered successfully`);
  log(`GPU render time: ${time} ms`);
  log(`Backend: WebGPU (${format})`);
  log(`Tip: smaller GPU time = faster GPU performance`);
}

runBtn.addEventListener('click', () => {
  out.textContent = '⏳ Running benchmark...\n';
  runBenchmark().catch((err) => log('❌ Error: ' + err.message));
});
