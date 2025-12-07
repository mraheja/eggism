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
    this.omega = 0.0; // Rotation speed
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

  // Calculate gradient of Potential (Vector pointing "Up" / towards higher potential)
  // V = -Sum(GM/r) - 0.5*w^2*r_xy^2
  // Grad(V) = Sum(GM/r^3 * r_vec) - w^2 * r_xy_vec
  getGradient(x, y, z) {
    let gx = 0, gy = 0, gz = 0;

    // Gravity Gradient
    for (const mass of this.masses) {
      const dx = x;
      const dy = y - mass.y;
      const dz = z;
      const r2 = dx * dx + dy * dy + dz * dz;
      const r = Math.sqrt(r2);
      const r3 = r2 * r;

      if (r < 0.1) continue;

      const factor = (this.G * mass.m) / r3;
      gx += factor * dx;
      gy += factor * dy;
      gz += factor * dz;
    }

    // Centrifugal Gradient (Force points OUT, Potential increases IN? No.)
    // V_cent = -0.5 * w^2 * (x^2 + z^2)
    // dV/dx = -w^2 * x
    // dV/dz = -w^2 * z
    // Confusing signs. 
    // Force_cent = +w^2 * r. (Outwards).
    // Force = -Grad(V). => Grad(V) = -Force. => Points INWARDS?
    // Let's re-verify.
    // Potential at 0 is 0. Potential at infinity is -inf? No.
    // Centrifugal potential usually defined as -0.5 w^2 r^2.
    // At r=0, V=0. At r=large, V is very negative.
    // So V decreases as we go out.
    // Gravity V is -1/r. At r=0, V=-inf. At r=inf, V=0.
    // So Gravity V increases as we go out.

    // Combining them is tricky. Effective Potential usually:
    // V_eff = V_grav + V_cent.
    // If we want "Up" vector (surface normal), we want the Gradient of V_eff.
    // Surfaces of constant V_eff are what we are drawing.
    // Normal to isosurface f(x,y,z)=C is Grad(f).

    // Grad(V_grav): d(-1/r)/dr = 1/r^2. Points OUT (away from mass).
    // Grad(V_cent): d(-0.5 w^2 r^2) / dr = -w^2 r. Points IN (towards axis).

    // So yes:
    // gx += (GM/r^3)*x  (Positive, Out)
    // gx += -w^2 * x    (Negative, In)

    gx -= this.omega * this.omega * x;
    gz -= this.omega * this.omega * z;

    return new THREE.Vector3(gx, gy, gz);
  }
}
