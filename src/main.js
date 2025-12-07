import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pane } from 'tweakpane';
import { PhysicsSimulation } from './simulation.js';

// Configuration
// Initial Simulation State
const sim = new PhysicsSimulation();
sim.omega = 0.0; // Start with 0 rotation
function calculate20Masses(radius, taper) {
  const poleMasses = [];
  const poleCount = 20;
  // Step from -Radius to Radius
  for (let i = 0; i < poleCount; i++) {
    const yNormalized = -1.0 + (2.0 * i) / (poleCount - 1);
    // Scale pole separation by taper: 0 taper collapse to origin (Point Mass).
    const y = yNormalized * radius * taper;

    // Egg Taper Geometry Logic (from createEggGeometry)
    // r(y) = BaseRadius * Scale(y)
    let sliceScale = 1.0;
    if (y > 0) {
      sliceScale = 1.0 - (taper * (y / radius) * 0.6);
    }

    const sliceRadius = radius * sliceScale;

    // Mass proportional to cross-sectional area (r^2)
    // Note: This approximates volume integration by summation of cylinders
    const mass = sliceRadius * sliceRadius;

    poleMasses.push({ y, m: mass });
  }

  // Normalize total mass for stability
  const totalM = poleMasses.reduce((acc, p) => acc + p.m, 0);
  const targetScale = 10.0 / totalM; // Scale total system mass to 10
  poleMasses.forEach(p => p.m *= targetScale);

  return poleMasses;
}

// Initial Mass setup (Calculate for default taper/radius)
const poles = calculate20Masses(4.0, 0.2); // (Hardcoded defaults for first calibration)
sim.masses = poles;

// Now that sim.masses exists, calculate sensible potential defaults
const surfacePot = sim.getPotential(4, 0, 0);

const CONFIG = {
  eggRadius: 4.0,
  eggTaper: 0.2,
  waterPotential: surfacePot * 1.1, 
  rotationSpeed: 0.0,
  massRatio: 2.0,
};

// Sync sim with final config
sim.omega = CONFIG.rotationSpeed;

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff); // White background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2.5); // Slightly brighter ambient
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(10, 10, 10);
scene.add(directionalLight);

const backLight = new THREE.DirectionalLight(0x4040ff, 1.0);
backLight.position.set(-10, -5, -10);
scene.add(backLight);

const fillLight = new THREE.DirectionalLight(0xffaa00, 0.5);
fillLight.position.set(-5, 0, 5);
scene.add(fillLight);

// --- Geometries ---

// Solid "Planet" (Visual reference)
// We'll keep the parametric egg for the "Solid" part
function createEggGeometry(radius, taper) {
  const geometry = new THREE.SphereGeometry(radius, 128, 128); // Higher res
  const positionAttribute = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positionAttribute.count; i++) {
    vertex.fromBufferAttribute(positionAttribute, i);
    const y = vertex.y;

    // Simple taper
    let scale = 1.0;
    if (y > 0) {
      scale = 1.0 - (taper * (y / radius) * 0.6); // Reduced taper visual slightly for robustness
    }

    vertex.x *= scale;
    vertex.z *= scale;
    positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

const planetMaterial = new THREE.MeshStandardMaterial({
  color: 0x8B4513,
  roughness: 0.9,
  metalness: 0.1,
  flatShading: false
});
let planetGeometry = createEggGeometry(CONFIG.eggRadius, CONFIG.eggTaper);
const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
scene.add(planetMesh);

// Water Mesh (Equipotential Surface)
// Water Mesh (Equipotential Surface)
const waterMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, // Use vertex colors (white base)
  vertexColors: true,
  transmission: 0.6,
  opacity: 0.8,
  transparent: true,
  roughness: 0.6,
  metalness: 0.1,
  ior: 1.33,
  thickness: 0.1,
  side: THREE.DoubleSide
});

// We use a sphere and displace vertices to match equipotential
const waterGeometry = new THREE.SphereGeometry(1, 128, 128);
// Setup for vertex colors
const count = waterGeometry.attributes.position.count;
const colors = new Float32Array(count * 3);
waterGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Save original indices for filtering
const originalIndices = waterGeometry.index.array.slice();

