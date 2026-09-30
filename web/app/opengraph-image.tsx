import { ImageResponse } from "next/og";
import { Cavman } from "@/components/brand/cavman";
import { brand, brandFonts } from "@/lib/brand-image";

export const alt = "Cavman: we dug up a caveman who builds software.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: brand.ground,
          backgroundImage:
            "linear-gradient(to right, rgba(20,20,20,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,20,20,0.09) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          color: brand.fg,
          fontFamily: "Archivo",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 84,
            right: -134,
            width: 620,
            display: "flex",
            justifyContent: "center",
            transform: "rotate(28deg)",
            backgroundColor: brand.duck,
            borderTop: `10px solid ${brand.ink}`,
            borderBottom: `10px solid ${brand.ink}`,
            padding: "10px 0",
            fontFamily: "Rubik Mono One",
            fontSize: 15,
          }}
        >
          DO NOT DISTURB THE SPECIMEN
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: 780 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Cavman width={56} height={56} />
            <div style={{ fontFamily: "Rubik Mono One", fontSize: 30 }}>CAVMAN</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 20, letterSpacing: "0.08em", color: brand.muted }}>
              SITE: CAVMAN.DEV · GRID C4 · LAYER 0
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Rubik Mono One", fontSize: 62, lineHeight: 1.1 }}>
              <span>We dug up a</span>
              <span>caveman who</span>
              <span style={{ display: "flex" }}>
                <span style={{ backgroundColor: brand.duck, padding: "0 10px" }}>builds software.</span>
              </span>
            </div>
          </div>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 20, color: brand.muted }}>fire was a good start.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 70 }}>
          <div
            style={{
              width: 300,
              height: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.7)",
              border: `5px solid ${brand.ink}`,
              borderRadius: 14,
            }}
          >
            <Cavman width={220} height={220} />
          </div>
          <div style={{ width: 330, height: 22, backgroundColor: brand.ink, borderRadius: "4px 4px 0 0" }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: -2,
              transform: "rotate(-3deg)",
              backgroundColor: brand.paper,
              border: `3px solid ${brand.ink}`,
              borderRadius: 6,
              padding: "10px 16px",
              fontFamily: "JetBrains Mono",
              fontSize: 18,
            }}
          >
            <span style={{ fontFamily: "Rubik Mono One", fontSize: 18 }}>SPECIMEN 001</span>
            <span>homo buildicus · alive</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
