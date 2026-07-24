export const EVENT_NAME = "Predicciones de la Velada VI";
export const EVENT_DATE_LABEL = "Sábado 25 de julio";
export const EVENT_LOCK_AT = "2026-07-25T17:45:00.000Z";

export type Fighter = {
  name: string;
  slug: string;
  flag: string;
  country: string;
};

export type Fight = {
  id: number;
  label: string;
  weight: number;
  fighterA: Fighter;
  fighterB: Fighter;
};

export const FIGHTS: Fight[] = [
  {
    id: 1,
    label: "Combate 01",
    weight: 1,
    fighterA: { name: "La Parce", slug: "la-parce", flag: "🇨🇴", country: "Colombia" },
    fighterB: {
      name: "Fabiana Sevillano",
      slug: "fabiana-sevillano",
      flag: "🇪🇸",
      country: "España",
    },
  },
  {
    id: 2,
    label: "Combate 02",
    weight: 1,
    fighterA: { name: "Clersss", slug: "clersss", flag: "🇪🇸", country: "España" },
    fighterB: { name: "Natalia MX", slug: "natalia-mx", flag: "🇲🇽", country: "México" },
  },
  {
    id: 3,
    label: "Combate 03",
    weight: 1,
    fighterA: { name: "Edu Aguirre", slug: "edu-aguirre", flag: "🇪🇸", country: "España" },
    fighterB: { name: "Gastón Edul", slug: "gaston-edul", flag: "🇦🇷", country: "Argentina" },
  },
  {
    id: 4,
    label: "Combate 04",
    weight: 1,
    fighterA: { name: "Marta Díaz", slug: "marta-diaz", flag: "🇪🇸", country: "España" },
    fighterB: { name: "Tatiana Käer", slug: "tatiana-kaer", flag: "🇪🇸", country: "España" },
  },
  {
    id: 5,
    label: "Combate 05",
    weight: 1,
    fighterA: { name: "Viruzz", slug: "viruzz", flag: "🇪🇸", country: "España" },
    fighterB: { name: "Gero Arias", slug: "gero-arias", flag: "🇦🇷", country: "Argentina" },
  },
  {
    id: 6,
    label: "Combate 06",
    weight: 1,
    fighterA: { name: "Alondrissa", slug: "alondrissa", flag: "🇵🇷", country: "Puerto Rico" },
    fighterB: { name: "Angie Velasco", slug: "angie-velasco", flag: "🇦🇷", country: "Argentina" },
  },
  {
    id: 7,
    label: "Combate 07",
    weight: 1,
    fighterA: { name: "Lit Killah", slug: "lit-killah", flag: "🇦🇷", country: "Argentina" },
    fighterB: { name: "Kidd Keo", slug: "kidd-keo", flag: "🇪🇸", country: "España" },
  },
  {
    id: 8,
    label: "Combate 08",
    weight: 1,
    fighterA: { name: "Samy Rivers", slug: "samy-rivers", flag: "🇲🇽", country: "México" },
    fighterB: { name: "RoRo", slug: "roro", flag: "🇪🇸", country: "España" },
  },
  {
    id: 9,
    label: "Coestelar",
    weight: 1,
    fighterA: { name: "Plex", slug: "plex", flag: "🇪🇸", country: "España" },
    fighterB: { name: "Fernanfloo", slug: "fernanfloo", flag: "🇸🇻", country: "El Salvador" },
  },
  {
    id: 10,
    label: "Combate estelar",
    weight: 2,
    fighterA: { name: "IlloJuan", slug: "illojuan", flag: "🇪🇸", country: "España" },
    fighterB: { name: "TheGrefg", slug: "thegrefg", flag: "🇪🇸", country: "España" },
  },
];

export function winnerIsValid(fightId: number, winnerSlug: string): boolean {
  const fight = FIGHTS.find((item) => item.id === fightId);
  return Boolean(
    fight &&
      (fight.fighterA.slug === winnerSlug || fight.fighterB.slug === winnerSlug),
  );
}

export function getFight(fightId: number): Fight | undefined {
  return FIGHTS.find((fight) => fight.id === fightId);
}
