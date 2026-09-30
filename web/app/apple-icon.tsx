import { ImageResponse } from "next/og";
import { Cavman } from "@/components/brand/cavman";
import { brand } from "@/lib/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS masks and fills transparency, so Cavman stands on the site's concrete ground.
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
          backgroundColor: brand.ground,
        }}
      >
        <Cavman width={120} height={120} />
      </div>
    ),
    size,
  );
}
