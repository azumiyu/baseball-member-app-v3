import type { Metadata, Viewport } from "next";
import { RamenPage } from "@/components/games/RamenPage";

export const metadata: Metadata = { title: "根岸のすすれ！ラーメン！ | YG ミニゲーム", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#241511", viewportFit: "cover" };

export default function NegishiRamenPage() {
  return <RamenPage />;
}
