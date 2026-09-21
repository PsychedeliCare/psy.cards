// Adapted from vgpu's Holographic Card (MIT). See /holographic-card/README.md.
struct Params {
  resolution: vec2f,
  tilt: vec2f,
  pointer: vec2f,
  hover: f32,
  lightScheme: f32,
  artwork: vec4f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var molecule: texture_2d<f32>;
@group(0) @binding(2) var linear: sampler;

fn stroke(distance: f32, width: f32, aa: f32) -> f32 {
  return 1.0 - smoothstep(width, width + aa, abs(distance));
}

// Original visible-wavelength response and grating approximation (GPU Gems 8).
fn wavelengthColor(wavelength: f32) -> vec3f {
  let response = (vec3f(wavelength) - vec3f(0.610, 0.545, 0.460)) / vec3f(0.045, 0.038, 0.032);
  let visible = smoothstep(0.380, 0.410, wavelength) * (1.0 - smoothstep(0.700, 0.780, wavelength));
  return exp(-0.5 * response * response) * visible;
}

fn diffraction(across: vec2f, lightAndView: vec2f, spacing: f32) -> vec3f {
  let pathDifference = spacing * abs(dot(lightAndView, across));
  let along = dot(lightAndView, vec2f(-across.y, across.x));
  let envelope = exp(-along * along / 0.36);
  var reflected = vec3f(0);
  for (var order = 1; order <= 3; order++) {
    let m = f32(order);
    reflected += wavelengthColor(pathDifference / m) / (m * m);
  }
  return reflected * envelope;
}

fn pearlColor(phase: f32) -> vec3f {
  return vec3f(0.55, 0.52, 0.64) + vec3f(0.43, 0.40, 0.34)
    * cos(6.2831853 * (phase + vec3f(0.05, 0.38, 0.63)));
}

fn grain(point: vec2f) -> f32 {
  let p = vec2u(abs(point) * 2400.0);
  var n = (p.x * 1597334677u) ^ (p.y * 3812015801u);
  n = (n ^ (n >> 16u)) * 2246822519u;
  return f32(n & 1023u) / 1023.0 - 0.5;
}

fn etchedPhase(p: vec2f) -> f32 {
  let warp = vec2f(
    sin(p.y * 7.0 + sin(p.x * 4.0)) * 0.085,
    sin(p.x * 6.0 - p.y * 3.0) * 0.07
  );
  let q = p + warp - vec2f(0.13, 0.08);
  let radius = length(q * vec2f(1.0, 0.76));
  return radius * 142.0 + sin(atan2(q.y, q.x) * 3.0 + radius * 8.0) * 1.7;
}

fn moleculeMask(p: vec2f) -> f32 {
  let uv = p * 0.5 + 0.5;
  let bounds = step(vec2f(0), uv) * step(uv, vec2f(1));
  return textureSampleLevel(molecule, linear, clamp(uv, vec2f(0), vec2f(1)), 0.0).a * bounds.x * bounds.y;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = max(params.resolution, vec2f(1));
  let screen = (uv * resolution - params.artwork.xy) / params.artwork.zw * 2.0;
  let sx = sin(params.tilt.y);
  let cx = cos(params.tilt.y);
  let sy = sin(params.tilt.x);
  let cy = cos(params.tilt.x);
  let right = vec3f(cy, 0, -sy);
  let down = vec3f(sy * sx, cx, cy * sx);
  let normal = cross(right, down);
  let eye = vec3f(0, 0, 4.5);
  let ray = normalize(vec3f(screen, -4.5));
  let hit = eye - ray * (dot(eye, normal) / dot(ray, normal));
  let p = vec2f(dot(hit, right), dot(hit, down));
  let aa = max(length(fwidth(p)), 0.0006);
  let hover = clamp(params.hover, 0.0, 1.0);
  let delta = p - params.pointer;
  let sweep = delta.x * 0.72 + delta.y * 0.52 + sin(p.y * 4.0 + p.x * 3.0) * 0.08;
  let lightBand = exp(-pow(sweep / 0.48, 2.0));
  let glint = exp(-pow(sweep / 0.085, 2.0));
  let spotlight = exp(-dot(delta * vec2f(0.8, 0.6), delta * vec2f(0.8, 0.6)) * 1.7);
  let light = lightBand * spotlight * hover;
  let lightDirection = normalize(vec3f(params.pointer, 1.2) - hit);
  let viewDirection = normalize(eye - hit);
  let lightAndView = vec2f(dot(lightDirection + viewDirection, right), dot(lightDirection + viewDirection, down));
  let illumination = max(dot(normal, lightDirection), 0.0) * max(dot(normal, viewDirection), 0.0);
  let contour = etchedPhase(p);
  let dx = dpdx(p);
  let dy = dpdy(p);
  let gradient = vec2f(dpdx(contour) * dy.y - dpdy(contour) * dx.y, dpdy(contour) * dx.x - dpdx(contour) * dy.x);
  let across = gradient / max(length(gradient), 0.00000001);
  let spectral = diffraction(across, lightAndView, 1.65) * illumination;
  let pearl = pearlColor(dot(lightAndView, vec2f(0.48, -0.32)) + p.y * 0.32 + contour * 0.003);
  let foil = clamp(pearl * 0.8 + spectral * 0.18 + vec3f(0.12), vec3f(0), vec3f(1));
  let ink = mix(vec3f(0.72, 0.76, 0.80), vec3f(0.12, 0.15, 0.19), params.lightScheme);
  let foilInk = mix(foil, foil * 0.4, params.lightScheme);
  let mask = moleculeMask(p);
  let contours = stroke(sin(contour), 0.06, min(fwidth(contour), 1.0));
  let grid = (fract((p + 1.0) * 20.0) - 0.5) / 20.0;
  let dots = stroke(length(grid), 0.0008, aa * 0.4);
  let noise = grain(p + vec2f(2));
  let sparkle = pow(max(noise + 0.5, 0.0), 24.0) * glint * spotlight * hover;
  let engraving = (contours * 0.055 + dots * 0.035) * (0.12 + hover * 0.42 + light);
  let wash = light * 0.025 + sparkle * 0.035;
  let moleculeAlpha = mask * (0.22 + hover * 0.12 + light * 0.38);
  let echo = moleculeMask(p - vec2f(0.007, -0.004) - params.tilt * 0.012) * light * 0.09;
  // Transparent, premultiplied output: the DOM owns the card surface and text.
  let region = exp(-dot(p * vec2f(0.6, 0.7), p * vec2f(0.6, 0.7)) * 0.55);
  let fade = smoothstep(0.0, 0.6, uv.x) * (1.0 - smoothstep(0.68, 1.0, uv.y));
  let alpha = (moleculeAlpha + echo + engraving + wash) * region * fade;
  let color = (mix(ink, foilInk, hover * 0.65 + light * 0.25) * moleculeAlpha
    + foilInk * (echo + engraving + wash)) * region * fade;
  return vec4f(color, alpha);
}
