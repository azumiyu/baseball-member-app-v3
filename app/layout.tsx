import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
export const metadata: Metadata = {
    title: "YGファイヤーズ公式ページ",
    description: "YGファイヤーズの公式ページとなります。",
    verification: {
        google: "NDjE2nWwTL3EmNub7Puy5p8ax47no_uPnqOb-mwImrI",
    },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="ja">
            <body>{children}</body>

            <script
                type="module"
                src="https://static.cloudflareinsights.com/beacon.min.js"
                data-cf-beacon='{"token": "7cb7a310e5cc4d7a9e34506718100aab"}'
            ></script>
        </html>
    );
}
