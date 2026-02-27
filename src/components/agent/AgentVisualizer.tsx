'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAgent } from '@/providers/agent';
import { CellState } from '@/agent/types';

// Colors
const COLOR_EMPTY = new THREE.Color(0x44aa44);
const COLOR_OCCUPIED = new THREE.Color(0xff4444);
const COLOR_AGENT = new THREE.Color(0xff8800);
const COLOR_LIDAR = new THREE.Color(0xffff00);
const COLOR_PATH = new THREE.Color(0x00ffff);

// Max cells to render in InstancedMesh (performance cap)
const MAX_GRID_INSTANCES = 8000;
// Max LiDAR ray segments (2 points per ray)
const MAX_LIDAR_POINTS = 72 * 2;
// Max path points
const MAX_PATH_POINTS = 200;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Renders the agent's occupancy grid, LiDAR rays, planned path,
 * and agent marker as Three.js objects inside the R3F Canvas.
 */
export default function AgentVisualizer() {
  const { enabled, showViz, vizDataRef, config } = useAgent();

  const gridRef = useRef<THREE.InstancedMesh>(null);
  const lidarRef = useRef<THREE.LineSegments>(null);
  const agentRef = useRef<THREE.Mesh>(null);

  // Cell plane size matches grid cellSize (with small gap for visibility)
  const cellVisualSize = config.cellSize * 0.9;

  // Pre-allocated geometries and materials
  const gridGeom = useMemo(
    () => new THREE.PlaneGeometry(cellVisualSize, cellVisualSize),
    [cellVisualSize],
  );
  const gridMat = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  const lidarGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_LIDAR_POINTS * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  // Path line created imperatively (avoids JSX <line> / SVG conflict)
  const pathLine = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_PATH_POINTS * 3), 3));
    g.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: COLOR_PATH, transparent: true, opacity: 0.8, depthWrite: false });
    return new THREE.Line(g, mat);
  }, []);

  // Update visualization each frame (no React state, just imperative Three.js)
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

    // ── Grid InstancedMesh ──
    if (gridRef.current) {
      const inst = gridRef.current;
      let count = 0;

      // Only render cells within a radius of the agent for performance
      const renderRadius = 30; // grid cells
      const agentGrid = grid.worldToGrid(agentPos[0], agentPos[2]);
      const minGx = Math.max(0, agentGrid.gx - renderRadius);
      const maxGx = Math.min(grid.width - 1, agentGrid.gx + renderRadius);
      const minGz = Math.max(0, agentGrid.gz - renderRadius);
      const maxGz = Math.min(grid.height - 1, agentGrid.gz + renderRadius);

      for (let gz = minGz; gz <= maxGz && count < MAX_GRID_INSTANCES; gz++) {
        for (let gx = minGx; gx <= maxGx && count < MAX_GRID_INSTANCES; gx++) {
          const cell = grid.get(gx, gz);
          if (cell === CellState.UNKNOWN) continue;

          const { wx, wz } = grid.gridToWorld(gx, gz);
          // Use per-cell height from height map + small offset to sit on surface
          const cellY = grid.getHeight(gx, gz) + 0.02;
          _dummy.position.set(wx, cellY, wz);
          _dummy.rotation.set(-Math.PI / 2, 0, 0); // lie flat on XZ plane
          _dummy.updateMatrix();
          inst.setMatrixAt(count, _dummy.matrix);

          _color.copy(cell === CellState.OCCUPIED ? COLOR_OCCUPIED : COLOR_EMPTY);
          inst.setColorAt(count, _color);
          count++;
        }
      }

      inst.count = count;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }

    // ── LiDAR rays ──
    if (lidarRef.current && lidarHits) {
      const positions = lidarGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      let idx = 0;
      const rayY = agentY + 0.8;

      for (let i = 0; i < lidarHits.length && idx < MAX_LIDAR_POINTS * 3; i++) {
        const hit = lidarHits[i];
        // Start point (agent position)
        arr[idx++] = agentPos[0];
        arr[idx++] = rayY;
        arr[idx++] = agentPos[2];
        // End point (hit position — use floor Y for endpoint)
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
      {/* Grid cells (instanced for performance) */}
      <instancedMesh
        ref={gridRef}
        args={[gridGeom, gridMat, MAX_GRID_INSTANCES]}
        frustumCulled={false}
      />

      {/* LiDAR rays */}
      <lineSegments ref={lidarRef} geometry={lidarGeom} frustumCulled={false}>
        <lineBasicMaterial color={COLOR_LIDAR} transparent opacity={0.4} depthWrite={false} />
      </lineSegments>

      {/* Planned path (primitive to avoid JSX <line> SVG conflict) */}
      <primitive object={pathLine} frustumCulled={false} />

      {/* Agent marker (orange sphere) */}
      <mesh ref={agentRef}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color={COLOR_AGENT} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
