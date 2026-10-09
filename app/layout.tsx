import "./globals.css";
export const metadata = { title: "Aangan Receptionist" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body>{children}</body></html>;
}
