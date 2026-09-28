import { ImageResponse } from "next/og";
import { Mark } from "@/components/brand/logo";
import { brand, geistFonts } from "@/lib/brand-image";

export const alt = "Caveman — Type what you want. Caveman builds it.";
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
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: brand.ground,
          backgroundImage: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,106,31,0.18), rgba(255,106,31,0))",
          borderBottom: `6px solid ${brand.ember}`,
          color: brand.fg,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Mark width={56} height={56} />
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "0.14em" }}>CAVEMAN</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontFamily: "Geist Mono", fontSize: 22, letterSpacing: "0.18em", color: brand.ember }}>
            FROM IDEA TO WORKING SOFTWARE
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 600, lineHeight: 1.02, letterSpacing: "-0.035em" }}>
            <span>Type what you want.</span>
            <span style={{ color: brand.emberHot }}>Caveman builds it.</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, fontFamily: "Geist Mono", fontSize: 20, letterSpacing: "0.14em", color: brand.muted }}>
          <span>PLAN</span>
          <span style={{ color: brand.line }}>/</span>
          <span>BUILD</span>
          <span style={{ color: brand.line }}>/</span>
          <span>REVIEW</span>
          <span style={{ color: brand.line }}>/</span>
          <span>DELIVER</span>
        </div>
      </div>
    ),
    { ...size, fonts: await geistFonts() },
  );
}
