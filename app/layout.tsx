import type {Metadata} from "next";
import "./globals.css";
export const metadata: Metadata={title:"SwiftLabor | Freight Operations AI",description:"AI agents for freight document reconciliation, exception handling and logistics back-office operations."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}