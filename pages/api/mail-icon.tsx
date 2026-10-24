import { ImageResponse } from "next/og";
import { SOCIALS } from "@/lib/socials";

export const config = { runtime: "edge" };

/** Round brand icon as PNG for email footers (mail apps block SVG): /api/mail-icon?k=telegram */
export default function handler(req: Request) {
  const k = new URL(req.url).searchParams.get("k") || "";
  const ic = Object.prototype.hasOwnProperty.call(SOCIALS, k) ? SOCIALS[k] : null;
  if (!ic) return new Response("not found", { status: 404 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 36 36"><path d="${ic.path}" fill="#fff"/></svg>`;
  const src = `data:image/svg+xml;base64,${btoa(svg)}`;
  return new ImageResponse(
    (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 96, height: 96, background: ic.color, borderRadius: 48 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={64} height={64} alt="" />
      </div>
    ),
    { width: 96, height: 96, headers: { "cache-control": "public, max-age=604800, immutable" } }
  );
}
