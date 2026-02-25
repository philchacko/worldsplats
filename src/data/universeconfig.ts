export const CONFIG = {
	// Physics
	GRAVITY: { x: 0, y: -9.81, z: 0 },
	RAPIER_INIT_TIMEOUT: 10000,

	// Movement
	MOVE_SPEED: 3,
	PROJECTILE_SPEED: 15,

	// Audio
	VOICE_COOLDOWN: 1.0,
	MUSIC_VOLUME: 0.15,
	VOICE_VOLUME: 0.4,

	// Physics Objects
	PROJECTILE_RADIUS: 0.2,
	PROJECTILE_RESTITUTION: 0.9,
	ENVIRONMENT_RESTITUTION: 0.0,
	BONE_COLLIDER_RADIUS: 0.3,
  // Environment
  ENVIRONMENT: {
    MESH: '/colliders/floor.glb',
  },
  // Player
  PLAYER: {
    RADIUS: 0.33,
    HALF_HEIGHT: 0.55,
    START: [0, 1.4, 0] as [number, number, number],
    FRICTION: 0.9,
    RESTI: 0.0,
    LINEAR_DAMPING: 4.0,
  },
}