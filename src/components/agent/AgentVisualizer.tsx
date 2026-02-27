'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useAgent } from '@/providers/agent';
import { CellState, SemanticLabel } from '@/agent/types';

// Curator model
const CURATOR_MODEL_PATH = '/characters/thecurator.glb';
const CURATOR_SCALE = 0.25;
/** Vertical offset relative to agent position. Negative = lower (agent Y ≈ player eye ~1.4m). */
const CURATOR_Y_OFFSET = -0.1;
/** Amplitude & speed of the idle hover bob. */
const BOB_AMPLITUDE = 0.06;
const BOB_SPEED = 2.0;
/** How quickly the model rotates to face its heading (radians/sec blend factor). */
const HEADING_LERP = 6.0;
/** Yaw correction so the model's eye faces +Z (forward) at heading 0. */
const MODEL_YAW_OFFSET = -Math.PI / 2;
/** Intensity of the fill light illuminating the Curator. */
const FILL_LIGHT_INTENSITY = 3.0;
/** Intensity of the eye glow point light. Animate this later for speech. */
const EYE_LIGHT_INTENSITY = 4.5;
const EYE_LIGHT_COLOR = 0x88ccff;
/** Emissive boost so the model is self-lit from all angles (0 = none, 1 = full). */
const EMISSIVE_INTENSITY = 0.35;

// Base colors
const COLOR_OCCUPIED = new THREE.Color(0xff4444);
const COLOR_LIDAR = new THREE.Color(0xffff00);
const COLOR_PATH = new THREE.Color(0x00ffff);

// Semantic label colors — bright, vivid palette
const SEMANTIC_COLORS: Record<number, THREE.Color> = {
  [SemanticLabel.FLOOR]:     new THREE.Color(0xFFDD44), // bright gold
  [SemanticLabel.WALL]:      new THREE.Color(0x44AAFF), // bright blue
  [SemanticLabel.CEILING]:   new THREE.Color(0xAADDFF), // light sky
  [SemanticLabel.DOOR]:      new THREE.Color(0xFF8800), // bright orange
  [SemanticLabel.WINDOW]:    new THREE.Color(0x33FFDD), // bright cyan
  [SemanticLabel.SOFA]:      new THREE.Color(0xFF44FF), // hot magenta
  [SemanticLabel.TABLE]:     new THREE.Color(0xFF6622), // deep orange
  [SemanticLabel.CHAIR]:     new THREE.Color(0x44FF66), // neon green
  [SemanticLabel.RUG]:       new THREE.Color(0xFF4466), // bright red-pink
  [SemanticLabel.LAMP]:      new THREE.Color(0xFFFF44), // bright yellow
  [SemanticLabel.BOOKSHELF]: new THREE.Color(0x44FFCC), // bright teal
  [SemanticLabel.PAINTING]:  new THREE.Color(0xFF44AA), // hot pink
};

// Instance caps
const MAX_OUTLINE_INSTANCES = 4000;   // occupied-only outlines (much fewer than before)
const MAX_SEMANTIC_INSTANCES = 4000;  // semantic fills
const MAX_LIDAR_POINTS = 72 * 2;
const MAX_PATH_POINTS = 200;

// Render radius in grid cells — at 0.1m/cell this is 10m, enough
// to cover the full room and catch distant semantic projections.
const RENDER_RADIUS = 100;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Create a hollow-square (outline) geometry for a single cell.
 * Uses a Shape with a rectangular hole punched out, producing
 * a thin border when rendered as a flat mesh.
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
 * and agent marker as Three.js objects inside the R3F Canvas.
 *
 * Visual strategy:
 *  - OCCUPIED unlabeled cells → thin red outlines (walls/obstacles)
 *  - Semantically labeled cells → bright filled squares (the main visual)
 *  - EMPTY unlabeled cells → not rendered (reduces clutter)
 *  - LiDAR rays + agent marker → same as before
 */
