import { ImageResponse } from "next/og";
import { Cavman } from "@/components/brand/cavman";
import { brand } from "@/lib/brand-image";

// Rendered at 2x so the tab icon stays crisp on high-density screens.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.paper,
          border: `4px solid ${brand.ink}`,
          borderRadius: 14,
        }}
      >
        <Cavman width={46} height={46} />
      </div>
    ),
    size,
  );
}
