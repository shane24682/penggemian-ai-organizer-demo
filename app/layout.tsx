import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "碰个面｜校园活动主理人",
  description: "说一句就成局",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
