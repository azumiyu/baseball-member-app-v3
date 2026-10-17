import type { Metadata, Viewport } from "next";
import { YgRoyalePage } from "@/components/games/YgRoyalePage";

export const metadata: Metadata = {
  title: "YGクラロワ | YG ミニゲーム",
  description: "おなじみのメンバーを召喚し、無限のキングタワーに与えたダメージで競うリアルタイム防衛ゲーム。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0d2031", viewportFit: "cover" };

export default function YgRoyaleGamePage() {
  return <YgRoyalePage />;
}
