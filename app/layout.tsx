import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "四境人生档案 一生万象 映于四境";
const description = "以结构 环境 气机 事件四轴建立可核验 可修正 持续更新的人生命理档案";

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const base = metadataBase(host);
  const socialImage = new URL("/og.png", base).toString();

  return {
    metadataBase: base,
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "zh_CN",
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "四境人生档案" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

function metadataBase(requestHost: string): URL {
  const configuredOrigin = process.env.SITE_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      const configured = new URL(configuredOrigin);
      if (
        configured.protocol === "https:" &&
        configured.pathname === "/" &&
        !configured.username &&
        !configured.password
      ) {
        return configured;
      }
    } catch {
      // Invalid deployment configuration falls through to a non-routable origin.
    }
  }
  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(requestHost)) {
    return new URL(`http://${requestHost}`);
  }
  return new URL("https://example.invalid");
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