const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
scene.add(waterMesh);

// Disk Indicator UI
const diskIndicator = document.createElement('div');
diskIndicator.style.position = 'absolute';
diskIndicator.style.bottom = '20px';
diskIndicator.style.width = '100%';
diskIndicator.style.textAlign = 'center';
diskIndicator.style.color = 'cyan';
diskIndicator.style.fontFamily = 'monospace';
diskIndicator.style.fontSize = '20px';
diskIndicator.style.textShadow = '0 0 5px blue';
diskIndicator.style.pointerEvents = 'none';
diskIndicator.innerHTML = '⚠ ACCRETION DISK DETECTED ⚠';
diskIndicator.style.display = 'none';
document.body.appendChild(diskIndicator);

function updateWaterSurface() {
  const positions = waterGeometry.attributes.position;
  const colorAttr = waterGeometry.attributes.color;
  const indices = waterGeometry.index.array;

  const p = new THREE.Vector3();
  const radiusList = new Float32Array(positions.count);
  let hasDisk = false;

  // 1. Update Positions & Colors
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    p.normalize();

    const r = sim.solveRadius(p.x, p.y, p.z, CONFIG.waterPotential);
    p.multiplyScalar(r);

    positions.setXYZ(i, p.x, p.y, p.z);
    radiusList[i] = r;

    // Color logic
    // Inner Ocean (r < 5.5ish): Blue
    // Outer Disk (r > 5.5ish): Cyan / Icy
    // We can use a smooth transition or hard cut visually
    if (r > 6.0) {
      // Outer Disk - Icy Cyan
      colorAttr.setXYZ(i, 0.4, 0.9, 1.0);
      hasDisk = true;
    } else {
      // Inner Ocean - Deep Blue (0x22aaff -> 0.13, 0.66, 1.0)
      colorAttr.setXYZ(i, 0.13, 0.66, 1.0);
    }
  }

  // Update UI & Ship based on Disk Presence
  if (hasDisk) {
    if (sim.omega > 0.05) {
      diskIndicator.innerHTML = '⚠ ACCRETION DISK DETECTED ⚠';
      diskIndicator.style.color = 'cyan';
    } else {
      diskIndicator.innerHTML = '⚠ GARGANTUAN OCEAN DETECTED ⚠';
      diskIndicator.style.color = 'white';
    }
    diskIndicator.style.display = 'block';
    if (ship) ship.visible = false;
  } else {
    diskIndicator.style.display = 'none';
    if (ship) ship.visible = true;
  }

  // 2. Filter Indices (Cut Mesh)
  // We check each triangle. If vertices straddle the gap (large radius diff), we hide it.
  const gapThreshold = 2.0; // If radius difference > 2.0, it's a tear.

  for (let i = 0; i < originalIndices.length; i += 3) {
    const a = originalIndices[i];
    const b = originalIndices[i + 1];
    const c = originalIndices[i + 2];

    const rA = radiusList[a];
    const rB = radiusList[b];
    const rC = radiusList[c];

    // Check for large jumps
    const maxDiff = Math.max(
      Math.abs(rA - rB),
      Math.abs(rA - rC),
      Math.abs(rB - rC)
    );

    if (maxDiff > gapThreshold) {
      // Degenerate triangle to hide it
      indices[i] = 0;
      indices[i + 1] = 0;
      indices[i + 2] = 0;
    } else {
      // Restore original
      indices[i] = a;
      indices[i + 1] = b;
      indices[i + 2] = c;
    }
  }

  waterGeometry.computeVertexNormals();
  positions.needsUpdate = true;
  colorAttr.needsUpdate = true;
  waterGeometry.index.needsUpdate = true;
}

// Initial Update moved to end of file

// Debug UI
const pane = new Pane({ title: 'Egg Ocean Sim' });

const eggFolder = pane.addFolder({ title: 'Solid Egg' });

eggFolder.addBinding(CONFIG, 'eggTaper', { min: 0, max: 0.5 }).on('change', (ev) => {
  planetMesh.geometry.dispose();
  planetMesh.geometry = createEggGeometry(CONFIG.eggRadius, ev.value);

  // High Fidelity 20-mass redistribution
  sim.masses = calculate20Masses(CONFIG.eggRadius, ev.value);

  updateWaterSurface();
});


