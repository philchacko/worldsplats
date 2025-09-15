// src/data/presets.ts
export type WorldDef = {
  id: string;
  name: string;
  url: string;             // .spz or .ply (Spark auto-detects)
  position?: [number, number, number];
  quaternion?: [number, number, number, number]; // x,y,z,w
  scale?: number;
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

// NOTE: Keep a few .spz worlds; you can swap/add your own under /public/splats and switch to relative URLs later.
// Spark demo asset:
export const WORLDS: WorldDef[] = [
  // {
  //   id: 'butterfly',
  //   name: 'Butterfly (Spark demo)',
  //   url: 'https://sparkjs.dev/assets/splats/butterfly.spz',
  //   position: [0, 0, -3],
  //   // Spark quickstart rotates X by 180°; optional. You can experiment per asset.
  //   quaternion: [1, 0, 0, 0],
  //   scale: 1,
  // },
  {
    id: 'forest-retreat',
    name: 'Forest Retreat',
    url: '/worlds/foresthouse.spz',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a lush, vibrant natural environment surrounding a rustic wooden house, captured in a painting-like style, evoking a tranquil and idyllic mood. The overall tone is one of peaceful solitude and a harmonious blend of architecture and nature. A large, multi-story wooden house with a light-colored, slightly weathered roof stands prominently within the scene, featuring multiple windows and a substantial wooden deck that wraps around part of its structure. The house is nestled amidst abundant green foliage, with tall trees forming a dense canopy overhead and around the dwelling, casting dappled shadows on the ground below. A pathway, possibly made of dirt or loose gravel, winds through the foreground, surrounded by various green plants and scattered rocks. Wooden steps lead up from the ground level to the house's deck, which is adorned with potted plants and what appears to be a small bench. The surrounding landscape consists of rolling grassy areas punctuated by patches of colorful flowers and more rock formations. The architecture of the house suggests a blend of traditional craftsmanship with functional outdoor living spaces. To the left of the house, beyond the main structure, additional green fencing or railings are visible, indicating further enclosed or defined areas within the property. The house is centrally positioned within the expansive natural setting, with the dense canopy of trees encompassing it from various directions. The wooden deck extends from the front and side of the house, offering elevated views of the surrounding garden. The pathway begins in the foreground, traversing towards the house and connecting with the base of the wooden steps."
  },
  {
    id: 'lofi-seaview',
    name: 'Lofi Seaview',
    url: '/worlds/lofistudy_sunset.spz',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a cozy, highly detailed anime-style room, bathed in the soft, vibrant hues of a sunset over a cityscape. The overall tone is tranquil and inviting, creating an atmosphere conducive to both study and relaxation within a stylish urban dwelling. The room is structured with a large, expansive window dominating one wall, offering a panoramic view of a bustling metropolis across a body of water. To the left of the window, a floor-to-ceiling bookshelf is meticulously organized with numerous books, decorative items, and various personal effects. A computer desk is positioned below this bookshelf, featuring a monitor displaying a vibrant, detailed interface, a keyboard, and other computer peripherals, along with an office chair. To the right of the window, another tall bookshelf, also filled with books and objects, stands against the wall. A second, smaller wooden desk is located under this right bookshelf, adorned with a green-shaded desk lamp that illuminates papers and writing instruments. In the foreground, a comfortable blue sofa with throw pillows provides a seating area. The floor throughout the room is polished hardwood, overlaid with a soft rug that adds a touch of warmth. The large window is divided into multiple panes by dark frames. The computer desk is situated to the left of the window, while the smaller desk with the green lamp is to the right of the window. The sofa is positioned directly in front of the window, oriented towards the city view. The bookshelf on the left is adjacent to the wall that extends towards the room's interior, and the bookshelf on the right mirrors this arrangement. "
  },
  {
    id: 'mainstreet-night',
    name: 'Mainstreet (Night)',
    url: '/worlds/mainstreet_night.spz',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a nocturnal city street, depicted in a stylized, animated painting technique with vibrant, exaggerated colors and a tranquil, slightly melancholic tone. The main thoroughfare stretches into the distance, lined on both sides by two-story buildings, mostly commercial establishments with storefronts at street level. A pale, full moon dominates the dark teal sky, casting a soft, ethereal glow upon the scene. Numerous overhead power lines crisscross the street, connecting to utility poles that punctuate the sidewalks. Brightly illuminated shop windows and neon signs cast warm orange and red reflections on the wet asphalt and concrete sidewalks. A prominent crosswalk with thick white stripes spans the road in the foreground, illuminated by the streetlights and storefront glow. On the left side of the street, a building with a red awning features a rectangular red neon sign above its large display window, from which warm orange light emanates. Across the street, on the right, other buildings also display illuminated windows and awnings, though one is light-colored and scalloped. Streetlights mounted on tall poles cast cones of light onto the pavement. The power lines sag slightly between the utility poles, adding to the urban landscape. The buildings recede into the blue-hued distance, where faint outlines of hills or mountains are visible under the moon. The utility poles are positioned at regular intervals along the sidewalks. The full moon is high in the sky. "
  },
  {
    id: 'rural-retreat',
    name: 'Rural Retreat',
    url: '/worlds/paddies.spz',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: 'The scene is a tranquil rural landscape, rendered in an anime-inspired art style with vibrant colors and soft, ethereal lighting, evoking a sense of peacefulness and pastoral charm. The air is clear and bright, and the overall mood is serene and idyllic. A traditional Japanese-style farmhouse with a dark, steep-pitched roof and an elevated wooden porch stands prominently in the mid-ground, surrounded by verdant rice paddies. Vines ascend the sides of the house, blending it harmoniously with the lush environment. In the distance, towering mountains draped in mist and foliage create a majestic backdrop, their forms softened by atmospheric perspective. A narrow, winding dirt path, bordered by small rocks and low-lying vegetation, meanders through the bright green rice fields, inviting exploration. A rustic wooden fence, composed of rough-hewn posts and horizontal rails, parallels the path, separating it from the cultivated fields. Trees with dense, round canopies dot the landscape, particularly around the farmhouse, contributing to the rich greenery. In the far distance, faint utility poles with horizontal cross arms are barely discernible, indicating a subtle touch of modern infrastructure within the otherwise natural setting. The rice paddies stretch expansively across the foreground and mid-ground, divided into neat rectangular sections by earthen ridges. Small, low-lying shrubs with pink blossoms are visible near the farmhouse, adding a delicate splash of color to the predominantly green and earthy tones. The path begins in the lower left corner and curves gently towards the right, leading past the fence and into the fields. The farmhouse stands to the right of the path, its front facing slightly towards the viewer. The mountains are positioned behind the farmhouse and the fields, rising into the sky. The trees are scattered around the farmhouse, with a particularly large one to its right. '
  },
  {
    id: 'simpsons',
    name: 'Simpsons World',
    url: '/worlds/simpsons.spz',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: `The scene is a cartoon-style depiction of a vibrant, domestic interior, evoking a cheerful and familiar atmosphere reminiscent of a classic animated sitcom. The primary living space features a single cozy, three-seater sofa in a rich, pumpkin orange hue, positioned centrally. Above the sofa, a framed painting of a simple white sailboat with a red hull, sailing under a sky with fluffy white clouds, hangs on the wall. To the left of the sofa, a purple end table holds a purple-shaded table lamp with a dark base and a turquoise rotary telephone. Below the lamp, two books with light-colored spines are neatly stacked on a shelf within the table. An arched doorway on the far left leads into a bright yellow kitchen with checkered floors, where purple cabinets and a window are visible. To the right of the sofa, a tall floor lamp with a pleated, orange lampshade stands beside a red magazine rack, overflowing with periodicals. Another arched doorway on the far right leads to an adjacent dining room, with a dark wooden table with curved legs and a purple chair. The walls throughout the main room are painted a soft, bubblegum pink, complemented by a teal-green carpet. A large, oval rug with concentric rings of pink, purple, and blue adds a splash of color to the foreground.  Across from the TV sits a television next to a window that looks out on a classic suburban American front yard.`,
  },
  {
    id: 'european-city-sunset',
    name: 'European City (Sunset)',
    url: '/worlds/europeanurban_sunset.spz',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
    guide: "The scene is a lively urban street bathed in the warm glow of a sunset, rendered in a distinctive anime or cartoon style. The overall mood is tranquil and nostalgic, evoking a sense of calm as the day draws to a close. Buildings with intricate architectural details line the street, their facades painted in various shades of brown and ochre, with ornate balconies extending from many windows. Numerous power lines crisscross the sky, connecting the buildings and adding a sense of urban density. Lush green trees and bushes dot the street level, providing splashes of vibrant color against the warm tones of the architecture. On the right side of the street, a balcony with a black railing overlooks the scene, where a small red potted plant sits on the floor. A window on the right building reflects the setting sun, casting a bright, orange light into the interior. The buildings are multi-storied, featuring various window shapes and sizes, some with dark frames. The balconies are adorned with decorative metalwork. The street appears to be slightly uphill, with the buildings receding into the distance, creating an impression of depth. The red potted plant rests on the balcony floor, positioned near the rightmost edge of the scene. The reflecting window is part of the building directly adjacent to the balcony. The power lines stretch horizontally across the upper portion of the scene, connecting the various structures. "
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
