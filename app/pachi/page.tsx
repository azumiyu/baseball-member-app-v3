import type { Metadata, Viewport } from "next";
import { PachinkoPage } from "@/components/pachi/PachinkoPage";

export const metadata: Metadata = {
  title: "YG NIGHT STADIUM | YGパチンコ",
  description: "その一球が、逆転を呼ぶ。連続発射、保留、野球リーチ、右打ちRUSH。YGオリジナルの無料バーチャルパチンコ。",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#08090e", viewportFit: "cover" };

export default function PachiPage() {
  return <PachinkoPage />;
}
