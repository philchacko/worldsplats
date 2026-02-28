// src/data/presets.ts

// ─── Asset mode ─────────────────────────────────────────────
// 'local'    → serve from /public  (no network dependency, good for dev)
// 'supabase' → stream from Supabase Storage (scalable, assets live remotely)
export type AssetMode = 'local' | 'supabase';
export const ASSET_MODE: AssetMode = (process.env.NEXT_PUBLIC_ASSET_MODE as AssetMode) || 'local';

// Base URL for Supabase Storage public bucket.
// Only used when ASSET_MODE === 'supabase'.
// Set via NEXT_PUBLIC_SUPABASE_STORAGE_BASE or edit the fallback below.
export const SUPABASE_STORAGE_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BASE ||
  'https://YOUR_PROJECT.supabase.co/storage/v1/object/public';

/** Resolve an asset path depending on current mode. */
function assetUrl(localPath: string, remotePath: string): string {
  return ASSET_MODE === 'supabase'
    ? `${SUPABASE_STORAGE_BASE}/${remotePath}`
    : localPath;
}

/** Derive the collider .glb URL from a splat .spz URL by replacing the extension. */
export function colliderUrlFromSplatUrl(splatUrl: string): string {
  return splatUrl.replace(/\.(spz|ply)$/, '.glb');
}

// ─── Music pool ─────────────────────────────────────────────
// Worlds loaded from the DB may not have a music file.
// In that case we pick from this pool (round-robin by index).
export const MUSIC_POOL = [
  'music/Sunlit_Grove_Ambient.mp3',
  'music/Sunset_Focus.mp3',
  'music/Neon_Night_Reverie.mp3',
  'music/Tranquil_Fields.mp3',
  'music/Cartoon_Cozy_Theme.mp3',
  'music/Sunset_Boulevard_Serenade.mp3',
];

export type WorldDef = {
  id: string;
  name: string;
  url: string;             // .spz or .ply (Spark auto-detects)
  imageUrl: string;
  musicUrl?: string;        // optional — worlds from DB may not have music
  imageCredit?: string;
  colliderUrl?: string;    // per-world collider .glb — defaults to splat URL with .glb extension
  colliderQuaternion?: [number, number, number, number]; // override rotation for collider only (x,y,z,w) — use when collider GLB was exported in a different orientation than the splat
  position?: [number, number, number];
  quaternion?: [number, number, number, number]; // x,y,z,w
  scale?: number;
  spawn?: [number, number, number]; // player spawn position — defaults to UNIVERSE_CONFIG.PLAYER.START
  guide: string;
};

export type ObjectDef =
  | {
      id: string;
      name: string;
      kind: 'primitive';
      shape: 'sphere' | 'box' | 'icosahedron';
      scale?: number;
      mass?: number;
      collider?: 'ball' | 'cuboid';
    }
  | {
      id: string;
      name: string;
      kind: 'gltf';
      url: string;
      scale?: number;
      mass?: number;
      collider?: 'hull'; // for complex meshes
    };

