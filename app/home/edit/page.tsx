import type { Metadata } from "next";
import { HomeEditor } from "@/components/home/HomeEditor";

export const metadata: Metadata = {
  title: "ホームページ編集 | YG FIRES",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <HomeEditor />;
}
