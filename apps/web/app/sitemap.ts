import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexora-forge.example.com";
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: siteUrl + "/cloud", changeFrequency: "weekly", priority: 0.8 },
    { url: siteUrl + "/cloud/pipeline", changeFrequency: "monthly", priority: 0.7 },
    { url: siteUrl + "/dashboard", changeFrequency: "monthly", priority: 0.6 },
  ];
}
