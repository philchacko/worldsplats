// src/data/presets.ts
export type WorldDef = {
  id: string;
  name: string;
  url: string;             // .spz or .ply (Spark auto-detects)
  position?: [number, number, number];
  quaternion?: [number, number, number, number]; // x,y,z,w
  scale?: number;
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
  {
    id: 'butterfly',
    name: 'Butterfly (Spark demo)',
    url: 'https://sparkjs.dev/assets/splats/butterfly.spz',
    position: [0, 0, -3],
    // Spark quickstart rotates X by 180°; optional. You can experiment per asset.
    quaternion: [1, 0, 0, 0],
    scale: 1,
  },
  {
    id: 'simpsons',
    name: 'Simpsons World',
    url: '/worlds/simpsons.spz',
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    scale: 1,
  }
  // Add more here, e.g. your own hosted .spz files under /public/splats/*.spz
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
