import { api } from "@shared/routes";
import { useEffect, useMemo, useState } from "react";

function extractFirstUrlCandidate(value: string) {
  const matches = value.match(/https?:\/\/.+?(?=https?:\/\/|$)/gi) ?? [];

  for (const match of matches) {
    const candidate = match.trim().replace(/[),.;]+$/, "");
    try {
      return new URL(candidate).toString();
    } catch {
      continue;
    }
  }

  return null;
}

export function normalizeIdCardPortraitUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const urlCount = trimmed.match(/https?:\/\//gi)?.length ?? 0;
  const urlCandidates = urlCount > 1
    ? [extractFirstUrlCandidate(trimmed)]
    : [trimmed, extractFirstUrlCandidate(trimmed)];

  for (const candidate of urlCandidates) {
    if (!candidate) continue;

    try {
      return new URL(candidate).toString();
    } catch {
      continue;
    }
  }

  return null;
}

function inferImageMimeType(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".avif")) return "image/avif";
  return null;
}

async function readImageAsDataUrl(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: "include" });
  if (!response.ok) throw new Error(`Failed to load QR portrait: ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const imageType = contentType?.startsWith("image/") ? contentType : inferImageMimeType(url);
  if (!imageType) throw new Error("Unable to infer QR portrait image type");

  const blob = new Blob([await response.arrayBuffer()], { type: imageType });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read QR portrait data"));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read QR portrait data"));
    reader.readAsDataURL(blob);
  });
}

export function buildIdCardPortraitProxyUrl(rawUrl?: string | null, origin = typeof window === "undefined" ? null : window.location.origin) {
  const normalizedUrl = normalizeIdCardPortraitUrl(rawUrl);
  if (!normalizedUrl || !origin) return normalizedUrl;
  if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) return normalizedUrl;

  const portraitUrl = new URL(normalizedUrl);
  if (portraitUrl.origin === origin) return normalizedUrl;

  const proxyUrl = new URL(api.qrAttendance.portraitProxy.path, origin);
  proxyUrl.searchParams.set("url", normalizedUrl);
  return proxyUrl.toString();
}

export async function resolveIdCardPortraitUrl(rawUrl?: string | null, signal?: AbortSignal) {
  const normalizedUrl = normalizeIdCardPortraitUrl(rawUrl);
  if (!normalizedUrl || typeof window === "undefined") return normalizedUrl;
  if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) return normalizedUrl;

  const proxyUrl = buildIdCardPortraitProxyUrl(normalizedUrl);
  if (!proxyUrl || proxyUrl === normalizedUrl) return normalizedUrl;

  try {
    return await readImageAsDataUrl(proxyUrl, signal ?? new AbortController().signal);
  } catch {
    return proxyUrl;
  }
}

export function useIdCardPortraitUrl(rawUrl?: string | null) {
  const normalizedUrl = useMemo(() => normalizeIdCardPortraitUrl(rawUrl), [rawUrl]);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(normalizedUrl);

  useEffect(() => {
    setResolvedUrl(normalizedUrl);
  }, [normalizedUrl]);

  useEffect(() => {
    if (!normalizedUrl || typeof window === "undefined") return;
    if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) return;

    const portraitUrl = new URL(normalizedUrl);
    if (portraitUrl.origin === window.location.origin) return;

    const controller = new AbortController();
    let active = true;

    resolveIdCardPortraitUrl(normalizedUrl, controller.signal)
      .then((dataUrl) => {
        if (active) setResolvedUrl(dataUrl);
      })
      .catch(() => {
        if (active) setResolvedUrl(normalizedUrl);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [normalizedUrl]);

  return resolvedUrl;
}

type IdCardPortraitProps = {
  src?: string | null;
  alt: string;
  initials: string;
  fallbackClassName: string;
};

export function IdCardPortrait({ src, alt, initials, fallbackClassName }: IdCardPortraitProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-full min-h-[132px] w-full rounded-[1.1rem] object-cover"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <div className={fallbackClassName}>{initials}</div>;
}