export const WORLDS: WorldDef[] = [
  {
    id: 'miami-living-room',
    name: 'Miami Living Room',
    url: assetUrl('/worlds/Vibrant Miami living room.spz', 'worlds/Vibrant Miami living room.spz'),
    imageUrl: '/worlds/Vibrant Miami living room_prompt.jpg',
    musicUrl: assetUrl('/music/Sunset_Boulevard_Serenade.mp3', 'music/Sunset_Boulevard_Serenade.mp3'),
    colliderUrl: assetUrl('/worlds/Vibrant Miami living room_collider.glb', 'worlds/Vibrant Miami living room_collider.glb'),
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a luxurious, retro-inspired living room in a tropical setting, rendered with a realistic style that exudes a playful yet sophisticated tone. The vibrant colors and mid-century modern furnishings create an inviting and lively atmosphere within this expansive indoor-outdoor space. The floor is composed of a terrazzo pattern featuring shades of green, coral, and white, flowing seamlessly throughout the room and extending to the surrounding areas, hinting at a continuous design motif. A large, curved teal sofa with coral pillows serves as a prominent seating arrangement, facing a substantial, square coffee table in a matching teal hue. This table, made of a polished, lacquered material, holds various decorative objects, including clear glass bowls and books. Across from the teal sofa, two curved coral armchairs with teal throw pillows flank a similar, though smaller, curved coral sofa, creating a cohesive and symmetrical seating arrangement. A tall, wooden bar cabinet, with shelves filled with colorful liquor bottles and glassware, stands against the far wall, illuminated by internal lighting. Adjacent to the bar, a gallery wall displays an array of framed photographs, capturing moments of leisure and travel, arranged in a grid pattern. Large glass sliding doors and expansive windows dominate one entire wall, offering an unobstructed view of a lush, tropical garden with a swimming pool and additional outdoor seating, suggesting a close integration with nature. Above, three large, organic-shaped pendant lights hang from the high ceiling, casting a warm glow and complementing the room's artful design. ",
  },
  {
    id: 'rainy-cyberpunk-loft-cityscape',
    name: 'Rainy Cyberpunk Loft Cityscape',
    url: assetUrl('/worlds/Rainy Cyberpunk Loft Cityscape.spz', 'worlds/Rainy Cyberpunk Loft Cityscape.spz'),
    imageUrl: '/worlds/Rainy Cyberpunk Loft Cityscape_prompt.jpg',
    musicUrl: assetUrl('/music/Sunset_Focus.mp3', 'music/Sunset_Focus.mp3'),
    colliderUrl: assetUrl('/worlds/Rainy Cyberpunk Loft Cityscape_collider.glb', 'worlds/Rainy Cyberpunk Loft Cityscape_collider.glb'),
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a cyberpunk-style loft apartment, rendered with realistic detail, showcasing a technologically advanced yet gritty urban environment. The overall tone is atmospheric and slightly melancholic, with the glow of neon lights and the impression of a perpetually rainy city. The room features a bunk bed structure, with the upper bunk serving as a sleeping area and the lower space potentially housing a sofa or daybed. Along the wall, modular storage units with glowing accents hold various items, suggesting a highly organized and compact living solution. A narrow ladder provides access to the upper bunk. A small, simple table with two chairs sits near the large window, offering a view of a sprawling cityscape dominated by towering buildings adorned with numerous glowing neon signs and digital billboards, creating a vibrant, albeit damp, urban panorama. Rain streaks down the windowpane, blurring the distant lights into colorful reflections. A drone rests on the table, indicating a connection to advanced technology or perhaps a hobby. The floor is lined with glowing strips, further emphasizing the futuristic aesthetic. The bunk bed structure is positioned against the back wall, with the ladder extending from the front of the upper bunk to the floor. The modular storage units are arranged beneath the upper bunk, to the left of the ladder. The table and chairs are situated directly in front of the large window, to the right of the ladder. The glowing floor strips run along the perimeter of the room. "
  },
  {
    id: 'oval-office',
    name: 'Oval Office',
    url: assetUrl('/worlds/Oval Office Elegant Historic Interior.spz', 'worlds/Oval Office Elegant Historic Interior.spz'),
    imageUrl: '/worlds/Oval Office Elegant Historic Interior_prompt.jpg',
    musicUrl: assetUrl('/music/Cartoon_Cozy_Theme.mp3', 'music/Cartoon_Cozy_Theme.mp3'),
    colliderUrl: assetUrl('/worlds/Oval Office Elegant Historic Interior_collider.glb', 'worlds/Oval Office Elegant Historic Interior_collider.glb'),
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a historically furnished oval office, presented in a realistic style that exudes dignity and tradition. The overall tone is formal and distinguished, reflecting a space of significant importance and authority. The room is characterized by its curved walls, covered in striped wallpaper in tones of cream and beige, and adorned with white crown molding near the ceiling. A grand wooden desk, intricately carved, stands prominently in the center, facing a series of tall windows draped with rich red curtains, which filter bright natural light into the space. An American flag and another flag, presumably the Presidential Seal flag, stand upright beside the desk near the windows. On one side of the room, a large wooden chest of drawers supports a vibrant floral arrangement and two framed landscape paintings, one depicting a red barn and the other a white house in a green field. Opposite this arrangement, an elegant wooden bookshelf, built into the curved wall with a shell-like arch at the top, is filled with books and various decorative items. A bronze sculpture of a cowboy on horseback rests on a smaller wooden credenza positioned in front of the bookshelf. Two plush, light brown sofas with numerous cushions are placed symmetrically in the foreground, facing the central desk, creating a comfortable seating area. A marble-topped coffee table, laden with a bowl of fresh fruit, sits between the sofas, accentuating the room's formal yet welcoming ambiance. The flooring features a large, light-colored rug with intricate circular patterns, complementing the traditional decor. Wooden chairs are positioned around the desk, offering additional seating."
  },
  {
    id: 'underwater',
    name: 'Underwater Living',
    imageUrl: '/worlds/Underwater Living Space Futuristic Design_prompt.jpg',
    url: assetUrl('/worlds/Underwater Living Space Futuristic Design.spz', 'worlds/Underwater Living Space Futuristic Design.spz'),
    musicUrl: assetUrl('/music/Sunset_Focus.mp3', 'music/Sunset_Focus.mp3'),
    colliderUrl: assetUrl('/worlds/Underwater Living Space Futuristic Design_collider.glb', 'worlds/Underwater Living Space Futuristic Design_collider.glb'),
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a meticulously crafted post-apocalyptic shelter, rendered in a stylized, almost graphic novel-like aesthetic, conveying a mood of resilient survival and resourcefulness. The interior walls are constructed from an assortment of salvaged corrugated metal sheets and planks, exhibiting various states of rust and wear, creating a patchwork effect. The flooring is a mosaic of cracked tiles and patched concrete, indicating makeshift repairs. The central area features a well-worn, light-colored sofa situated beneath a large window, allowing bright sunlight to stream into the space. A barrel-turned-coffee table with a wooden crate alongside it rests in front of the sofa. To the left, a rudimentary kitchen area is assembled from mismatched cabinets and appliances, including a sink, a small stove, and a refrigerator. On the right side, partially partitioned by a tattered fabric curtain, is a sleeping area with a simple bed adorned with a patchwork quilt. Adjacent to the sleeping area, a wooden shelf unit holds multiple electronic devices and a radio. Hand-painted signs declaring \"HOPE LIVES\" and \"SCRAP & SALVAGE\" are affixed to the wall, reinforcing the themes of the shelter. The room is filled with functional, repurposed items, each bearing the marks of a harsh environment. The entire structure feels sturdy despite its salvaged origins, providing a sense of security and utility."
  }
];

export const OBJECTS: ObjectDef[] = [
  { id: 'sphere', name: 'Sphere', kind: 'primitive', shape: 'sphere', scale: 0.2, mass: 1, collider: 'ball' },
  { id: 'box', name: 'Box', kind: 'primitive', shape: 'box', scale: 0.25, mass: 1, collider: 'cuboid' },
  { id: 'icosa', name: 'Icosahedron', kind: 'primitive', shape: 'icosahedron', scale: 0.25, mass: 1, collider: 'ball' },
  {
    id: 'duck',
    name: 'GLTF Duck',
    kind: 'gltf',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
    scale: 0.5,
    mass: 2,
    collider: 'hull',
  },
];