export default function AgentVisualizer() {
  const { enabled, showViz, vizDataRef, config } = useAgent();

  const outlineRef = useRef<THREE.InstancedMesh>(null);
  const semanticRef = useRef<THREE.InstancedMesh>(null);
  const lidarRef = useRef<THREE.LineSegments>(null);
  const curatorRef = useRef<THREE.Group>(null);
  const eyeLightRef = useRef<THREE.PointLight>(null);
  const logCounterRef = useRef(0);

  // Heading tracking for eye direction
  const prevPosRef = useRef<[number, number]>([0, 0]); // [x, z]
  const headingRef = useRef(0); // current smoothed Y rotation
  const bobTimeRef = useRef(0);

  // Load the Curator model and apply emissive boost for even illumination
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
        }
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
  // NOTE: Do NOT use vertexColors:true — ShapeGeometry has no vertex color
  // attribute, which would zero out the instance colors. Instance colors
  // (setColorAt) work independently via USE_INSTANCING_COLOR.
  const outlineMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  // Semantic geometry — FILLED square (PlaneGeometry) to be visually distinct from outlines
  const semanticGeom = useMemo(
    () => new THREE.PlaneGeometry(cellVisualSize, cellVisualSize),
    [cellVisualSize],
  );
  const semanticMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
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
    const mat = new THREE.LineBasicMaterial({ color: COLOR_PATH, transparent: true, opacity: 0.8, depthWrite: false });
    return new THREE.Line(g, mat);
  }, []);

  useFrame((_, delta) => {
    if (!enabled || !showViz) return;
    const data = vizDataRef.current;
    if (!data) return;

    const { agentPos, grid, lidarHits, currentPath } = data;
    const agentY = agentPos[1];

    // ── Curator model ──
    if (curatorRef.current) {
      // Bob animation
      bobTimeRef.current += delta;
      const bob = Math.sin(bobTimeRef.current * BOB_SPEED) * BOB_AMPLITUDE;
      curatorRef.current.position.set(
        agentPos[0],
        agentY + CURATOR_Y_OFFSET + bob,
        agentPos[2],
      );

      // Heading: derive from movement delta
      const dx = agentPos[0] - prevPosRef.current[0];
      const dz = agentPos[2] - prevPosRef.current[1];
      const moveDist = Math.sqrt(dx * dx + dz * dz);

      if (moveDist > 0.001) {
        // atan2(dx, dz) gives the angle from +Z toward +X — standard Three.js Y-rotation
        const targetHeading = Math.atan2(dx, dz);
        // Smooth rotation via shortest-arc lerp
        let diff = targetHeading - headingRef.current;
        // Wrap to [-PI, PI]
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        headingRef.current += diff * Math.min(1, HEADING_LERP * delta);
      }

      curatorRef.current.rotation.y = headingRef.current;
      prevPosRef.current = [agentPos[0], agentPos[2]];
    }

    // ── Grid cells ──
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

          // Semantic labeled cell → bright colored outline (primary visual)
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
          // Occupied unlabeled cell → dim red outline (walls/obstacles)
          else if (cell === CellState.OCCUPIED && outlineCount < MAX_OUTLINE_INSTANCES) {
            _dummy.position.set(wx, cellY, wz);
            _dummy.rotation.set(-Math.PI / 2, 0, 0);
            _dummy.updateMatrix();
            outlineInst.setMatrixAt(outlineCount, _dummy.matrix);
            _color.copy(COLOR_OCCUPIED);
            outlineInst.setColorAt(outlineCount, _color);
            outlineCount++;
          }
          // EMPTY unlabeled → skip entirely (clean floor)
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

      // Log instance counts every ~2 seconds (120 frames at 60fps)
      logCounterRef.current++;
      if (logCounterRef.current >= 120) {
        logCounterRef.current = 0;
        if (semCount > 0 || outlineCount > 0) {
          console.log(`[viz] rendering: ${outlineCount} outline instances, ${semCount} semantic instances (filled)`);
        }
      }
    }

    // ── LiDAR rays (emanate from the Curator's eye) ──
    if (lidarRef.current && lidarHits) {
      const positions = lidarGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      let idx = 0;

      // Use the Curator's X/Z but a fixed Y (no bob) so rays don't wobble
      const eyeX = agentPos[0];
      const eyeY = agentY + CURATOR_Y_OFFSET;
      const eyeZ = agentPos[2];

      for (let i = 0; i < lidarHits.length && idx < MAX_LIDAR_POINTS * 3; i++) {
        const hit = lidarHits[i];
        arr[idx++] = eyeX;
        arr[idx++] = eyeY;
        arr[idx++] = eyeZ;
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
  });

  if (!enabled || !showViz) return null;

  return (
    <group>
      {/* Occupied unlabeled cells — dim red outlines (walls/obstacles) */}
      <instancedMesh
        ref={outlineRef}
        args={[outlineGeom, outlineMat, MAX_OUTLINE_INSTANCES]}
        frustumCulled={false}
      />

      {/* Semantic labeled cells — bright colored outlines */}
      <instancedMesh
        ref={semanticRef}
        args={[semanticGeom, semanticMat, MAX_SEMANTIC_INSTANCES]}
        frustumCulled={false}
      />

      {/* LiDAR rays */}
      <lineSegments ref={lidarRef} geometry={lidarGeom} frustumCulled={false}>
        <lineBasicMaterial color={COLOR_LIDAR} transparent opacity={0.4} depthWrite={false} />
      </lineSegments>

      {/* Planned path */}
      <primitive object={pathLine} frustumCulled={false} />

      {/* The Curator */}
      <group ref={curatorRef}>
        {/* Fill light — illuminates the model from above-front so it's visible in any scene */}
        <pointLight intensity={FILL_LIGHT_INTENSITY} distance={3} decay={2} position={[0, 1, 0.5]} />
        {/* Eye glow — positioned at the lens. Animate intensity later for speech. */}
        <pointLight
          ref={eyeLightRef}
          color={EYE_LIGHT_COLOR}
          intensity={EYE_LIGHT_INTENSITY}
          distance={2}
          decay={2}
          position={[0, 0.2, 0.4]}
        />
        <group scale={CURATOR_SCALE} rotation-y={MODEL_YAW_OFFSET}>
          <primitive object={curatorModel} />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload(CURATOR_MODEL_PATH);
