/**
 * three.js scene for /logo. Loaded on demand by ./index.ts.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  DirectionalLight,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SrcAlphaFactor,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  ZeroFactor,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CARD_H, CARD_W, CardGeometry, deformPoint } from "./card-geometry";
import { paintBack, paintFace, parseHex, type Rgb } from "./card-face";
import {
  FAN,
  STACK_LAYERS,
  T,
  cardPose,
  easeInOutCubic,
  easeInOutSine,
  easeOutCubic,
  easeOutQuart,
  lerp,
  progress,
  stackLayer,
} from "./timeline";

export type LogoCard = {
  group: string;
  color: string;
  mask: string;
};

export type LogoSceneOptions = {
  canvas: HTMLCanvasElement;
  cards: LogoCard[];
  reducedMotion: boolean;
  /** Skip the backdrop and render over a transparent canvas (for embedding in a page). */
  transparent?: boolean;
  /** Called with the screen box the wordmark should occupy (CSS px). */
  onLayout: (box: { x: number; y: number; width: number }) => void;
  onWordmark: () => void;
  onSettled: () => void;
};

/** Molecule placement in card space: centre and square size (card widths). */
const MOLECULE_SPOT = [
  { x: 0, y: 0.98, size: 1.08 },
  { x: -0.1, y: 1.06, size: 1.0 },
  { x: -0.12, y: 1.1, size: 0.98 },
  { x: -0.14, y: 1.12, size: 0.96 },
];

const WORDMARK_GAP = 0.2;
const WORDMARK_HEIGHT = 0.55;

const moleculeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const moleculeFragment = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec4 uRect;
  uniform float uReveal;
  uniform vec3 uTint;
  uniform float uThicken;
  varying vec2 vUv;
  void main() {
    vec2 m = (vUv - uRect.xy) / uRect.zw + 0.5;
    if (m.x < 0.0 || m.y < 0.0 || m.x > 1.0 || m.y > 1.0) discard;
    // Dilate the thin mask strokes to the logo's bolder line weight.
    float line = texture2D(uMask, m).a;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      line = max(line, texture2D(uMask, m + vec2(cos(a), sin(a)) * uThicken).a);
    }
    float d = length(m - 0.5);
    float front = uReveal * 0.82;
    float shown = smoothstep(front, front - 0.1, d);
    float edge = smoothstep(0.07, 0.0, abs(d - front)) * step(0.0001, uReveal) * step(uReveal, 0.9999);
    float alpha = line * clamp(shown + edge, 0.0, 1.0);
    if (alpha < 0.002) discard;
    vec3 colour = mix(vec3(1.0), uTint, edge * 0.35) * (0.97 + edge * 1.6);
    gl_FragColor = vec4(colour, alpha);
  }
`;

const backdropVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const backdropFragment = /* glsl */ `
  uniform vec2 uResolution;
  uniform vec2 uCentre;
  uniform float uScale;
  uniform float uTime;
  uniform float uFade;
  uniform float uAura;
  uniform float uRays;
  uniform vec3 uColours[7];
  uniform vec2 uPoints[7];
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 px = vUv * uResolution;
    vec2 q = (px - uCentre) / uScale;
    vec3 colour = vec3(0.0035, 0.0035, 0.0045);

    float r = length(q - vec2(0.0, 0.9));
    colour += vec3(0.022, 0.022, 0.03) * exp(-r * r * 0.32) * uFade;

    vec3 aura = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      vec2 d = (px - uPoints[i]) / uScale;
      aura += uColours[i] * exp(-dot(d, d) * 0.9);
    }
    colour += aura * 0.035 * uAura;

    float angle = atan(q.x, q.y);
    float rr = length(q);
    float rays = pow(0.5 + 0.5 * sin(angle * 11.0 + sin(angle * 3.0 + uTime * 0.12) * 1.6), 5.0);
    rays *= smoothstep(0.4, 1.6, rr) * exp(-rr * 0.55) * smoothstep(-0.2, 0.6, q.y);
    colour += vec3(0.5, 0.48, 0.6) * rays * 0.03 * uRays;

    vec2 v = vUv - 0.5;
    colour *= 1.0 - dot(v, v) * 1.1;
    colour += (hash(px + fract(uTime) * 91.0) - 0.5) * 0.004;
    gl_FragColor = vec4(max(colour, 0.0), 1.0);
  }