const physicsFolder = pane.addFolder({ title: 'Physics & Ocean' });
physicsFolder.addBinding(CONFIG, 'rotationSpeed', {
  min: 0,
  max: 0.2,
  step: 0.001,
  label: 'Rotation'
}).on('change', (ev) => {
  sim.omega = ev.value;
  updateWaterSurface();
});

// Dynamic Range for Potential
const pMin = surfacePot * 2.0; // Deeper gravity (more negative)
const pMax = surfacePot * 0.2; // Shallow gravity (close to 0)

physicsFolder.addBinding(CONFIG, 'waterPotential', {
  min: pMin,
  max: pMax,
  step: 0.001,
  label: 'Sea Level (Potential)'
}).on('change', (ev) => {
  updateWaterSurface();
});


// --- Ship ---
const shipGeometry = new THREE.ConeGeometry(0.05, 0.2, 8);
shipGeometry.rotateX(Math.PI / 2); // Point forward? Or Up? Let's say Y is up for the cone locally.
// Actually, let's make it point Z-forward, Y-up.
const shipMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const ship = new THREE.Mesh(shipGeometry, shipMaterial);
scene.add(ship);

// Ship State
const shipState = {
  pos: new THREE.Vector3(0, 0, CONFIG.eggRadius), // Start at equator (ish)
  vel: new THREE.Vector3(1, 0, 0), // Moving roughly East
  speed: 0.5
};

// Initial Ship alignment
function updateShip(delta) {
  // 1. Move Ship "Forward" (tangent approximation)
  // We'll simplisticly rotate the position vector around the Y axis for now, 
  // OR just add velocity and normalize?
  // Let's try general physics movement:

  // Simply move perpendicular to "Up" and "Right"?
  // Let's just orbit it for simplicity first, or move in lat/lon?
  // General approach:
  // Move pos by small step.
  // Snap to surface.
  // Align.

  // Simple "Sail East" logic:
  // Cross Up with North (0,1,0) to get East?
  // Up vector at ship position
  const up = sim.getGradient(shipState.pos.x, shipState.pos.y, shipState.pos.z).normalize();

  // Approximate North (Project Y-axis onto tangent plane)
  // If we are at pole, this breaks, but fine for now.
  let north = new THREE.Vector3(0, 1, 0);
  // Project N onto plane: N_proj = N - (N.Up)*Up
  north.sub(up.clone().multiplyScalar(north.dot(up))).normalize();

  // East = North x Up
  const east = new THREE.Vector3().crossVectors(north, up).normalize();

  // Move East-ish
  const moveDir = east.clone().multiplyScalar(shipState.speed * delta);

  // Apply movement
  shipState.pos.add(moveDir);

  // 2. Snap to Surface
  // Ray from origin to current, solve radius
  const dir = shipState.pos.clone().normalize();
  const r = sim.solveRadius(dir.x, dir.y, dir.z, CONFIG.waterPotential);
  shipState.pos.copy(dir.multiplyScalar(r));

  // 3. Update Mesh
  ship.position.copy(shipState.pos);

  // 4. Align Mesh
  // Up is surface normal (Gradient)
  const newUp = sim.getGradient(shipState.pos.x, shipState.pos.y, shipState.pos.z).normalize();

  // Look at movement direction (East-ish)
  // We want the ship's local Y to check Up, and local -Z to check forward.
  // Three.js lookAt aligns -Z axis to target.
  // Make target = pos + forward
  // Forward = East (roughly)
  const forward = new THREE.Vector3().crossVectors(newUp, north).normalize().negate(); // ? Cross math check.
  // N x U = E.
  // U x N = -E (West).
  // Let's just use Quaternions.

  const target = shipState.pos.clone().add(east);
  ship.lookAt(target); // Z points to target.

  // But we need Up to be Up.
  // Object3D.up defaults to (0,1,0). We must set it!
  ship.up.copy(newUp);
  ship.lookAt(target);
}


// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  updateShip(delta);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial Update (After everything is defined)
updateWaterSurface();
