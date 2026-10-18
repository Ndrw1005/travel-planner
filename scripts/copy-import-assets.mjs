import { mkdir, copyFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("public/vendor");
await mkdir(root + "/tesseract", { recursive: true });
await mkdir(root + "/lang", { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  root + "/tesseract/worker.min.js",
);
for (const file of await readdir("node_modules/tesseract.js-core"))
  if (/\.wasm(?:\.js)?$/.test(file))
    await copyFile(
      "node_modules/tesseract.js-core/" + file,
      root + "/tesseract/" + file,
    );
for (const lang of ["eng", "jpn"])
  await copyFile(
    `node_modules/@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`,
    `${root}/lang/${lang}.traineddata.gz`,
  );
await copyFile(
  "node_modules/tesseract.js-core/LICENSE",
  root + "/tesseract/LICENSE",
);
console.log("Local PDF/OCR assets ready. Documents never leave the browser.");
