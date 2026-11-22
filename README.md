# Családi kassza

Két személyes közös kassza (teszt). Közös költések, pénzadás, rendezés, egyéni költések, ismétlődő tételek, havi lezárás közös jóváhagyással.

- Az app: https://lalikavics.github.io/csaladi-kassza/
- Az adat végponttól végpontig titkosítva van (a meghívó link titkos része + PIN); a Firebase-ben csak olvashatatlan adat tárolódik.
- Ebben a repóban csak a kód van, adat nincs. A `gh-pages` ág a lefordított webes változat.

Fejlesztés: `npm install` · tesztek: `npx vitest run` · helyi egyfájlos változat: `npm run build` ·
webes változat: `VITE_TARGET=web npx vite build --mode web --outDir dist-web` · Firestore-szabályok: `firestore.rules`.
