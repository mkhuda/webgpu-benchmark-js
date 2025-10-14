
This project showcases two fundamentally different approaches to solving the same problem. Calculating the Mandelbrot set is an "embarrassingly parallel" task, meaning the calculation for each pixel is completely independent of all other pixels. This makes it a perfect candidate for GPU acceleration.

🧠 **CPU Implementation**  
The CPU calculation is performed in TypeScript using a simple nested for loop.  
It iterates through every pixel of the canvas sequentially, from top-left to bottom-right.  
For each pixel, it runs the Mandelbrot algorithm to determine its "iteration count".  
This approach is serial: it completes the work for one pixel before starting the next. While modern CPUs have multiple cores, a single browser tab has limited access to this parallelism for a single task like this.

🖥️ **GPU Implementation**  
The GPU calculation leverages the WebGPU API, a modern standard for performing general-purpose GPU (GPGPU) computations in the browser.  
A compute shader, written in WGSL (WebGPU Shading Language), contains the Mandelbrot algorithm.  
When the "Run on GPU" button is clicked, the browser sends the resolution and iteration parameters to the GPU.  
The GPU then launches thousands of threads in parallel. Each thread is responsible for calculating the value for a single pixel (or a small group of pixels).  
Because all pixels are calculated simultaneously, the total time is drastically reduced, especially at high resolutions.  
The final data is copied back from the GPU to the CPU to be rendered onto the canvas.

🛠️ **Tech Stack**  
- Frontend: React (via ES Modules, no build step)  
- Compute API: WebGPU  
- Shading Language: WGSL (WebGPU Shading Language)  
- Rendering: HTML `<canvas>` 2D Context  
- Language: TypeScript  

📂 **How to Run Locally**  
This project is self-contained in three files (`index.html`, `index.tsx`, `index.css`) and requires no installation or build process.  
Clone the repository:
```bash
git clone <your-repository-url>
```
Navigate to the directory:
```bash
cd <repository-directory>
```
Serve the files:  
```bash
> npm install
> npm run dev
```

🌐 **Browser Compatibility**  
WebGPU is a modern, cutting-edge API. It is only available in recent versions of major desktop browsers.  
- Chrome: Supported (Version 113+).  
- Edge: Supported (Version 113+).  
- Firefox: Supported (Version 121+).  
Check [caniuse.com/webgpu](https://caniuse.com/webgpu) for the latest compatibility information. The application will show an alert if WebGPU is not supported by your browser.

📄 **License**  
This project is licensed under the Apache 2.0 License. See the license text within the source files for more details.