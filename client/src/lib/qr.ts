export function buildQrImageUrl(token: string, size = 280) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(token)}`;
}

export async function copyToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available in this browser")
  }

  await navigator.clipboard.writeText(value)
}
