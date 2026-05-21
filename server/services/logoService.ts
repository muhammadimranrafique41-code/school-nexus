import { readFile } from "fs/promises";

const mimeMap: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
};

export async function resolveImageBuffer(src: string): Promise<Buffer | null> {
  if (!src) return null;

  try {
    let filePath = src;
    if (src.startsWith("file://")) filePath = src.slice(7);
    return await readFile(filePath);
  } catch {}

  try {
    const url = src.startsWith("http://") || src.startsWith("https://")
      ? src
      : `https://${src}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function estimateLogoHeight(logoBuffer: Buffer | null, maxWidth: number, maxHeight: number): number {
  if (!logoBuffer) return 0;
  return Math.min(maxHeight, maxWidth);
}
