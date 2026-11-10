import type { NextConfig } from "next";

const extractionRuntimeAssets = [
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
  "./node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/tesseract.js/src/worker-script/**/*",
  "./node_modules/tesseract.js-core/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdfjs-dist",
    "sharp",
    "tesseract.js",
    "tesseract.js-core",
  ],
  outputFileTracingIncludes: {
    "/submit": extractionRuntimeAssets,
    "/submissions/*": extractionRuntimeAssets,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
