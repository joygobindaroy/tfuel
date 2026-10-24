import { ImageResponse } from "next/og";
import qrcode from "qrcode-generator";

export const config = { runtime: "edge" };

/** QR code as a PNG (Telegram can't show SVG): /api/qr?d=<address> */
export default function handler(req: Request) {
  const d = (new URL(req.url).searchParams.get("d") || "").slice(0, 200);
  if (!d) return new Response("bad request", { status: 400 });
  const qr = qrcode(0, "M");
  qr.addData(d);
  qr.make();
  const n = qr.getModuleCount();
  const m = 4;
  let path = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + m} ${r + m}h1v1h-1z`;
  const size = n + m * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  const src = `data:image/svg+xml;base64,${btoa(svg)}`;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: 640, height: 640, background: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={640} height={640} alt="" />
      </div>
    ),
    { width: 640, height: 640, headers: { "cache-control": "public, max-age=86400, immutable" } }
  );
}
