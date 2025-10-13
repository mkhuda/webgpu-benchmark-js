import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files from public
app.use(express.static(path.join(__dirname, "public")));

// Serve benchmark-basic
app.use(
  "/basic-test",
  express.static(path.join(__dirname, "tests/basic-test"), { index: "index.html" })
);

// Serve compute-gpu-test
app.use(
  "/compute-test",
  express.static(path.join(__dirname, "tests/compute-test"), { index: "index.html" })
);

// Serve geometry-test
app.use(
  "/geometry-test",
  express.static(path.join(__dirname, "tests/geometry-test"), { index: "index.html" })
);

// Redirect root to homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Handle 404 fallback for subpaths (optional, if using SPA-like paths)
app.use((req, res) => {
  res.status(404).send("404 - Page not found");
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 WebGPU Benchmarks running at http://localhost:${PORT}`);
});
