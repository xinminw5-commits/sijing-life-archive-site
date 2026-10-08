import type { Metadata } from "next";
import { ArchiveAdmin } from "./ArchiveAdmin";
export const metadata: Metadata = { title: "存档管理 · 四境人生档案", robots: { index: false, follow: false } };
export default function AdminPage() { return <ArchiveAdmin />; }