`;

const dustVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vSeed;
  void main() {
    vec3 p = position;
    float t = uTime * (0.03 + aSeed * 0.05);
    p.y = mod(p.y + t + 2.0, 4.0) - 1.4;
    p.x += sin(uTime * 0.2 + aSeed * 30.0) * 0.08;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.0 + aSeed * 5.0) * uPixelRatio * (6.0 / -mv.z);
    vSeed = aSeed;
  }
`;

const dustFragment = /* glsl */ `
  uniform float uOpacity;
  uniform float uTime;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + vSeed) + vSeed * 40.0);
    gl_FragColor = vec4(vec3(1.0, 0.96, 0.9), a * a * uOpacity * twinkle);
  }
`;

type CardRig = {
  index: number;
  geometry: CardGeometry;
  molecule: ShaderMaterial;
};

/**
 * Dark studio for reflections: a big softbox above the camera and two strip
 * lights, so the clearcoat picks up soft highlights that glide across the
 * cards as they bend and turn, without washing out the colours.
 */
function studio(): Scene {
  const room = new Scene();
  room.add(new Mesh(new SphereGeometry(20, 32, 16), new MeshBasicMaterial({ color: 0x050507, side: BackSide })));
  const panel = (w: number, h: number, colour: number, intensity: number, x: number, y: number, z: number) => {
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(colour).multiplyScalar(intensity), side: BackSide }),
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0.8, 0);
    room.add(mesh);
  };
  panel(14, 4, 0xffffff, 1.4, 0, 7, 7);
  panel(1.2, 8, 0xffe6cc, 1.6, -8, 1, 4);
  panel(1.2, 8, 0xd8dcff, 1.3, 8, 1.5, 3);
  panel(6, 1, 0xffffff, 0.8, 0, -3, 6);
  return room;
}

