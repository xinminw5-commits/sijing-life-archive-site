import type { Metadata } from "next";
import { PreviewWorkspace } from "./PreviewWorkspace";
export const metadata: Metadata = { title: "账号与互动功能预览 · 四境人生档案", robots: { index: false, follow: false } };
export default function PreviewPage() { return <PreviewWorkspace />; }
