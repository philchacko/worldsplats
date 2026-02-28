'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useAgent } from '@/providers/agent';
import { CellState, SemanticLabel } from '@/agent/types';

/** Human-readable names for semantic labels. */
const LABEL_NAMES: Record<number, string> = {
  [SemanticLabel.FLOOR]: 'floor',
  [SemanticLabel.WALL]: 'wall',
  [SemanticLabel.CEILING]: 'ceiling',
  [SemanticLabel.DOOR]: 'door',
  [SemanticLabel.WINDOW]: 'window',
  [SemanticLabel.SOFA]: 'sofa',
  [SemanticLabel.TABLE]: 'table',
  [SemanticLabel.CHAIR]: 'chair',
  [SemanticLabel.RUG]: 'rug',
  [SemanticLabel.LAMP]: 'lamp',
  [SemanticLabel.BOOKSHELF]: 'bookshelf',
  [SemanticLabel.PAINTING]: 'painting',
};

// ── Curator model ──
const CURATOR_MODEL_PATH = '/characters/thecurator.glb';
const CURATOR_SCALE = 0.25;
/** Vertical offset relative to agent position. Negative = lower (agent Y ≈ player eye ~1.4m). */
const CURATOR_Y_OFFSET = -0.1;
/** Amplitude & speed of the idle hover bob. */
const BOB_AMPLITUDE = 0.05;
const BOB_SPEED = 2.0;
/** How quickly the model rotates to face its heading (radians/sec blend factor). */
const HEADING_LERP = 6.0;
/** Yaw correction so the model's eye faces +Z (forward) at heading 0. */
const MODEL_YAW_OFFSET = -Math.PI / 2;
/** Downward tilt so the eye looks slightly toward the ground. */
const MODEL_PITCH_OFFSET = 0.15;
/** Approximate world-space radius of the Curator body; rays start outside this shell. */
const BODY_RADIUS = 0.35;
/** Idle wobble — gentle side-to-side sway and tilt for organic feel. */
const WOBBLE_SWAY = 0.05;   // lateral position sway amplitude
const WOBBLE_SPEED = 1.6;   // sway cycle speed (slower than bob)
const WOBBLE_TILT = 0.04;   // roll/pitch tilt amplitude (radians)
/** Intensity of the fill light illuminating the Curator. */
const FILL_LIGHT_INTENSITY = 3.0;
/** Intensity of the eye glow point light. */
const EYE_LIGHT_INTENSITY = 4.5;
const EYE_LIGHT_COLOR = 0x88ccff;
/** Emissive boost so the model is self-lit from all angles (0 = none, 1 = full). */
const EMISSIVE_INTENSITY = 0.35;

/** Render order: viz draws after splats, Curator draws after viz. */
const VIZ_RENDER_ORDER = 900;
const CURATOR_RENDER_ORDER = 1000;

// ── Colors — brass/cyan theme matching the Curator ──
const COLOR_OCCUPIED = new THREE.Color(0xdd8844); // warm copper for walls/obstacles
const COLOR_LIDAR = new THREE.Color(0x88ccff);    // cyan matching eye glow
const COLOR_PATH = new THREE.Color(0xffaa44);     // warm amber

// Semantic label colors — cohesive teal/amber palette
const SEMANTIC_COLORS: Record<number, THREE.Color> = {
  [SemanticLabel.FLOOR]:     new THREE.Color(0xccaa55), // muted brass
  [SemanticLabel.WALL]:      new THREE.Color(0x5588bb), // steel blue
  [SemanticLabel.CEILING]:   new THREE.Color(0x88aabb), // pale sky
  [SemanticLabel.DOOR]:      new THREE.Color(0xddaa44), // warm amber
  [SemanticLabel.WINDOW]:    new THREE.Color(0x44ccdd), // bright cyan
  [SemanticLabel.SOFA]:      new THREE.Color(0xcc7788), // dusty rose
  [SemanticLabel.TABLE]:     new THREE.Color(0xcc8855), // copper
  [SemanticLabel.CHAIR]:     new THREE.Color(0x77aa88), // sage green
  [SemanticLabel.RUG]:       new THREE.Color(0xaa5566), // burgundy
  [SemanticLabel.LAMP]:      new THREE.Color(0xddbb44), // gold glow
  [SemanticLabel.BOOKSHELF]: new THREE.Color(0x449988), // dark teal
  [SemanticLabel.PAINTING]:  new THREE.Color(0x8866bb), // purple-blue
};

