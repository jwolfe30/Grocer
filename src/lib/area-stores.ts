import type { Store } from "./types";

/**
 * Manual store roster for the 98042 area.
 * Kroger/QFC locationIds = division (3) + store (5) from fredmeyer.com / qfc.com URLs.
 */
export const AREA_STORES: Store[] = [
  // —— Fred Meyer (Kroger) ——
  {
    id: "kroger-70100053",
    name: "Fred Meyer Covington",
    chain: "Fred Meyer",
    address: "16735 SE 272nd St, Covington, WA",
    zip: "98042",
    lat: 47.3565,
    lng: -122.1188,
    source: "demo",
    krogerLocationId: "70100053",
  },
  {
    id: "kroger-70100215",
    name: "Fred Meyer Kent Redondo",
    chain: "Fred Meyer",
    address: "25250 Pacific Hwy S, Kent, WA",
    zip: "98032",
    lat: 47.376,
    lng: -122.297,
    source: "demo",
    krogerLocationId: "70100215",
  },
  {
    id: "kroger-70100031",
    name: "Fred Meyer Renton Benson Plaza",
    chain: "Fred Meyer",
    address: "365 Renton Center Way SW, Renton, WA",
    zip: "98057",
    lat: 47.453,
    lng: -122.17,
    source: "demo",
    krogerLocationId: "70100031",
  },
  {
    id: "kroger-70100019",
    name: "Fred Meyer Auburn",
    chain: "Fred Meyer",
    address: "801 Auburn Way N, Auburn, WA",
    zip: "98002",
    lat: 47.311,
    lng: -122.225,
    source: "demo",
    krogerLocationId: "70100019",
  },
  {
    id: "kroger-70100682",
    name: "Fred Meyer Maple Valley",
    chain: "Fred Meyer",
    address: "26520 Maple Valley Black Diamond Rd SE, Maple Valley, WA",
    zip: "98038",
    lat: 47.367,
    lng: -122.037,
    source: "demo",
    krogerLocationId: "70100682",
  },
  // —— QFC (Kroger) ——
  {
    id: "qfc-70500803",
    name: "QFC Kent Riverstone",
    chain: "QFC",
    address: "3505 SE 192nd Ave, Kent, WA",
    zip: "98042",
    lat: 47.426,
    lng: -122.128,
    source: "demo",
    krogerLocationId: "70500803",
  },
  {
    id: "qfc-70500837",
    name: "QFC Maple Valley Wilderness Village",
    chain: "QFC",
    address: "22131 SE 237th St, Maple Valley, WA",
    zip: "98038",
    lat: 47.377,
    lng: -122.044,
    source: "demo",
    krogerLocationId: "70500837",
  },
  {
    id: "qfc-70500871",
    name: "QFC Renton",
    chain: "QFC",
    address: "4800 NE 4th St, Renton, WA",
    zip: "98059",
    lat: 47.481,
    lng: -122.198,
    source: "demo",
    krogerLocationId: "70500871",
  },
  {
    id: "qfc-70500840",
    name: "QFC Sammamish Klahanie",
    chain: "QFC",
    address: "2502 NE Klahanie Dr, Sammamish, WA",
    zip: "98074",
    lat: 47.571,
    lng: -122.017,
    source: "demo",
    krogerLocationId: "70500840",
  },
  // —— Other banners (demo prices; no live API yet) ——
  {
    id: "safeway-covington",
    name: "Safeway Covington",
    chain: "Safeway",
    address: "17245 SE 272nd St, Covington, WA",
    zip: "98042",
    lat: 47.355,
    lng: -122.112,
    source: "demo",
  },
  {
    id: "albertsons-kent",
    name: "Albertsons Kent",
    chain: "Albertsons",
    address: "25800 104th Ave SE, Kent, WA",
    zip: "98030",
    lat: 47.372,
    lng: -122.204,
    source: "demo",
  },
  {
    id: "costco-kent",
    name: "Costco Kent",
    chain: "Costco",
    address: "22101 84th Ave S, Kent, WA",
    zip: "98032",
    lat: 47.417,
    lng: -122.245,
    source: "demo",
  },
  // —— Local co-op demos (rich offer catalog) ——
  {
    id: "green-valley",
    name: "Green Valley Market",
    address: "Demo co-op · South King County",
    zip: "98042",
    lat: 47.36,
    lng: -122.12,
    source: "demo",
  },
  {
    id: "harbor-fresh",
    name: "Harbor Fresh Co-op",
    address: "Demo co-op · South King County",
    zip: "98042",
    lat: 47.365,
    lng: -122.13,
    source: "demo",
  },
];

export function krogerBannerStores(): Store[] {
  return AREA_STORES.filter((s) => Boolean(s.krogerLocationId));
}

export function storeIdForLocationId(locationId: string): string | undefined {
  return AREA_STORES.find((s) => s.krogerLocationId === locationId)?.id;
}
