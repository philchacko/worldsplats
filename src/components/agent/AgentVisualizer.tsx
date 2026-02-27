'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAgent } from '@/providers/agent';
import { CellState, SemanticLabel } from '@/agent/types';

// Base colors
const COLOR_OCCUPIED = new THREE.Color(0xff4444);
const COLOR_AGENT = new THREE.Color(0xff8800);
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
  const agentRef = useRef<THREE.Mesh>(null);
  const logCounterRef = useRef(0);

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

  useFrame(() => {
    if (!enabled || !showViz) return;
    const data = vizDataRef.current;
    if (!data) return;

    const { agentPos, grid, lidarHits, currentPath } = data;
    const agentY = agentPos[1];

    // ── Agent marker ──
    if (agentRef.current) {
      agentRef.current.position.set(agentPos[0], agentY + 0.5, agentPos[2]);
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

    // ── LiDAR rays ──
    if (lidarRef.current && lidarHits) {
      const positions = lidarGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      let idx = 0;
      const rayY = agentY + 0.8;

      for (let i = 0; i < lidarHits.length && idx < MAX_LIDAR_POINTS * 3; i++) {
        const hit = lidarHits[i];
        arr[idx++] = agentPos[0];
        arr[idx++] = rayY;
        arr[idx++] = agentPos[2];
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

      {/* Agent marker (orange sphere) */}
      <mesh ref={agentRef}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color={COLOR_AGENT} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