// Instance caps
const MAX_OUTLINE_INSTANCES = 4000;
const MAX_SEMANTIC_INSTANCES = 4000;
const MAX_LIDAR_POINTS = 36 * 2; // rayCount * 2 endpoints
const MAX_PATH_POINTS = 200;

// Render radius in grid cells — at 0.1m/cell this is 10m
const RENDER_RADIUS = 100;

/** How many grid cells around the reticle hit to search for a semantic label.
 *  At 0.1m/cell, 6 cells = 0.6m radius — forgiving without being too loose. */
const RETICLE_SEARCH_RADIUS = 6;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _reticleDir = new THREE.Vector3();

/**
 * Create a hollow-square (outline) geometry for a single cell.
 */
function makeOutlineGeom(size: number, borderWidth: number): THREE.ShapeGeometry {
  const half = size / 2;
  const inner = half - borderWidth;

  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner);
  hole.lineTo(inner, -inner);
  hole.lineTo(inner, inner);
  hole.lineTo(-inner, inner);
  hole.closePath();
  shape.holes.push(hole);

  return new THREE.ShapeGeometry(shape);
}

/**
 * Renders the agent's occupancy grid, LiDAR rays, planned path,
 * and the Curator model as Three.js objects inside the R3F Canvas.
 *
 * Render order strategy (to work with Gaussian splat renderer):
 *  - Splats render at default order (~0)
 *  - Viz (grid, rays, path) at renderOrder 900 with depthTest:false → visible on splat environment
 *  - Curator model at renderOrder 1000 → draws on top of viz, always visible
 */
