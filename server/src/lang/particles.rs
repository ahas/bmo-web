//! The particles joined to a name the pack cannot know (`lang/<language>/particles.yaml`).

use serde::Deserialize;

/// One particle, by how the name's last sound ends.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Particle {
  pub closed: String,
  pub open: String,
  pub unknown: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Particles {
  pub subject: Particle,
  pub object: Particle,
}

crate::part!(pub PARTICLES: Particles = "particles");
