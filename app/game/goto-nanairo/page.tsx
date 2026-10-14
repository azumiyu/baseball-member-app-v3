import type { Metadata, Viewport } from "next";
import { NanairoPage } from "@/components/games/NanairoPage";

export const metadata: Metadata = {
  title: "後藤の投げろ！七色のシンカー！ | YG ミニゲーム",
  description: "七色のシンカーでYGの5打者とフルカウント勝負。狙いとリリース、そして運で三振を奪え！",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#102c2d", viewportFit: "cover" };

export default function GotoNanairoPage() {
  return <NanairoPage />;
}
