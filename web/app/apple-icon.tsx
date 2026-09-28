import { ImageResponse } from "next/og";
import { Mark } from "@/components/brand/logo";
import { brand } from "@/lib/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS masks and fills transparency, so the mark sits on the site's ground with a faint ember glow.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle at 50% 40%, rgba(255,106,31,0.22), ${brand.ground} 70%)`,
          backgroundColor: brand.ground,
        }}
      >
        <Mark width={116} height={116} />
      </div>
    ),
    size,
  );
}
