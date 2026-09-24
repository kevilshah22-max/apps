import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"Gnu Launchpad",description:"A product command centre for turning ideas into shipped products."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}