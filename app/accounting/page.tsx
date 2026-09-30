import type { Metadata } from "next";
import { AccountingPage } from "@/components/team/accounting/AccountingPage";

export const metadata: Metadata = { title: "会計 | YGチーム", robots: { index: false, follow: false } };
export default function Page() { return <AccountingPage />; }
