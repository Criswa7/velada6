export type FighterProfile = {
  age: number;
  height: string;
  weighInKg: number | null;
  role: string;
  bio: string;
};

export const OFFICIAL_EVENT_URL = "https://www.infolavelada.com/";
export const WEIGH_IN_SOURCE_URL =
  "https://los40.com/2026/07/24/el-pesaje-de-la-velada-del-ano-vi-en-directo-cuanto-pesa-cada-uno-de-los-streamers-y-ultimas-polemicas/";

export const FIGHTER_PROFILES = {
  "la-parce": {
    age: 24,
    height: "1,58 m",
    weighInKg: 51.5,
    role: "Streamer · videojuegos y lifestyle",
    bio: "Valeria Solano es una streamer colombiana nacida en Cúcuta y radicada en Medellín. Empezó transmitiendo Call of Duty y hoy crea contenido de videojuegos, reacciones, viajes y estilo de vida.",
  },
  "fabiana-sevillano": {
    age: 24,
    height: "1,65 m",
    weighInKg: 51.8,
    role: "Creadora · moda y lifestyle",
    bio: "Creadora sevillana que se hizo popular en TikTok e Instagram por su estilo natural y contenido de moda y vida cotidiana. En La Velada pelea en casa frente a La Parce.",
  },
  clersss: {
    age: 24,
    height: "1,67 m",
    weighInKg: 55.4,
    role: "Creadora · humor y lifestyle",
    bio: "Clara Merino es una creadora española conocida por sus vídeos de humor, estilo de vida y reflexiones cotidianas. La Velada supone su debut en el ring.",
  },
  "natalia-mx": {
    age: 26,
    height: "1,68 m",
    weighInKg: 55.4,
    role: "Streamer · gaming y entretenimiento",
    bio: "Natalia García es una streamer mexicana de videojuegos y entretenimiento. También preside Cuervos en la Queens League Américas y llega respaldada por una gran comunidad digital.",
  },
  "edu-aguirre": {
    age: 38,
    height: "1,80 m",
    weighInKg: 71.3,
    role: "Periodista deportivo",
    bio: "Periodista madrileño y uno de los rostros más reconocibles de El Chiringuito de Jugones. Sus debates de fútbol y su cercanía con Cristiano Ronaldo alimentan el duelo mediático España–Argentina.",
  },
  "gaston-edul": {
    age: 30,
    height: "1,70 m",
    weighInKg: 73.8,
    role: "Periodista deportivo",
    bio: "Periodista argentino de TyC Sports especializado en la Selección Argentina. Ganó gran popularidad por sus coberturas de la Copa América y el Mundial de Qatar 2022.",
  },
  "marta-diaz": {
    age: 25,
    height: "1,68 m",
    weighInKg: 56.4,
    role: "Influencer · moda y lifestyle",
    bio: "Influencer, modelo y creadora española enfocada en moda, belleza, viajes y estilo de vida. Su enorme comunidad la convirtió en una de las participantes más conocidas de esta edición.",
  },
  "tatiana-kaer": {
    age: 21,
    height: "1,65 m",
    weighInKg: 56.4,
    role: "Creadora · baile y entretenimiento",
    bio: "Creadora y modelo española conocida en TikTok por sus vídeos de humor, bailes, moda y lifestyle. Llega como una de las figuras digitales con mayor alcance de toda la cartelera.",
  },
  viruzz: {
    age: 34,
    height: "1,83 m",
    weighInKg: 77.3,
    role: "Streamer · deporte y boxeo",
    bio: "YouTuber y streamer español, exjugador de balonmano y el gran veterano de La Velada. Es el único participante de esta cartelera con varias apariciones previas en el evento.",
  },
  "gero-arias": {
    age: 23,
    height: "1,72 m",
    weighInKg: 76.9,
    role: "Creador fitness",
    bio: "Influencer fitness argentino conocido por sus retos físicos extremos y sus desafíos de dominadas. Llega con experiencia de combate y una preparación construida alrededor de la resistencia.",
  },
  alondrissa: {
    age: 24,
    height: "1,60 m",
    weighInKg: null,
    role: "Streamer · humor y entretenimiento",
    bio: "Creadora puertorriqueña de entretenimiento, humor, retos y vlogs. Se convirtió en la primera representante de Puerto Rico en participar en La Velada del Año.",
  },
  "angie-velasco": {
    age: 27,
    height: "1,56 m",
    weighInKg: null,
    role: "YouTuber · vlogs y entretenimiento",
    bio: "Creadora argentina de Rosario conocida por sus vlogs, historias personales y vídeos de entretenimiento. Su antigua amistad con Alondrissa da contexto a uno de los cruces más tensos.",
  },
  "lit-killah": {
    age: 26,
    height: "1,72 m",
    weighInKg: 61.4,
    role: "Rapero y freestyler",
    bio: "Artista argentino surgido de las batallas de El Quinto Escalón. Hoy es uno de los referentes de la música urbana en español y lleva esa rivalidad artística al cuadrilátero.",
  },
  "kidd-keo": {
    age: 30,
    height: "1,70 m",
    weighInKg: 65.7,
    role: "Rapero y artista urbano",
    bio: "Artista alicantino, pionero del trap español y fundador de DBT Empire. Es conocido por una propuesta bilingüe que mezcla trap, rap y una identidad visual muy marcada.",
  },
  "samy-rivers": {
    age: 27,
    height: "1,58 m",
    weighInKg: 50.6,
    role: "Streamer · gaming y entretenimiento",
    bio: "Streamer mexicana conocida por sus directos de videojuegos y entretenimiento. Preside PIO FC y regresa a La Velada después de disputar dos combates en la tercera edición.",
  },
  roro: {
    age: 24,
    height: "1,50 m",
    weighInKg: 50.6,
    role: "Creadora · cocina y lifestyle",
    bio: "Creadora española que se hizo viral preparando recetas elaboradas, además de contenido de moda y manualidades. Busca revancha tras completar lesionada su combate de La Velada V.",
  },
  plex: {
    age: 24,
    height: "1,97 m",
    weighInKg: 81.5,
    role: "YouTuber · viajes y retos",
    bio: "Youtuber español conocido por sus retos, videoblogs y series viajando alrededor del mundo. Vuelve al ring después de vencer a El Mariana en La Velada IV.",
  },
  fernanfloo: {
    age: 33,
    height: "1,86 m",
    weighInKg: 73.4,
    role: "YouTuber · gaming y humor",
    bio: "Pionero salvadoreño de YouTube, famoso desde 2011 por sus gameplays, humor y reacciones. Ya ganó en La Velada III y representa a una generación histórica de creadores.",
  },
  illojuan: {
    age: 32,
    height: "≈ 1,82 m",
    weighInKg: 76.7,
    role: "Streamer · gaming y humor",
    bio: "Streamer malagueño de videojuegos y humor espontáneo, con una de las comunidades más grandes de Twitch España. Debuta en el boxeo como protagonista del combate estelar.",
  },
  thegrefg: {
    age: 29,
    height: "1,78 m",
    weighInKg: 76.7,
    role: "YouTuber y streamer",
    bio: "Creador murciano ligado especialmente a Call of Duty y Fortnite. Preside Saiyans FC y llega con experiencia en el ring después de vencer a Westcol en La Velada V.",
  },
} satisfies Record<string, FighterProfile>;

export type FighterProfileSlug = keyof typeof FIGHTER_PROFILES;

export function getFighterProfile(
  slug: string,
): FighterProfile | undefined {
  return FIGHTER_PROFILES[slug as FighterProfileSlug];
}

export function formatWeighIn(weight: number | null): string {
  return weight === null ? "No publicado" : `${String(weight).replace(".", ",")} kg`;
}
