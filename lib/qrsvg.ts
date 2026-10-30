import qrcode from "qrcode-generator";

/** QR code as an SVG data URL (works inside next/og images): modules are crisp squares with a white quiet zone */
export function qrDataUrl(text: string, dark = "#000", light = "#fff"): string {
  const qr = qrcode(0, "M");
  qr.addData(String(text).slice(0, 300));
  qr.make();
  const n = qr.getModuleCount(), m = 2;
  let path = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + m} ${r + m}h1v1h-1z`;
  const size = n + m * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
