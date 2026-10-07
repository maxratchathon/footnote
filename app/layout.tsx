export const metadata = {
  title: "FootnoteRAG",
  description: "Chat with your docs, with every answer cited.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
