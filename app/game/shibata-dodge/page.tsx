import type { Metadata, Viewport } from "next";
import { ShibataDodgePage } from "@/components/games/ShibataDodgePage";

export const metadata: Metadata = { title: "芝田の避けろ！死球！！ | YG ミニゲーム", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#1a1b17", viewportFit: "cover" };

export default function ShibataDodgeGamePage() {
  return <ShibataDodgePage />;
}
