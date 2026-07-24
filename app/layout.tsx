import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "Predicciones de la Velada VI";
  const description =
    "Elige los ganadores de los 10 combates y vota por el Mejor Outfit de la noche.";

  return {
    metadataBase,
    title,
    description,
    icons: {
      icon: "/velada-logo.png",
      shortcut: "/velada-logo.png",
    },
    openGraph: {
      title,
      description:
        "Diez combates, una clasificación en vivo y el Mejor Outfit de la noche.",
      type: "website",
      url: metadataBase,
      images: [
        {
          url: new URL("/og-outfit.png", metadataBase),
          width: 1774,
          height: 887,
          alt: "Predicciones de la Velada VI y Mejor Outfit",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description:
        "Diez combates, una clasificación en vivo y el Mejor Outfit de la noche.",
      images: [new URL("/og-outfit.png", metadataBase)],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#070a12",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