function loadTexture(loader: TextureLoader, url: string): Promise<Texture> {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

export async function createLogoScene(options: LogoSceneOptions) {
  const { canvas, cards } = options;
  const transparent = options.transparent ?? false;
  const renderer = new WebGLRenderer({
    canvas,
    alpha: transparent,
    antialias: true,
    powerPreference: "high-performance",
    // Dev only: keeps frozen frames on screen for frame-by-frame review.
    preserveDrawingBuffer: import.meta.env.DEV,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, transparent ? 0 : 1);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.04).texture;
  pmrem.dispose();

  const camera = new PerspectiveCamera(24, 1, 0.1, 100);
  const finalCamera = new Vector3();
  const lookAt = new Vector3();

  // Backdrop
  const backdrop = new ShaderMaterial({
    vertexShader: backdropVertex,
    fragmentShader: backdropFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uResolution: { value: new Vector2(1, 1) },
      uCentre: { value: new Vector2() },
      uScale: { value: 1 },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uAura: { value: 0 },
      uRays: { value: 0 },
      uColours: { value: cards.map((card) => new Color(card.color)) },
      uPoints: { value: cards.map(() => new Vector2()) },
    },
  });
  const backdropMesh = new Mesh(new PlaneGeometry(2, 2), backdrop);
  backdropMesh.frustumCulled = false;
  backdropMesh.renderOrder = -1000;
  backdropMesh.visible = !transparent;
  scene.add(backdropMesh);

  // Lights: key from the upper left, a travelling glint, and two coloured rims behind.
  const key = new DirectionalLight(0xffffff, 0);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const sweep = new PointLight(0xfff4e8, 0, 9, 1.4);
  scene.add(sweep);
  const rimWarm = new PointLight(0xffb26b, 0, 8, 1.5);
  rimWarm.position.set(-2.6, 2.6, -1.6);
  const rimCool = new PointLight(0x9a8cff, 0, 8, 1.5);
  rimCool.position.set(2.6, 2.6, -1.6);
  scene.add(rimWarm, rimCool);

  // The fan pivots around its visual centre for the swing-in.
  const swing = new Group();
  const fan = new Group();
  swing.add(fan);
  scene.add(swing);

  const loader = new TextureLoader();
  const masks = await Promise.all(cards.map((card) => loadTexture(loader, card.mask)));

  const selfLit: MeshPhysicalMaterial[] = [];
  const rigs: CardRig[] = cards.map((card, i) => {
    const index = i - Math.floor(cards.length / 2);
    const tier = Math.abs(index);
    const colour: Rgb = parseHex(card.color);
    const geometry = new CardGeometry();

    const face = new CanvasTexture(paintFace(colour));
    face.colorSpace = SRGBColorSpace;
    face.anisotropy = maxAnisotropy;
    face.minFilter = LinearMipmapLinearFilter;
    const backFace = new CanvasTexture(paintBack(colour));
    backFace.colorSpace = SRGBColorSpace;
    backFace.anisotropy = maxAnisotropy;

    // Part self-lit so the category colours read true; the lit part and the
    // clearcoat carry the bending and the studio reflections.
    const front = new MeshPhysicalMaterial({
      map: face,
      emissive: 0xffffff,
      emissiveMap: face,
      emissiveIntensity: 0,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      iridescence: 0.18,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [180, 520],
    });
    const back = new MeshPhysicalMaterial({
      map: backFace,
      emissive: 0xffffff,
      emissiveMap: backFace,
      emissiveIntensity: 0,
      roughness: 0.5,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
    });
    selfLit.push(front, back);
    const rimTint = new Color(card.color).lerp(new Color(0xffffff), 0.72);
    const rim = new MeshPhysicalMaterial({
      color: rimTint,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      side: DoubleSide,
    });

    const mask = masks[i]!;
    mask.anisotropy = maxAnisotropy;
    const spot = MOLECULE_SPOT[tier]!;
    const spotX = index > 0 ? -spot.x : spot.x;
    const molecule = new ShaderMaterial({
      vertexShader: moleculeVertex,
      fragmentShader: moleculeFragment,
      // Blended but kept in the opaque pass so it follows the card's draw order.
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      uniforms: {
        uMask: { value: mask },
        uRect: {
          value: new Vector4(spotX / CARD_W + 0.5, spot.y / CARD_H, spot.size / CARD_W, spot.size / CARD_H),
        },
        uReveal: { value: 0 },
        uTint: { value: new Color(card.color) },
        uThicken: { value: 0.0026 },
      },
    });

    // Painter's order, back to front, with the depth buffer cleared before
    // each card: the deck's layering always wins, so bending cards can never
    // visibly cut through one another while they open.
    const order = (STACK_LAYERS - stackLayer(index)) * 10;
    const parts = [
      new Mesh(geometry.back, back),
      new Mesh(geometry.rim, rim),
      new Mesh(geometry.front, front),
      new Mesh(geometry.front, molecule),
    ];
    parts[0]!.onBeforeRender = (r) => r.clearDepth();
    parts.forEach((mesh, k) => {
      mesh.renderOrder = order + k;
      mesh.frustumCulled = false;
    });
    fan.add(...parts);

    return { index, geometry, molecule };
  });

  // Dust motes drifting through the light.
  const dustCount = 140;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions.set([(Math.random() - 0.5) * 6, Math.random() * 4 - 1.4, (Math.random() - 0.5) * 3 - 0.4], i * 3);
    dustSeeds[i] = Math.random();
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("aSeed", new BufferAttribute(dustSeeds, 1));
  // Drawn right after the backdrop so the cards cover it.
  const dust = new ShaderMaterial({
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
  });
  const dustPoints = new Points(dustGeometry, dust);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = -900;
  scene.add(dustPoints);

  // Post: gentle bloom on the glints and the molecule lines.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.1, 0.35, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Framing: fit the final fan plus the wordmark below it.
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (const rig of rigs) {
    const pose = cardPose(rig.index, Number.POSITIVE_INFINITY);
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [-0.5, CARD_H], [0.5, CARD_H], [0, CARD_H]] as const) {
      const [px, py] = deformPoint(x, y, pose);
      bounds.minX = Math.min(bounds.minX, px);
      bounds.maxX = Math.max(bounds.maxX, px);
      bounds.minY = Math.min(bounds.minY, py);
      bounds.maxY = Math.max(bounds.maxY, py);
    }
  }
  const fanCentre = new Vector3(0, (bounds.minY + bounds.maxY) / 2, 0);
  swing.position.copy(fanCentre);
  fan.position.set(0, -fanCentre.y, 0);

  const projected = new Vector3();
  const toScreen = (point: Vector3, width: number, height: number) => {
    projected.copy(point).project(camera);
    return { x: (projected.x * 0.5 + 0.5) * width, y: (1 - (projected.y * 0.5 + 0.5)) * height };
  };

  let width = 1;
  let height = 1;
  const resize = () => {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width, height);
    camera.aspect = width / height;

    const contentW = (bounds.maxX - bounds.minX) * 1.14;
    const top = bounds.maxY + 0.12;
    const bottom = bounds.minY - WORDMARK_GAP - WORDMARK_HEIGHT;
    const contentH = (top - bottom) * 1.12;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const distance = Math.max(contentH / 2 / tan, contentW / 2 / (tan * camera.aspect));
    lookAt.set(0, (top + bottom) / 2, 0);
    finalCamera.set(0, lookAt.y + 0.08, distance);

    // Wordmark box from the settled camera.
    camera.position.copy(finalCamera);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const wordTop = toScreen(new Vector3(0, bounds.minY - WORDMARK_GAP, 0), width, height);
    const left = toScreen(new Vector3(bounds.minX * 0.84, bounds.minY, 0), width, height);
    const right = toScreen(new Vector3(bounds.maxX * 0.84, bounds.minY, 0), width, height);
    options.onLayout({ x: wordTop.x, y: wordTop.y, width: right.x - left.x });
    backdrop.uniforms.uResolution!.value.set(width, height);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  let start = performance.now();
  let frozen: number | null = null;
  let firedWordmark = false;
  let firedSettled = false;
  const end = T.settled + 0.5;
  if (options.reducedMotion) start -= end * 1000;

  const tip = new Vector3();
  const centrePoint = new Vector3();

  const frame = (now: number) => {
    const t = frozen ?? (now - start) / 1000;
    const clock = now / 1000;

    // Backdrop & lights
    const fade = easeOutCubic(progress(t, T.backdrop[0], T.backdrop[1]));
    const aura = easeInOutSine(progress(t, T.bloom + 0.3, 2.2));
    backdrop.uniforms.uTime!.value = clock;
    backdrop.uniforms.uFade!.value = fade;
    backdrop.uniforms.uAura!.value = aura;
    backdrop.uniforms.uRays!.value = easeInOutSine(progress(t, T.bloom + 0.6, 2.4));
    const light = easeOutCubic(progress(t, 0.05, 1.7));
    key.intensity = 0.4 * light;
    scene.environmentIntensity = 0.8 * light;
    for (const material of selfLit) material.emissiveIntensity = 0.78 * light;
    rimWarm.intensity = rimCool.intensity = 1.6 * aura;
    dust.uniforms.uTime!.value = clock;
    dust.uniforms.uOpacity!.value = 0.32 * aura;

    // Light sweep: a glint travels across the fan, then rests above it.
    const sweepP = progress(t, T.sweep[0], T.sweep[1]);
    const settledP = progress(t, T.sweep[0] + T.sweep[1] - 0.2, 1.2);
    sweep.position.set(
      lerp(lerp(-4.2, 4.2, easeInOutSine(sweepP)), 0, settledP),
      lerp(fanCentre.y + 1.3, fanCentre.y + 1.6, settledP),
      lerp(2.6, 4.5, settledP),
    );
    sweep.intensity = lerp(Math.sin(Math.PI * sweepP) * 4, 0.6, settledP);
    // The studio's softboxes glide across the clearcoat with the sweep.
    scene.environmentRotation.y = lerp(-0.5, 0.18, easeInOutSine(sweepP));
    bloom.strength = 0.1 + Math.sin(Math.PI * sweepP) * 0.06;

    // Deck swing-in; the fan then holds still.
    const deck = progress(t, T.deck[0], T.deck[1]);
    const deckEase = easeOutQuart(deck);
    swing.rotation.set(lerp(0.32, 0, deckEase), lerp(-1.32, 0, easeInOutCubic(deck)), lerp(0.1, 0, deckEase));
    swing.position.set(0, fanCentre.y + lerp(-0.45, 0, deckEase), lerp(-1.6, 0, deckEase));

    // Camera: slow push-in to the final framing.
    const push = easeInOutCubic(progress(t, 0, T.wordmark + 0.4));
    camera.position.set(
      lerp(finalCamera.x + 0.35, finalCamera.x, push),
      lerp(finalCamera.y - 0.2, finalCamera.y, push),
      finalCamera.z * lerp(1.22, 1, push),
    );
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();

    // Cards
    swing.updateMatrixWorld();
    centrePoint.set(0, 0.55, 0).applyMatrix4(fan.matrixWorld);
    const centreScreen = toScreen(centrePoint, width, height);
    const ruler = toScreen(centrePoint.clone().add(new Vector3(1, 0, 0)), width, height);
    // Backdrop works in CSS pixels, origin bottom-left.
    backdrop.uniforms.uCentre!.value.set(centreScreen.x, height - centreScreen.y);
    backdrop.uniforms.uScale!.value = Math.abs(ruler.x - centreScreen.x);

    rigs.forEach((rig, i) => {
      const pose = cardPose(rig.index, t);
      rig.geometry.update(pose);
      const tier = Math.abs(rig.index);
      rig.molecule.uniforms.uReveal!.value = easeOutCubic(
        progress(t, T.molecules + tier * T.moleculeStagger, T.moleculeDuration),
      );
      const [x, y, z] = deformPoint(0, CARD_H * 0.78, pose);
      tip.set(x, y, z).applyMatrix4(fan.matrixWorld);
      const screen = toScreen(tip, width, height);
      backdrop.uniforms.uPoints!.value[i]!.set(screen.x, height - screen.y);
    });

    composer.render();

    if (!firedWordmark && t >= T.wordmark) {
      firedWordmark = true;
      options.onWordmark();
    }
    if (!firedSettled && t >= T.settled) {
      firedSettled = true;
      options.onSettled();
    }
  };

  let pausedAt: number | null = null;
  renderer.setAnimationLoop(frame);

  return {
    replay() {
      start = performance.now();
      frozen = null;
      firedWordmark = false;
      firedSettled = false;
    },
    /** Pause rendering (e.g. while off-screen); resuming continues the timeline where it stopped. */
    setActive(active: boolean) {
      if (!active && pausedAt === null) {
        pausedAt = performance.now();
        renderer.setAnimationLoop(null);
      } else if (active && pausedAt !== null) {
        start += performance.now() - pausedAt;
        pausedAt = null;
        renderer.setAnimationLoop(frame);
      }
    },
    /** Debug: hold the timeline at `t` seconds (null resumes) and draw that frame now. */
    freeze(t: number | null) {
      frozen = t;
      if (t !== null) frame(performance.now());
    },
    camera,
    fan: FAN,
    /** Debug handles for tuning in the console. */
    internals: { scene, renderer, composer, bloom, key, sweep },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      for (const rig of rigs) rig.geometry.dispose();
      scene.traverse((object) => {
        if (!(object instanceof Mesh || object instanceof Points)) return;
        object.geometry.dispose();
        const material = object.material as MeshPhysicalMaterial | ShaderMaterial;
        if (material instanceof MeshPhysicalMaterial) {
          material.map?.dispose();
        } else {
          (material.uniforms.uMask?.value as Texture | undefined)?.dispose();
        }
        material.dispose();
      });
      scene.environment?.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

export type LogoScene = Awaited<ReturnType<typeof createLogoScene>>;
