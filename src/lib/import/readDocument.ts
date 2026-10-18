import type { Worker } from "tesseract.js";
import { digest } from "./parser";
import type { ExtractedDocument, TextPage } from "./types";
export interface ReadOptions {
  signal: AbortSignal;
  language: "eng" | "eng+jpn";
  forceOcr: boolean;
  progress: (message: string) => void;
}
async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let cancel: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () =>
      reject(new Error("Import cancelled. Saved trip data was not changed."));
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
const today = () => new Date().toISOString().slice(0, 10);
export function metadataDate(date: unknown) {
  if (typeof date !== "string") return "";
  const m = date.match(/^(?:D:)?(20\d{2})(\d{2})(\d{2})/);
  if (!m) return "";
  const value = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isFinite(Date.parse(value)) ? value : "";
}
export function textRows(
  items: { str: string; transform: number[]; height?: number }[],
) {
  const rows: { y: number; items: typeof items }[] = [];
  for (const item of items
    .filter((i) => i.str.trim())
    .sort(
      (a, b) =>
        b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
    )) {
    let row = rows.find(
      (r) =>
        Math.abs(r.y - item.transform[5]) <
        Math.max(2, (item.height ?? 8) * 0.25),
    );
    if (!row) {
      row = { y: item.transform[5], items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.items
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str)
        .join(" "),
    )
    .join("\n");
}
export async function readDocument(
  file: File,
  options: ReadOptions,
): Promise<ExtractedDocument> {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("File exceeds 25 MB. Split or reduce it before importing.");
  if (!/\.(pdf|png|jpe?g)$/i.test(file.name))
    throw new Error("Supported files: PDF, PNG and JPEG.");
  const check = () => options.signal.throwIfAborted();
  check();
  const bytes = await file.arrayBuffer();
  const hash = await digest(bytes);
  let worker: Worker | undefined;
  let pdf: import("pdfjs-dist").PDFDocumentProxy | undefined;
  let loading: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
  const cancel = () => {
    void worker?.terminate().catch(() => {});
    void loading?.destroy().catch(() => {});
  };
  options.signal.addEventListener("abort", cancel, { once: true });
  async function recognize(canvas: HTMLCanvasElement) {
    check();
    if (!worker) {
      options.progress("Loading local OCR engine and language model…");
      const { createWorker } = await import("tesseract.js");
      const pendingWorker = createWorker(options.language, 1, {
        workerPath: new URL(
          import.meta.env.BASE_URL + "vendor/tesseract/worker.min.js",
          location.origin,
        ).href,
        corePath: new URL(
          import.meta.env.BASE_URL + "vendor/tesseract",
          location.origin,
        ).href,
        langPath: new URL(
          import.meta.env.BASE_URL + "vendor/lang",
          location.origin,
        ).href,
        workerBlobURL: false,
        logger: (m) => {
          if (!options.signal.aborted)
            options.progress(
              `${file.name}: ${m.status}${m.progress !== undefined ? ` ${Math.round(m.progress * 100)}%` : ""}`,
            );
        },
      });
      worker = await abortable(
        pendingWorker.then(async (w) => {
          if (options.signal.aborted) {
            await w.terminate();
            throw new Error("Import cancelled.");
          }
          return w;
        }),
        options.signal,
      );
      check();
    }
    const { data } = await abortable(worker!.recognize(canvas), options.signal);
    check();
    return { text: data.text, confidence: data.confidence };
  }
  try {
    let capturedAt = today(),
      dateOrigin = "Import date default — confirm actual capture date";
    const pages: TextPage[] = [];
    if (/\.pdf$/i.test(file.name)) {
      options.progress(`Reading ${file.name}…`);
      const lib = await import("pdfjs-dist");
      const workerUrl = (
        await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
      ).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      loading = lib.getDocument({
        data: new Uint8Array(bytes),
      });
      let rejectPassword: (reason: Error) => void = () => {};
      const locked = new Promise<never>((_resolve, reject) => {
        rejectPassword = reject;
      });
      loading.onPassword = () => {
        rejectPassword(
          new Error(
            "Password-protected PDF: save an unlocked copy and try again.",
          ),
        );
        void loading?.destroy().catch(() => {});
      };
      pdf = await abortable(
        Promise.race([loading.promise, locked]),
        options.signal,
      );
      check();
      if (pdf.numPages > 30)
        throw new Error("PDF exceeds 30 pages. Split it into smaller files.");
      const metadata = await pdf.getMetadata().catch(() => null);
      const creation = metadataDate(
        (metadata?.info as { CreationDate?: string } | undefined)?.CreationDate,
      );
      if (creation) {
        capturedAt = creation;
        dateOrigin = "PDF creation metadata — not proof of price validity";
      }
      for (let i = 1; i <= pdf.numPages; i++) {
        check();
        options.progress(`${file.name}: page ${i} of ${pdf.numPages}`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = textRows(
          content.items.filter(
            (
              item,
            ): item is import("pdfjs-dist/types/src/display/api").TextItem =>
              "str" in item,
          ),
        );
        if (text.replace(/\s/g, "").length >= 30 && !options.forceOcr)
          pages.push({ page: i, text, method: "pdf-text" });
        else {
          const vp = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(2.5, 2400 / Math.max(vp.width, vp.height)),
          });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            const render = page.render({ canvas, viewport });
            const stopRender = () => render.cancel();
            options.signal.addEventListener("abort", stopRender, {
              once: true,
            });
            try {
              await render.promise;
            } finally {
              options.signal.removeEventListener("abort", stopRender);
            }
            pages.push({
              page: i,
              ...(await recognize(canvas)),
              method: "ocr",
            });
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        page.cleanup();
      }
    } else {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 40000000)
          throw new Error(
            "Image exceeds 40 megapixels. Resize it before importing.",
          );
        const scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(bitmap.width * scale);
        canvas.height = Math.ceil(bitmap.height * scale);
        try {
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          pages.push({ page: 1, ...(await recognize(canvas)), method: "ocr" });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        bitmap.close();
      }
    }
    check();
    return { name: file.name, hash, pages, capturedAt, dateOrigin };
  } catch (e) {
    if (options.signal.aborted)
      throw new Error("Import cancelled. Saved trip data was not changed.");
    if ((e as Error).name === "PasswordException")
      throw new Error(
        "Password-protected PDF: save an unlocked copy and try again.",
      );
    throw new Error(
      (e as Error).message ||
        "Could not read this document. Try copying its text or adding a manual entry.",
    );
  } finally {
    options.signal.removeEventListener("abort", cancel);
    await worker?.terminate().catch(() => {});
    await loading?.destroy().catch(() => {});
  }
}
