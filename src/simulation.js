import * as THREE from 'three';

export class PhysicsSimulation {
  constructor() {
    // Two-mass model to simulate egg gravity
    // Lower mass (larger) at y < 0
    // Upper mass (smaller) at y > 0
    this.masses = [
      { y: -1.5, m: 4.0 }, // Bottom heavy
      { y: 2.0, m: 2.0 }   // Top lighter
    ];
    this.G = 1.0;
    this.omega = 0.5; // Rotation speed
  }

  getPotential(x, y, z) {
    let potential = 0;

    // Gravitational Potential: -Sum(GM/r)
    for (const mass of this.masses) {
      const dx = x;
      const dy = y - mass.y;
      const dz = z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.1) return -10000; // Singularity guard
      potential -= (this.G * mass.m) / dist;
    }

    // Centrifugal Potential: -0.5 * w^2 * r_xy^2
    const r_xy_sq = x * x + z * z;
    potential -= 0.5 * this.omega * this.omega * r_xy_sq;

    return potential;
  }

  // Solve for radius R such that Potential(R * dir) = targetPotential
  // We assume Potential increases (approaches 0) as r increases usually (gravity dominates).
  // Actually, effective potential behaves like -1/r - r^2.
  // It has a maximum ("Hill sphere") but locally near planet it increases with r?
  // -1/r is increasing. -r^2 is decreasing.
  // Near planet, -1/r dominates (increasing). Far away, -r^2 dominates (decreasing).
  // We seek the root closest to origin or expected radius.
  // Solve for radius R such that Potential(R * dir) = targetPotential
  // We assume we are in the gravity-dominated region (closer to planet)
  // where dPotential/dr > 0 (it becomes less negative as we move away from the deep gravity well).
  // CAUTION: If rotation is high, dPotential/dr becomes negative far out.
  // We limit rMax to avoid jumping over the potential hill.
  solveRadius(dx, dy, dz, targetPotential) {
    let rMin = 3.0; // Just inside the egg
    let rMax = 8.0; // Reasonable outer bound for ocean
    const iterations = 15;

    // Check if we are already "below" the potential at rMax (meaning rMax is too deep? No.)
    // Potential ~ -1/r. Very close is -100. Far is -0.1.
    // If target is -1.5.
    // Min (-3.0 radius): Pot = -2.0. (Too deep / Too negative). We need to go UP/OUT.
    // Max (8.0 radius): Pot = -0.5. (Too shallow / Too positive). We need to go DOWN/IN.
    // So: If val < target (Too Negative) -> we are too close. rMin = rMid.
    // This logic holds for gravity dominance.

    for (let i = 0; i < iterations; i++) {
      const rMid = (rMin + rMax) * 0.5;
      const val = this.getPotential(dx * rMid, dy * rMid, dz * rMid);

      if (val < targetPotential) {
        rMin = rMid;
      } else {
        rMax = rMid;
      }
    }
    return (rMin + rMax) * 0.5;
  }
}
