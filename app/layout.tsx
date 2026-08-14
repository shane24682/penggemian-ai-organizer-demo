import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "碰个面｜AI校园活动主理人",
  description: "说一句就成局：AI帮你找同学、订场地、凑人数与管理活动。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
