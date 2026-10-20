import type { Metadata, Viewport } from "next";
import { MarathonPage } from "@/components/games/MarathonPage";

export const metadata: Metadata = {
  title: "小林の走れ！マラソン！ | YG ミニゲーム",
  description: "ずっと走る小林を、みんなの給水で応援。累計給水量で競うチーム共有ゲーム。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#193c36", viewportFit: "cover" };

export default function Page() {
  return <MarathonPage />;
}
