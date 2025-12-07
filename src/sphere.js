import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pane } from 'tweakpane';
import { PhysicsSimulation } from './simulation.js';

// Configuration
// Initial Simulation State for Sphere
const sim = new PhysicsSimulation();
// Earth-like rotation:
// G=1, M=8, R=4 -> g=0.5.
// Earth ratio (centrifugal/g) is ~1/290 (~0.0034).
// In sim: 8 * omega^2 = 0.0034 -> omega ~= 0.02.
sim.omega = 0.02;
sim.masses = [{ y: 0, m: 8.0 }]; // Single central mass = Sphere gravity

// Calculate sensible defaults based on "Surface" potential at the 'equator' (approx r=4)
const surfacePot = sim.getPotential(4, 0, 0);

const CONFIG = {
  radius: 4.0,
  waterPotential: surfacePot * 1.002, // Just barely above surface (global ocean)
  rotationSpeed: 0.02,
};

// Sync sim with config
sim.omega = CONFIG.rotationSpeed;

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510); // Slightly bluer space

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth / window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 3.0);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 4.0);
directionalLight.position.set(10, 10, 10);
scene.add(directionalLight);

const backLight = new THREE.DirectionalLight(0x4040ff, 2.0);
backLight.position.set(-10, -5, -10);
scene.add(backLight);

const fillLight = new THREE.DirectionalLight(0xffaa00, 1.0); // Warm fill
fillLight.position.set(-5, 0, 5);
scene.add(fillLight);

// --- Geometries ---

function createSphereGeometry(radius) {
  return new THREE.SphereGeometry(radius, 128, 128);
}

const planetMaterial = new THREE.MeshStandardMaterial({
  color: 0x555555, // Grey for generic sphere
  roughness: 0.9,
  metalness: 0.1,
  flatShading: false
});
let planetGeometry = createSphereGeometry(CONFIG.radius);
const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
scene.add(planetMesh);

// Water Mesh (Equipotential Surface)
const waterMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x0077be,
  transmission: 0.8,
  opacity: 0.8,
  transparent: true,
  roughness: 0.05,
  metalness: 0.1,
  ior: 1.33,
  thickness: 0.1,
  side: THREE.DoubleSide
});

const waterGeometry = new THREE.SphereGeometry(1, 128, 128);
const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
scene.add(waterMesh);

function updateWaterSurface() {
  const positions = waterGeometry.attributes.position;
  const p = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    p.normalize();

    const r = sim.solveRadius(p.x, p.y, p.z, CONFIG.waterPotential);
    p.multiplyScalar(r);

    positions.setXYZ(i, p.x, p.y, p.z);
  }

  waterGeometry.computeVertexNormals();
  positions.needsUpdate = true;
}

// Initial Update
updateWaterSurface();

// Debug UI
const pane = new Pane({ title: 'Sphere Ocean Sim' });

const sphereFolder = pane.addFolder({ title: 'Solid Sphere' });
sphereFolder.addBinding(CONFIG, 'radius', { min: 1, max: 6 }).on('change', (ev) => {
  planetMesh.geometry.dispose();
  planetMesh.geometry = createSphereGeometry(ev.value);
});

const physicsFolder = pane.addFolder({ title: 'Physics & Ocean' });
physicsFolder.addBinding(CONFIG, 'rotationSpeed', {
  min: 0,
  max: 0.2, // Cap at 10x Earth speed for fun, but keep range small
  step: 0.001,
  label: 'Rotation'
}).on('change', (ev) => {
  sim.omega = ev.value;
  updateWaterSurface();
});

// Dynamic Range for Potential
// Recalculate based on current single mass
const pMin = surfacePot * 2.0;
const pMax = surfacePot * 0.2;

physicsFolder.addBinding(CONFIG, 'waterPotential', {
  min: pMin,
  max: pMax,
  step: 0.001,
  label: 'Sea Level (Potential)'
}).on('change', (ev) => {
  updateWaterSurface();
});

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
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
