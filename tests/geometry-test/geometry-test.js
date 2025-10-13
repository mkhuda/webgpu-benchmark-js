// --- WebGPU Geometry Stress Test ---
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
    log('❌ WebGPU tidak tersedia di browser ini.');
    throw new Error('WebGPU not supported');
  }

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  log(`✅ WebGPU aktif`);
  const infoGPU = getGPUInfo();
  log(`GPU: ${infoGPU.renderer} - (${infoGPU.vendor})`);
  return { device, context, format };
}

async function runBenchmark() {
  out.textContent = '⏳ Menjalankan benchmark...\n';

  const { device, context, format } = await initWebGPU();

  // ---- Geometry setup ----
  const triCount = 1000; // total triangles
  const vertexCount = triCount * 3;
  const vertexData = new Float32Array(vertexCount * 2);

  // generate random triangles in NDC range
  for (let i = 0; i < vertexData.length; i++) {
    vertexData[i] = Math.random() * 2 - 1; // range -1 .. +1
  }

  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexData);

  // ---- Shader code ----
  const shader = /* wgsl */ `
    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) bary: vec3f, // untuk hitung jarak ke tepi
    };

    @vertex
    fn vs_main(@location(0) pos: vec2f) -> VertexOutput {
      var out: VertexOutput;
      out.pos = vec4f(pos * 0.9, 0.0, 1.0);

      // hitung koordinat barycentric untuk border
      // asumsi input vertex = (-1,-1), (1,-1), (0,1)
      if (pos.x < 0.0 && pos.y < 0.0) {
        out.bary = vec3f(1.0, 0.0, 0.0);
      } else if (pos.x > 0.0 && pos.y < 0.0) {
        out.bary = vec3f(0.0, 1.0, 0.0);
      } else {
        out.bary = vec3f(0.0, 0.0, 1.0);
      }

      return out;
    }

    @fragment
    fn fs_main(@location(0) bary: vec3f) -> @location(0) vec4f {
      // hitung jarak ke tepi
      let edgeDist = min(min(bary.x, bary.y), bary.z);

      // threshold border
      let borderThickness = 0.05;
      let borderColor = vec3f(0.6, 0.6, 0.6);  // abu-abu
      let fillColor = vec3f(0.3, 0.7, 1.0);    // biru muda

      let t = smoothstep(0.0, borderThickness, edgeDist);
      let color = mix(borderColor, fillColor, t);

      return vec4f(color, 1.0);
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

  // ---- Benchmark run ----
  const start = performance.now();

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0.05, 0.05, 0.07, 1.0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertexCount);
  pass.end();

  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const end = performance.now();
  const gpuTime = (end - start).toFixed(3);
  const ops = Math.round((vertexCount * 2) / (gpuTime / 1000));

  // ---- Output ----
  log(`🎨 Geometry Stress Test selesai`);
  log(`Triangles     : ${triCount.toLocaleString()}`);
  log(`Vertices      : ${vertexCount.toLocaleString()}`);
  log(`GPU Time (ms) : ${gpuTime}`);
  log(`Ops/Second    : ${ops.toLocaleString()}`);
  log(`Backend       : WebGPU (${format})`);
  log(`\n📊 Semakin kecil GPU time → semakin cepat GPU Anda.`);
}

runBtn.addEventListener('click', () => {
  out.textContent = '';
  runBenchmark().catch((err) => log('❌ Error: ' + err.message));
});
