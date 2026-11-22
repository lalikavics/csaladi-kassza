// A régi táblázat tételneveinek egységesítése importkor (elírások, dátumok, változatok).
// A megnevezés egységes lesz, az eredeti szöveg az `orig` mezőben megmarad.
// Csak közös és egyéni költésekre vonatkozik; a mintát a normalizált névre (normNote) illesztjük.

type Canon = [RegExp, string, string]; // minta, egységes név, kategória

export const CANON: Canon[] = [
  [/^(kaja |bumbu |it-)?lidl[ilkt]?( |\+|$)|^lidlik$|^lidll$/, 'Lidl', 'food'],
  [/^aldi/, 'Aldi', 'food'],
  [/^auch/, 'Auchan', 'food'],
  [/^(lego )?tesco/, 'Tesco', 'food'],
  [/^(it-)?spar( |$)/, 'Spar', 'food'],
  [/^penny/, 'Penny', 'food'],
  [/^cba$/, 'CBA', 'food'],
  [/^(azsia|asia)( ?center|\+azsia)?$/, 'Ázsia Center', 'food'],
  [/^biobolt/, 'Biobolt', 'food'],
  [/^(pek|pekseg|pekseges|piaci pekaru|pipacs.*)$/, 'Pékség', 'food'],
  [/^zoldseges$/, 'Zöldséges', 'food'],
  [/^(kaja|kaj|kajci|kajafele|kasja|bevasarlas|bevasarlasok)$/, 'Bevásárlás', 'food'],
  [/^(sor|sorok)$/, 'Sör', 'food'],
  [/^(ikea kaja|ikeja kaja|ikeja fank)$/, 'IKEA kaja', 'eating'],
  [/^ikea/, 'IKEA', 'shopping'],
  [/^(dm|hstiftek dm)( |-|$)/, 'DM', 'shopping'],
  [/^rossmann$/, 'Rossmann', 'shopping'],
  [/(^|\s)obi( |$)/, 'OBI', 'shopping'],
  [/^decathlon/, 'Decathlon', 'shopping'],
  [/^(tiger|ftiger|flyingtiger)$/, 'Flying Tiger', 'shopping'],
  [/^c&a/, 'C&A', 'shopping'],
  [/^(nov|nov2|novenyek|virag|viragok|vir)$/, 'Virág, növény', 'shopping'],
  [/^(tank|tankolas|tank resze|tankresze|hu-tank|sl-tank|unnepi tank|shell|shell tanki|omv|kut)$/, 'Tankolás', 'fuel'],
  [/^(autopalyam|autopalyamatr?c?iak|autopalyamatricak|palyamatrica)$/, 'Autópálya-matrica', 'car'],
  [/^bkk$/, 'BKK', 'transit'],
  [/^(vonaljegy|vonat oda-vissza)$/, 'Vonat', 'transit'],
  [/^(berleti|lakber|lakber utal|utalas lakber)$/, 'Bérleti díj', 'housing'],
  [/^rezsi( utal)?( nati)?$/, 'Rezsi', 'utilities'],
  [/^telekom$/, 'Telekom', 'phone'],
  [/^vodafone$/, 'Vodafone', 'phone'],
  [/^(spotify|spoty)$/, 'Spotify', 'streaming'],
  [/^youtube$/, 'YouTube', 'streaming'],
  [/^(google drive|drive)$/, 'Google Drive', 'software'],
  [/^midjourney$/, 'Midjourney', 'software'],
  [/^mixr$/, 'MixR', 'other'],
  [/^(2x )?meki( hazafele)?$/, "McDonald's", 'eating'],
  [/^(wolt )?kfc$/, 'KFC', 'eating'],
  [/^wolt( duo)?$/, 'Wolt', 'eating'],
  [/^(pizza|gyongyos pizza|szulinapi pizza|it-pizzeria|it-toltottpizza|pizza pan)$/, 'Pizza', 'eating'],
  [/^(cafe frei|frei)$/, 'Café Frei', 'eating'],
  [/^ono poke$/, 'Ono Poké', 'eating'],
  [/^(ebed kajalda|kajalda)$/, 'Kajálda', 'eating'],
  [/^(reggeli|ebedek|reggeli \+ ebedek|reggelik \+ ebed|brunch)$/, 'Reggeli, ebéd', 'eating'],
  [/^(nyaralas)$/, 'Nyaralás', 'travel'],
  [/^(szallas|olasz szallas|szloven szallas|slov szall|sl-szallasado|szallas utal)$/, 'Szállás', 'travel'],
  [/^(dohanybolt|doh bolt)$/, 'Dohánybolt', 'other'],
  [/^(2x)?szuro$/, 'Szűrő', 'shopping'],
  [/^h2o2$/, 'H2O2', 'shopping'],
  [/^(gyertyak)$/, 'Gyertya', 'shopping'],
  [/^patika( x2)?$/, 'Patika', 'other'],
  [/^(konyv|konyvek)$/, 'Könyv', 'shopping'],
  [/^(wcpapir|wc paper)$/, 'WC-papír', 'shopping'],
  [/^(aji|aji-|ajik)$/, 'Ajándék', 'other'],
  [/^(bazsalik|bazsalikom)$/, 'Bazsalikom', 'food'],
  [/^(kokuszcuk|kokuszcukor)$/, 'Kókuszcukor', 'food'],
  [/^(herb swiss|herbal swiss)$/, 'Herbal Swiss', 'other'],
  [/^(buzakovasz)$/, 'Búzakovász', 'food'],
  [/^(kave)$/, 'Kávé', 'eating'],
  [/^(sinsay|shein|ruha|pulcsik)$/, 'Ruha', 'shopping'],
];

/** Egységes név és kategória a normalizált névhez, vagy null. */
export function canonFor(key: string): { note: string; category: string } | null {
  for (const [re, note, category] of CANON) if (re.test(key)) return { note, category };
  return null;
}