export default function AgentVisualizer() {
  const { enabled, vizDataRef, config, hoveredLabelRef } = useAgent();
  const { camera } = useThree();

  const outlineRef = useRef<THREE.InstancedMesh>(null);
  const semanticRef = useRef<THREE.InstancedMesh>(null);
  const lidarRef = useRef<THREE.LineSegments>(null);
  const curatorRef = useRef<THREE.Group>(null);
  const eyeLightRef = useRef<THREE.PointLight>(null);
  const logCounterRef = useRef(0);

  // Heading tracking — smooth visual heading derived from vizData.heading
  const visualHeadingRef = useRef(0);
  const bobTimeRef = useRef(0);

  // Load the Curator model — apply emissive boost + high renderOrder
  const { scene: curatorScene } = useGLTF(CURATOR_MODEL_PATH);
  const curatorModel = useMemo(() => {
    const clone = curatorScene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.isMeshStandardMaterial) {
          mesh.material = mat.clone();
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.emissive.copy(m.color);
          m.emissiveMap = m.map;
          m.emissiveIntensity = EMISSIVE_INTENSITY;
          // Move to transparent pass so renderOrder is respected
          m.transparent = true;
          m.opacity = 1.0;
        }
        // High renderOrder so Curator draws on top of viz + splats
        mesh.renderOrder = CURATOR_RENDER_ORDER;
      }
    });
    return clone;
  }, [curatorScene]);

  const cellVisualSize = config.cellSize * 0.95;
  const borderWidth = config.cellSize * 0.12;

  // Outline geometry (hollow square) for occupied unlabeled cells
  const outlineGeom = useMemo(
    () => makeOutlineGeom(cellVisualSize, borderWidth),
    [cellVisualSize, borderWidth],
  );
  const outlineMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  }), []);

  // Semantic geometry — filled square
  const semanticGeom = useMemo(
    () => new THREE.PlaneGeometry(cellVisualSize, cellVisualSize),
    [cellVisualSize],
  );
  const semanticMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  }), []);

  const lidarGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_LIDAR_POINTS * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const pathLine = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_PATH_POINTS * 3), 3));
    g.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({
      color: COLOR_PATH, transparent: true, opacity: 0.7,
      depthWrite: false, depthTest: false,
    });
    return new THREE.Line(g, mat);
  }, []);

  useFrame((_, delta) => {
    if (!enabled) return;
    const data = vizDataRef.current;
    if (!data) return;

    const { agentPos, heading, grid, lidarHits, currentPath } = data;
    const agentY = agentPos[1];

    // ── Curator model (always updates when enabled) ──
    if (curatorRef.current) {
      bobTimeRef.current += delta;
      const t = bobTimeRef.current;

      // Vertical bob + lateral sway
      const bob = Math.sin(t * BOB_SPEED) * BOB_AMPLITUDE;
      const swayX = Math.sin(t * WOBBLE_SPEED) * WOBBLE_SWAY;
      const swayZ = Math.cos(t * WOBBLE_SPEED * 0.7) * WOBBLE_SWAY;

      curatorRef.current.position.set(
        agentPos[0] + swayX,
        agentY + CURATOR_Y_OFFSET + bob,
        agentPos[2] + swayZ,
      );

      // Smooth heading from controller data
      let diff = heading - visualHeadingRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      visualHeadingRef.current += diff * Math.min(1, HEADING_LERP * delta);

      // Gentle tilt wobble
      const tiltX = Math.sin(t * WOBBLE_SPEED * 1.1) * WOBBLE_TILT;
      const tiltZ = Math.cos(t * WOBBLE_SPEED * 0.9) * WOBBLE_TILT;
      curatorRef.current.rotation.set(tiltX, visualHeadingRef.current, tiltZ);
    }

    // ── Grid, rays, path ──
    const outlineInst = outlineRef.current;
    const semInst = semanticRef.current;

    if (outlineInst) {
      let outlineCount = 0;
      let semCount = 0;

      const agentGrid = grid.worldToGrid(agentPos[0], agentPos[2]);
      const minGx = Math.max(0, agentGrid.gx - RENDER_RADIUS);
      const maxGx = Math.min(grid.width - 1, agentGrid.gx + RENDER_RADIUS);
      const minGz = Math.max(0, agentGrid.gz - RENDER_RADIUS);
      const maxGz = Math.min(grid.height - 1, agentGrid.gz + RENDER_RADIUS);

      for (let gz = minGz; gz <= maxGz; gz++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          const cell = grid.get(gx, gz);
          if (cell === CellState.UNKNOWN) continue;

          const semantic = grid.getSemantic(gx, gz);
          const { wx, wz } = grid.gridToWorld(gx, gz);
          const cellY = grid.getHeight(gx, gz) + 0.02;

          // Semantic labeled cell → bright colored fill
          if (
            semantic !== SemanticLabel.NONE &&
            SEMANTIC_COLORS[semantic] &&
            semInst &&
            semCount < MAX_SEMANTIC_INSTANCES
          ) {
            _dummy.position.set(wx, cellY + 0.03, wz);
            _dummy.rotation.set(-Math.PI / 2, 0, 0);
            _dummy.updateMatrix();
            semInst.setMatrixAt(semCount, _dummy.matrix);
            _color.copy(SEMANTIC_COLORS[semantic]);
            semInst.setColorAt(semCount, _color);
            semCount++;
          }
          // Occupied unlabeled cell → copper outline
          else if (cell === CellState.OCCUPIED && outlineCount < MAX_OUTLINE_INSTANCES) {
            _dummy.position.set(wx, cellY, wz);
            _dummy.rotation.set(-Math.PI / 2, 0, 0);
            _dummy.updateMatrix();
            outlineInst.setMatrixAt(outlineCount, _dummy.matrix);
            _color.copy(COLOR_OCCUPIED);
            outlineInst.setColorAt(outlineCount, _color);
            outlineCount++;
          }
        }
      }

      outlineInst.count = outlineCount;
      outlineInst.instanceMatrix.needsUpdate = true;
      if (outlineInst.instanceColor) outlineInst.instanceColor.needsUpdate = true;

      if (semInst) {
        semInst.count = semCount;
        semInst.instanceMatrix.needsUpdate = true;
        if (semInst.instanceColor) semInst.instanceColor.needsUpdate = true;
      }

      logCounterRef.current++;
      if (logCounterRef.current >= 120) {
        logCounterRef.current = 0;
        if (semCount > 0 || outlineCount > 0) {
          console.log(`[viz] rendering: ${outlineCount} outline instances, ${semCount} semantic instances`);
        }
      }
    }

    // ── LiDAR rays (emanate from the Curator's eye) ──
    if (lidarRef.current && lidarHits) {
      const positions = lidarGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      let idx = 0;

      const originX = agentPos[0];
      const originY = agentY + CURATOR_Y_OFFSET;
      const originZ = agentPos[2];

      for (let i = 0; i < lidarHits.length && idx < MAX_LIDAR_POINTS * 3; i++) {
        const hit = lidarHits[i];
        const rdx = hit.worldX - originX;
        const rdy = hit.worldY - originY;
        const rdz = hit.worldZ - originZ;
        const len = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
        if (len < BODY_RADIUS) continue;
        const t = BODY_RADIUS / len;
        arr[idx++] = originX + rdx * t;
        arr[idx++] = originY + rdy * t;
        arr[idx++] = originZ + rdz * t;
        arr[idx++] = hit.worldX;
        arr[idx++] = hit.worldY;
        arr[idx++] = hit.worldZ;
      }

      lidarGeom.setDrawRange(0, (idx / 3));
      positions.needsUpdate = true;
    }

    // ── Path line ──
    const pathGeom = pathLine.geometry;
    if (currentPath && currentPath.length > 0) {
      const positions = pathGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      let idx = 0;

      for (let i = 0; i < currentPath.length && idx < MAX_PATH_POINTS * 3; i++) {
        const [px, pz] = currentPath[i];
        const pathCell = grid.worldToGrid(px, pz);
        const pathY = grid.getHeight(pathCell.gx, pathCell.gz) + 0.05;
        arr[idx++] = px;
        arr[idx++] = pathY;
        arr[idx++] = pz;
      }

      pathGeom.setDrawRange(0, idx / 3);
      positions.needsUpdate = true;
    } else {
      pathGeom.setDrawRange(0, 0);
    }

    // ── Semantic label under reticle (wide search radius around center) ──
    camera.getWorldDirection(_reticleDir);
    const ro = camera.position;
    const floorY = agentY + CURATOR_Y_OFFSET;
    hoveredLabelRef.current = null;
    if (Math.abs(_reticleDir.y) > 0.001) {
      const t = (floorY - ro.y) / _reticleDir.y;
      if (t > 0 && t < 50) {
        const hitX = ro.x + _reticleDir.x * t;
        const hitZ = ro.z + _reticleDir.z * t;
        const gc = grid.worldToGrid(hitX, hitZ);
        // Search a radius of cells around the hit point for the nearest label
        const R = RETICLE_SEARCH_RADIUS;
        let bestSem = SemanticLabel.NONE;
        let bestDist = Infinity;
        for (let dz = -R; dz <= R; dz++) {
          for (let dx = -R; dx <= R; dx++) {
            const cx = gc.gx + dx;
            const cz = gc.gz + dz;
            if (!grid.inBounds(cx, cz)) continue;
            const sem = grid.getSemantic(cx, cz);
            if (sem === SemanticLabel.NONE) continue;
            const d = dx * dx + dz * dz;
            if (d < bestDist) {
              bestDist = d;
              bestSem = sem;
            }
          }
        }
        if (bestSem !== SemanticLabel.NONE && LABEL_NAMES[bestSem]) {
          hoveredLabelRef.current = LABEL_NAMES[bestSem];
        }
      }
    }
  });

  if (!enabled) return null;

  return (
    <group>
      {/* The Curator — renderOrder 1000 so it draws on top of everything */}
      <group ref={curatorRef}>
        <pointLight intensity={FILL_LIGHT_INTENSITY} distance={3} decay={2} position={[0, 1, 0.5]} />
        <pointLight
          ref={eyeLightRef}
          color={EYE_LIGHT_COLOR}
          intensity={EYE_LIGHT_INTENSITY}
          distance={2}
          decay={2}
          position={[0, 0.2, 0.4]}
        />
        <group scale={CURATOR_SCALE} rotation={[MODEL_PITCH_OFFSET, MODEL_YAW_OFFSET, 0]}>
          <primitive object={curatorModel} />
        </group>
      </group>

      {/* Grid tiles — renderOrder 900 so they draw after splats */}
      <instancedMesh
        ref={outlineRef}
        args={[outlineGeom, outlineMat, MAX_OUTLINE_INSTANCES]}
        frustumCulled={false}
        renderOrder={VIZ_RENDER_ORDER}
      />
      <instancedMesh
        ref={semanticRef}
        args={[semanticGeom, semanticMat, MAX_SEMANTIC_INSTANCES]}
        frustumCulled={false}
        renderOrder={VIZ_RENDER_ORDER}
      />
      <lineSegments ref={lidarRef} geometry={lidarGeom} frustumCulled={false} renderOrder={VIZ_RENDER_ORDER}>
        <lineBasicMaterial color={COLOR_LIDAR} transparent opacity={0.5} depthWrite={false} depthTest={false} />
      </lineSegments>
      <primitive object={pathLine} frustumCulled={false} renderOrder={VIZ_RENDER_ORDER} />
    </group>
  );
}

useGLTF.preload(CURATOR_MODEL_PATH);
