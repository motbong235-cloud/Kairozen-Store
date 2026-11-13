/** Demo + merge with Khmer TopUp when API ready */
export const DEMO_GAMES = [
  {
    id: "mlbb",
    name: "Mobile Legends",
    tag: "Diamonds",
    packs: [
      { id: "mlbb-86", name: "86 Diamonds", price: 1.2 },
      { id: "mlbb-172", name: "172 Diamonds", price: 2.3 },
      { id: "mlbb-257", name: "257 Diamonds", price: 3.4 },
      { id: "mlbb-706", name: "706 Diamonds", price: 9.0 },
    ],
  },
  {
    id: "ff",
    name: "Free Fire",
    tag: "Diamonds",
    packs: [
      { id: "ff-100", name: "100 Diamonds", price: 0.99 },
      { id: "ff-310", name: "310 Diamonds", price: 2.99 },
      { id: "ff-520", name: "520 Diamonds", price: 4.99 },
    ],
  },
  {
    id: "pubg",
    name: "PUBG Mobile",
    tag: "UC",
    packs: [
      { id: "pubg-60", name: "60 UC", price: 0.99 },
      { id: "pubg-325", name: "325 UC", price: 4.99 },
      { id: "pubg-660", name: "660 UC", price: 9.99 },
    ],
  },
  {
    id: "roblox",
    name: "Roblox",
    tag: "Robux",
    packs: [
      { id: "rbx-80", name: "80 Robux", price: 0.99 },
      { id: "rbx-400", name: "400 Robux", price: 4.99 },
      { id: "rbx-800", name: "800 Robux", price: 9.99 },
    ],
  },
  {
    id: "genshin",
    name: "Genshin Impact",
    tag: "Genesis",
    packs: [
      { id: "gi-60", name: "60 Crystal", price: 0.99 },
      { id: "gi-300", name: "300+30", price: 4.99 },
    ],
  },
  {
    id: "codm",
    name: "COD Mobile",
    tag: "CP",
    packs: [
      { id: "cod-80", name: "80 CP", price: 0.99 },
      { id: "cod-420", name: "420 CP", price: 4.99 },
    ],
  },
];

export function findPack(gameId, packId) {
  const game = DEMO_GAMES.find((g) => g.id === gameId);
  if (!game) return null;
  const pack = game.packs.find((p) => p.id === packId);
  if (!pack) return null;
  return { game, pack };
}

export function publicCatalog() {
  return DEMO_GAMES.map((g) => ({
    id: g.id,
    name: g.name,
    tag: g.tag,
    packs: g.packs.map((p) => ({ id: p.id, name: p.name, price: p.price })),
  }));
}
