import { ImageResponse } from "next/og";
import { Mark } from "@/components/brand/logo";

// Rendered at 2x so the tab icon stays crisp on high-density screens.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Mark width={64} height={64} />
      </div>
    ),
    size,
  );
}
