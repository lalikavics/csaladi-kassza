// Build-beállítások. A webes (közös) változatnál a Firebase webes beállítása a VITE_FIREBASE változóban érkezik.
// Ez nem titok: a Firebase webes kulcsa nyilvános, az adatot a titkosítás és a hozzáférési szabályok védik.
export const SHARED = import.meta.env.VITE_TARGET === 'web';
const raw = import.meta.env.VITE_FIREBASE as string | undefined;
export const firebaseConfig: Record<string, string> | null = raw ? JSON.parse(raw) : null;
