import type { Metadata, Viewport } from "next";
import { FastballPage } from "@/components/games/FastballPage";

export const metadata: Metadata = { title: "押野の出せ！剛速球！ | YG ミニゲーム", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#141923", viewportFit: "cover" };

export default function OshinoFastballPage() {
  return <FastballPage />;
}
