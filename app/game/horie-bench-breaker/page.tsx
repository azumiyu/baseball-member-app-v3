import type { Metadata, Viewport } from "next";
import { HorieBenchPage } from "@/components/games/HorieBenchPage";

export const metadata: Metadata = { title: "堀江の引っ張れ！三塁ベンチ破壊！ | YG ミニゲーム", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#141923", viewportFit: "cover" };

export default function HorieBenchBreakerPage() {
  return <HorieBenchPage />;
}
