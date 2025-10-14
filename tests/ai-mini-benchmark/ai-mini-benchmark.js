// ai-mini-benchmark.js
import { getGPUInfo } from '/utils/gpu-info.js';
const out = document.getElementById('out');
const runBtn = document.getElementById('run');
const sizeEl = document.getElementById('size');
const itersEl = document.getElementById('iters');

function log(msg) {
  out.textContent += '\n' + msg;
}
function reset(msg = '') {
  out.textContent = msg || '';
}

async function benchWebGPU_AI(matrixSize = 64, iters = 10) {
  if (!navigator.gpu) throw new Error('WebGPU not supported in this browser');

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const queue = device.queue;
  const N = matrixSize;

  const shaderCode = /* wgsl */ `
    @group(0) @binding(0) var<storage, read>  A : array<f32>;
    @group(0) @binding(1) var<storage, read>  B : array<f32>;
    @group(0) @binding(2) var<storage, read_write>  C : array<f32>;

    @compute @workgroup_size(8,8)
    fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
      let N : u32 = ${N}u;
      let row = gid.x;
      let col = gid.y;
      if (row >= N || col >= N) { return; }

      var sum : f32 = 0.0;
      for (var k = 0u; k < N; k++) {
        sum += A[row * N + k] * B[k * N + col];
      }
      // simple activation
      C[row * N + col] = tanh(sum);
    }
  `;

  // buat buffers
  const total = N * N * 4;
  const A = device.createBuffer({
    size: total,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const B = device.createBuffer({
    size: total,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const C = device.createBuffer({
    size: total,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // isi data
  const aData = new Float32Array(N * N);
  const bData = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    aData[i] = Math.random() * 2 - 1;
    bData[i] = Math.random() * 2 - 1;
  }
  queue.writeBuffer(A, 0, aData);
  queue.writeBuffer(B, 0, bData);

  // pipeline
  const module = device.createShaderModule({ code: shaderCode });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: A } },
      { binding: 1, resource: { buffer: B } },
      { binding: 2, resource: { buffer: C } },
    ],
  });

  const dispatch = [Math.ceil(N / 8), Math.ceil(N / 8), 1];

  const t0 = performance.now();
  for (let i = 0; i < iters; i++) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(...dispatch);
    pass.end();
    queue.submit([encoder.finish()]);
  }
  await queue.onSubmittedWorkDone();
  const t1 = performance.now();

  const ms = (t1 - t0).toFixed(3);
  const ops = BigInt(N * N * N) * BigInt(iters);
  const opsPerSec = Number(ops) / (ms / 1000);
  return { backend: 'WebGPU', ms, opsPerSec, N, iters };
}

async function run() {
  reset('⏳ Menjalankan AI mini benchmark...');
  const N = Math.max(8, Number(sizeEl.value) | 0);
  const iters = Math.max(1, Number(itersEl.value) | 0);

  try {
    const result = await benchWebGPU_AI(N, iters);
    reset();
    const infoGPU =
      typeof getGPUInfo === 'function'
        ? getGPUInfo()
        : { vendor: '?', renderer: '?' };
    log(`GPU: ${infoGPU.renderer} (${infoGPU.vendor})`);
    log(`Backend     : ${result.backend}`);
    log(`Matrix size : ${result.N} x ${result.N}`);
    log(`Iterations  : ${result.iters}`);
    log(`GPU time    : ${result.ms} ms`);
    log(
      `Ops/Second  : ${Math.round(result.opsPerSec).toLocaleString('en-US')}`
    );
    log('');
    log(
      'Catatan: ini mensimulasikan operasi matrix multiply seperti layer neural network.'
    );
  } catch (e) {
    reset('❌ Benchmark gagal.');
    log(e.message || e);
    log('Pastikan browser mendukung WebGPU (Chrome/Edge terbaru).');
  }
}

runBtn.addEventListener('click', run);
