import type { Metadata, Viewport } from "next";
import { HorseRacingPage } from "@/components/games/HorseRacingPage";

export const metadata: Metadata = { title: "長安の走れ！馬ども！ | YG ミニゲーム", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#141923", viewportFit: "cover" };

export default function NagayasuHorseRacingPage() {
  return <HorseRacingPage />;
}
