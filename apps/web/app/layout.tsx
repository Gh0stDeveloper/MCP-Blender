import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexora-forge.example.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Nexora Forge MCP — AI-native Blender production",
    template: "%s | Nexora Forge MCP",
  },
  description:
    "Secure MCP gateway and Blender extension for AI-assisted 3D modeling, rigging, animation, game assets, environments, weapons, characters and production workflows.",
  keywords: [
    "Blender MCP",
    "AI Blender automation",
    "3D AI tools",
    "game asset pipeline",
    "Blender rigging automation",
    "Model Context Protocol",
    "MCP server",
  ],
  openGraph: {
    type: "website",
    title: "Nexora Forge MCP",
    description: "AI-native 3D production for Blender.",
    url: siteUrl,
    siteName: "Nexora Forge MCP",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexora Forge MCP",
    description: "AI-native 3D production for Blender.",
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07090d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nexora Forge MCP",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    description:
      "Secure AI-native MCP gateway and Blender extension for professional 3D production.",
    softwareVersion: "0.1.0",
  };

  return (
    <html lang="en">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
