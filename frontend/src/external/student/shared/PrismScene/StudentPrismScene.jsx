import { useEffect, useRef } from "react";
import * as THREE from "three";
import "./StudentPrismScene.css";

const rimVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);

    vWorldPosition = worldPosition.xyz;
    vViewPosition = -viewPosition.xyz;
    vNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * viewPosition;
  }
`;

const rimFragmentShader = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uBoost;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 3.15);
    float edge = smoothstep(0.24, 1.0, fresnel);
    float facets = 0.5 + 0.5 * sin(
      normal.x * 13.0 +
      normal.y * 8.0 +
      normal.z * 11.0 +
      vWorldPosition.x * 1.2 +
      uTime * 0.34
    );
    float spectral = 0.5 + 0.5 * sin(vWorldPosition.y * 2.7 - vWorldPosition.z * 1.6 + uTime * 0.22);
    vec3 rainbow = mix(uColorA, uColorB, facets);
    rainbow = mix(rainbow, uColorC, spectral * 0.58);

    float glow = uIntensity + uBoost;
    gl_FragColor = vec4(rainbow * (1.05 + edge * 1.5 + uBoost * 0.65), edge * glow);
  }
`;

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);

const SILVER_PRISM = {
  body: new THREE.Color("#FFFFFF"),
  faceLight: new THREE.Color("#F2F5F7"),
  faceMid: new THREE.Color("#CDD5DA"),
  faceShadow: new THREE.Color("#AEB8BE"),
  emissive: new THREE.Color("#EAF6FF"),
  specular: new THREE.Color("#FFFFFF"),
  attenuation: new THREE.Color("#F0F3F5"),
  rimBlue: new THREE.Color("#EAF6FF"),
  rimViolet: new THREE.Color("#E7E2FF"),
  rimCyan: new THREE.Color("#DFF1FF")
};

function createFacetedSilverGeometry(baseGeometry) {
  const geometry = baseGeometry.toNonIndexed();
  baseGeometry.dispose();
  geometry.computeVertexNormals();

  const normals = geometry.attributes.normal;
  const colors = [];
  const keyDirection = new THREE.Vector3(0.34, 0.78, 0.52).normalize();
  const fillDirection = new THREE.Vector3(-0.68, 0.22, 0.68).normalize();

  for (let vertexIndex = 0; vertexIndex < normals.count; vertexIndex += 3) {
    const faceNormal = new THREE.Vector3();

    for (let offset = 0; offset < 3; offset += 1) {
      faceNormal.x += normals.getX(vertexIndex + offset);
      faceNormal.y += normals.getY(vertexIndex + offset);
      faceNormal.z += normals.getZ(vertexIndex + offset);
    }

    faceNormal.normalize();
    const key = THREE.MathUtils.smoothstep(faceNormal.dot(keyDirection), -0.15, 0.92);
    const fill = THREE.MathUtils.smoothstep(faceNormal.dot(fillDirection), -0.35, 0.72) * 0.28;
    const shade = THREE.MathUtils.clamp(key * 0.92 + fill, 0, 1);
    const faceColor = SILVER_PRISM.faceShadow.clone().lerp(SILVER_PRISM.faceMid, Math.min(1, shade * 1.36));

    if (shade > 0.62) {
      faceColor.lerp(SILVER_PRISM.faceLight, (shade - 0.62) / 0.38);
    }

    for (let offset = 0; offset < 3; offset += 1) {
      colors.push(faceColor.r, faceColor.g, faceColor.b);
    }
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function createSoftShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 68, 8, 128, 68, 116);
  gradient.addColorStop(0, "rgba(78, 101, 110, 0.28)");
  gradient.addColorStop(0.36, "rgba(116, 135, 143, 0.14)");
  gradient.addColorStop(0.72, "rgba(201, 220, 232, 0.055)");
  gradient.addColorStop(1, "rgba(201, 220, 232, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createContactShadow(variant) {
  const texture = createSoftShadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(7.8, 3.2),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: variant === "center" ? 0.2 : 0.24,
      depthWrite: false,
      depthTest: false
    })
  );

  shadow.renderOrder = 0;
  return shadow;
}

function createSilverReflectionEnvironment() {
  const faces = [
    ["#ffffff", "#dfe8ee", "#aeb8be"],
    ["#f8fbfd", "#cfd9df", "#edf7ff"],
    ["#ffffff", "#e7ebee", "#c7d5de"],
    ["#b5c0c7", "#eef4f7", "#ffffff"],
    ["#f0f3f5", "#dff1ff", "#9faab1"],
    ["#ffffff", "#e7e2ff", "#cdd8df"]
  ];

  const canvases = faces.map(([top, middle, bottom], index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(index % 2 ? 64 : 0, 0, index % 2 ? 0 : 64, 64);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.42, middle);
    gradient.addColorStop(0.58, "#ffffff");
    gradient.addColorStop(1, bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);

    context.globalAlpha = 0.42;
    context.fillStyle = "#ffffff";
    context.fillRect(index % 3 === 0 ? 6 : 34, 0, 10, 64);
    context.globalAlpha = 0.22;
    context.fillStyle = index % 2 ? "#e7e2ff" : "#dff1ff";
    context.fillRect(index % 2 ? 0 : 48, 0, 16, 64);
    context.globalAlpha = 1;

    return canvas;
  });

  const texture = new THREE.CubeTexture(canvases);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.CubeReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

function seededRandom(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function makeSculptureShards(variant = "right") {
  const compact = variant === "compact";
  const mainScale = compact ? new THREE.Vector3(1.2, 1.92, 1.15) : new THREE.Vector3(1.72, 2.62, 1.58);
  const mainPosition = compact ? new THREE.Vector3(0.72, -0.05, 0.1) : new THREE.Vector3(0.54, -0.12, 0.08);

  const shards = [
    {
      role: "main",
      geometryIndex: 0,
      position: mainPosition,
      scale: mainScale,
      rotation: new THREE.Euler(
        THREE.MathUtils.degToRad(-9),
        THREE.MathUtils.degToRad(22),
        THREE.MathUtils.degToRad(8)
      ),
      phase: 0.3,
      floatAmount: compact ? 0.055 : 0.08,
      spinSpeed: compact ? 0.035 : 0.055,
      spinAxis: new THREE.Vector3(0.45, 1, 0.22),
      mouseInfluence: compact ? 0.08 : 0.12,
      depthInfluence: 1,
      rimIntensity: 0.48,
      opacity: compact ? 0.6 : 0.66
    }
  ];

  const secondaryLayout = [
    { x: -0.92, y: 0.92, z: -0.34, sx: 0.82, sy: 1.28, sz: 0.74, rx: -18, ry: -30, rz: 22 },
    { x: 1.18, y: 0.62, z: 0.34, sx: 0.64, sy: 0.94, sz: 0.58, rx: 22, ry: 34, rz: -18 },
    { x: -0.82, y: -1.12, z: 0.08, sx: 0.58, sy: 0.88, sz: 0.52, rx: -28, ry: 18, rz: 31 }
  ];
  const fragmentLayout = [
    { x: 1.68, y: 1.34, z: 0.12, sx: 0.28, sy: 0.42, sz: 0.26, rx: 38, ry: 8, rz: -24 },
    { x: -1.42, y: 1.58, z: -0.16, sx: 0.22, sy: 0.34, sz: 0.2, rx: -14, ry: -42, rz: 20 },
    { x: 1.62, y: -0.62, z: 0.24, sx: 0.24, sy: 0.36, sz: 0.22, rx: 16, ry: 52, rz: -18 },
    { x: 0.58, y: -1.68, z: -0.2, sx: 0.32, sy: 0.48, sz: 0.28, rx: -30, ry: 24, rz: 34 },
    { x: -1.46, y: -0.34, z: 0.18, sx: 0.2, sy: 0.3, sz: 0.18, rx: 24, ry: -34, rz: -28 }
  ];

  secondaryLayout.slice(0, compact ? 2 : 3).forEach((item, index) => {
    const scaleMultiplier = compact ? 0.68 : 1;
    shards.push({
      role: "secondary",
      geometryIndex: index % 2 === 0 ? 1 : 2,
      position: new THREE.Vector3(item.x * scaleMultiplier, item.y * scaleMultiplier, item.z),
      scale: new THREE.Vector3(item.sx * scaleMultiplier, item.sy * scaleMultiplier, item.sz * scaleMultiplier),
      rotation: new THREE.Euler(
        THREE.MathUtils.degToRad(item.rx),
        THREE.MathUtils.degToRad(item.ry),
        THREE.MathUtils.degToRad(item.rz)
      ),
      phase: seededRandom(index, 30) * Math.PI * 2,
      floatAmount: THREE.MathUtils.lerp(0.035, 0.075, seededRandom(index, 31)),
      spinSpeed: THREE.MathUtils.lerp(0.05, 0.11, seededRandom(index, 32)),
      spinAxis: new THREE.Vector3(
        THREE.MathUtils.lerp(0.32, 0.88, seededRandom(index, 33)),
        THREE.MathUtils.lerp(0.48, 1.08, seededRandom(index, 34)),
        THREE.MathUtils.lerp(0.2, 0.58, seededRandom(index, 35))
      ),
      mouseInfluence: 0.06,
      depthInfluence: THREE.MathUtils.lerp(0.38, 0.68, seededRandom(index, 36)),
      rimIntensity: THREE.MathUtils.lerp(0.24, 0.34, seededRandom(index, 37)),
      opacity: THREE.MathUtils.lerp(0.3, 0.42, seededRandom(index, 38))
    });
  });

  fragmentLayout.slice(0, compact ? 4 : 5).forEach((item, index) => {
    const scaleMultiplier = compact ? 0.72 : 1;
    shards.push({
      role: "fragment",
      geometryIndex: index % 3,
      position: new THREE.Vector3(item.x * scaleMultiplier, item.y * scaleMultiplier, item.z),
      scale: new THREE.Vector3(item.sx * scaleMultiplier, item.sy * scaleMultiplier, item.sz * scaleMultiplier),
      rotation: new THREE.Euler(
        THREE.MathUtils.degToRad(item.rx),
        THREE.MathUtils.degToRad(item.ry),
        THREE.MathUtils.degToRad(item.rz)
      ),
      phase: seededRandom(index, 44) * Math.PI * 2,
      floatAmount: THREE.MathUtils.lerp(0.045, 0.095, seededRandom(index, 45)),
      spinSpeed: THREE.MathUtils.lerp(0.08, 0.16, seededRandom(index, 46)),
      spinAxis: new THREE.Vector3(
        THREE.MathUtils.lerp(0.36, 0.92, seededRandom(index, 47)),
        THREE.MathUtils.lerp(0.54, 1.18, seededRandom(index, 48)),
        THREE.MathUtils.lerp(0.18, 0.62, seededRandom(index, 49))
      ),
      mouseInfluence: 0.035,
      depthInfluence: THREE.MathUtils.lerp(0.2, 0.42, seededRandom(index, 50)),
      rimIntensity: THREE.MathUtils.lerp(0.12, 0.2, seededRandom(index, 51)),
      opacity: THREE.MathUtils.lerp(0.13, 0.22, seededRandom(index, 52))
    });
  });

  return shards;
}

function createShard(data, geometries) {
  const group = new THREE.Group();
  group.position.copy(data.position);
  group.rotation.copy(data.rotation);
  group.scale.copy(data.scale);
  group.userData = {
    ...data,
    basePosition: data.position.clone(),
    baseRotation: data.rotation.clone(),
    baseScale: data.scale.clone(),
    targetPosition: data.position.clone(),
    targetScale: data.scale.clone(),
    boost: 0
  };

  const geometry = geometries[data.geometryIndex];
  const isMainShard = data.role === "main";
  const isSecondaryShard = data.role === "secondary";
  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      color: SILVER_PRISM.body,
      metalness: isMainShard ? 0.86 : isSecondaryShard ? 0.8 : 0.72,
      roughness: isMainShard ? 0.075 : isSecondaryShard ? 0.14 : 0.2,
      transmission: isMainShard ? 0.055 : isSecondaryShard ? 0.025 : 0.01,
      thickness: isMainShard ? 0.26 : isSecondaryShard ? 0.16 : 0.1,
      ior: 1.42,
      iridescence: isMainShard ? 0.08 : isSecondaryShard ? 0.045 : 0.025,
      iridescenceIOR: 1.12,
      iridescenceThicknessRange: [70, 180],
      clearcoat: isMainShard ? 0.96 : isSecondaryShard ? 0.68 : 0.42,
      clearcoatRoughness: isMainShard ? 0.032 : isSecondaryShard ? 0.075 : 0.12,
      envMapIntensity: isMainShard ? 1.9 : isSecondaryShard ? 1.32 : 0.92,
      attenuationColor: SILVER_PRISM.attenuation,
      attenuationDistance: 4.2,
      specularIntensity: isMainShard ? 1 : isSecondaryShard ? 0.76 : 0.46,
      specularColor: SILVER_PRISM.specular,
      emissive: SILVER_PRISM.emissive,
      emissiveIntensity: isMainShard ? 0.046 : isSecondaryShard ? 0.024 : 0.012,
      vertexColors: true,
      flatShading: true,
      transparent: true,
      opacity: isMainShard
        ? THREE.MathUtils.clamp(data.opacity, 0.58, 0.68)
        : isSecondaryShard
          ? THREE.MathUtils.clamp(data.opacity, 0.28, 0.42)
          : THREE.MathUtils.clamp(data.opacity, 0.12, 0.22),
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );

  const rimMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: data.rimIntensity * (isMainShard ? 0.68 : isSecondaryShard ? 0.42 : 0.28) },
      uBoost: { value: 0 },
      uColorA: { value: SILVER_PRISM.rimBlue },
      uColorB: { value: SILVER_PRISM.rimViolet },
      uColorC: { value: SILVER_PRISM.rimCyan }
    },
    vertexShader: rimVertexShader,
    fragmentShader: rimFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const rim = new THREE.Mesh(geometry, rimMaterial);
  rim.scale.setScalar(1.035);
  rim.renderOrder = 2;

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 16),
    new THREE.LineBasicMaterial({
      color: data.geometryIndex === 1 ? SILVER_PRISM.rimViolet : SILVER_PRISM.rimBlue,
      transparent: true,
      opacity: isMainShard
        ? THREE.MathUtils.clamp(0.2 + data.rimIntensity * 0.18, 0.24, 0.3)
        : isSecondaryShard
          ? THREE.MathUtils.clamp(0.14 + data.rimIntensity * 0.14, 0.16, 0.22)
          : THREE.MathUtils.clamp(0.08 + data.rimIntensity * 0.12, 0.1, 0.16),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    })
  );
  edge.scale.setScalar(isMainShard ? 1.012 : 1.008);
  edge.renderOrder = 3;

  group.userData.rimMaterial = rimMaterial;
  group.add(body, rim, edge);

  return group;
}

export default function StudentPrismScene({ variant = "right" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    const clock = new THREE.Clock();
    const pointer = { x: 0, y: 0 };
    const targetPointer = { x: 0, y: 0 };
    const group = new THREE.Group();
    const silverEnvironment = createSilverReflectionEnvironment();
    const geometries = [
      createFacetedSilverGeometry(new THREE.OctahedronGeometry(1, 0)),
      createFacetedSilverGeometry(new THREE.TetrahedronGeometry(1, 0)),
      createFacetedSilverGeometry(new THREE.IcosahedronGeometry(1, 0))
    ];
    let animationFrame = 0;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.useLegacyLights = false;
    mount.appendChild(renderer.domElement);

    scene.environment = silverEnvironment;
    camera.position.set(variant === "center" ? 0.4 : 1.35, 0.08, 10.5);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.66);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight("#ffffff", 1.35);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight("#ddebff", 0.82);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    const cyan = new THREE.PointLight("#eaf6ff", 15, 10);
    cyan.position.set(2.4, 1.3, 2.8);
    scene.add(cyan);
    const magenta = new THREE.PointLight("#e7e2ff", 7.2, 9);
    magenta.position.set(-3.6, -1.1, 3.2);
    scene.add(magenta);
    const gold = new THREE.PointLight("#ffffff", 9.5, 7);
    gold.position.set(5, -2.2, 2);
    scene.add(gold);

    const contactShadow = createContactShadow(variant);
    contactShadow.position.set(variant === "center" ? 0.42 : 0.78, variant === "compact" ? -1.26 : -1.46, -0.9);
    contactShadow.scale.set(variant === "compact" ? 0.62 : 0.9, variant === "compact" ? 0.52 : 0.84, 1);
    scene.add(contactShadow);

    makeSculptureShards(variant).forEach((data) => group.add(createShard(data, geometries)));
    group.position.set(variant === "center" ? 0.72 : 0.82, variant === "compact" ? -0.38 : -0.18, -0.18);
    group.scale.setScalar(variant === "compact" ? 0.88 : 1.08);
    scene.add(group);

    function resize() {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function handlePointerMove(event) {
      targetPointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      targetPointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    }

    function animate() {
      const delta = Math.min(clock.getDelta(), 0.033);
      const elapsed = clock.elapsedTime;
      const motionScale = reduceMotion ? 0.22 : 1;
      pointer.x = THREE.MathUtils.damp(pointer.x, targetPointer.x, 3, delta);
      pointer.y = THREE.MathUtils.damp(pointer.y, targetPointer.y, 3, delta);

      group.position.x = THREE.MathUtils.damp(group.position.x, (variant === "center" ? 0.72 : 0.82) + pointer.x * 0.16 * motionScale, 1.55, delta);
      group.position.y = THREE.MathUtils.damp(group.position.y, (variant === "compact" ? -0.42 : -0.12) + pointer.y * 0.12 * motionScale, 1.55, delta);
      group.rotation.y = THREE.MathUtils.damp(group.rotation.y, pointer.x * 0.095 * motionScale, 1.9, delta);
      group.rotation.x = THREE.MathUtils.damp(group.rotation.x, -pointer.y * 0.055 * motionScale, 1.9, delta);
      group.rotation.z = THREE.MathUtils.damp(group.rotation.z, pointer.x * 0.025 * motionScale, 1.7, delta);

      cyan.position.x = THREE.MathUtils.damp(cyan.position.x, 2.4 + pointer.x * 2.1, 2.5, delta);
      cyan.position.y = THREE.MathUtils.damp(cyan.position.y, 1.3 + pointer.y * 0.7, 2.5, delta);
      magenta.position.x = THREE.MathUtils.damp(magenta.position.x, -3.6 + pointer.x * 1.4, 2.3, delta);
      gold.position.x = THREE.MathUtils.damp(gold.position.x, 5 + pointer.x * 1.1, 2.2, delta);
      contactShadow.position.x = THREE.MathUtils.damp(contactShadow.position.x, (variant === "center" ? 0.42 : 0.78) + pointer.x * 0.1 * motionScale, 1.6, delta);
      contactShadow.position.y = THREE.MathUtils.damp(contactShadow.position.y, (variant === "compact" ? -1.26 : -1.46) + pointer.y * 0.04 * motionScale, 1.6, delta);

      group.children.forEach((shard) => {
        const data = shard.userData;
        const anchorX = THREE.MathUtils.clamp(data.basePosition.x / 8, -1, 1);
        const anchorY = THREE.MathUtils.clamp(data.basePosition.y / 3.2, -1, 1);
        const dx = pointer.x - anchorX;
        const dy = pointer.y - anchorY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const proximity = 1 - clamp01(distance / 1.12);
        const softProximity = proximity * proximity * (3 - 2 * proximity);
        const floatY = Math.sin(elapsed * 0.58 + data.phase) * data.floatAmount * motionScale;
        const driftX = Math.cos(elapsed * 0.19 + data.phase) * 0.035 * motionScale;
        const driftZ = Math.sin(elapsed * 0.24 + data.phase) * 0.08 * motionScale;
        const parallax = (0.08 + data.depthInfluence * 0.08) * motionScale;
        const forwardPull = softProximity * data.depthInfluence * 0.36 * motionScale;

        data.boost = softProximity * 0.18 + (Math.abs(pointer.x) + Math.abs(pointer.y)) * 0.018;
        data.targetPosition.set(
          data.basePosition.x + driftX + pointer.x * parallax,
          data.basePosition.y + floatY + pointer.y * parallax * 0.62,
          data.basePosition.z + driftZ + forwardPull
        );

        const scaleBoost = 1 + softProximity * 0.1 * motionScale;
        data.targetScale.set(
          data.baseScale.x * scaleBoost,
          data.baseScale.y * (1 + softProximity * 0.06 * motionScale),
          data.baseScale.z * scaleBoost
        );

        const ease = 1 - Math.exp(-delta * 4.1);
        shard.position.lerp(data.targetPosition, ease);
        shard.scale.lerp(data.targetScale, ease);
        shard.rotation.x = THREE.MathUtils.damp(
          shard.rotation.x,
          data.baseRotation.x + elapsed * data.spinSpeed * data.spinAxis.x * 0.28 * motionScale + Math.sin(elapsed * 0.32 + data.phase) * 0.08 * motionScale + pointer.y * data.mouseInfluence * motionScale,
          3.2,
          delta
        );
        shard.rotation.y = THREE.MathUtils.damp(
          shard.rotation.y,
          data.baseRotation.y + elapsed * data.spinSpeed * data.spinAxis.y * motionScale + pointer.x * data.mouseInfluence * 1.2 * motionScale,
          3,
          delta
        );
        shard.rotation.z = THREE.MathUtils.damp(
          shard.rotation.z,
          data.baseRotation.z + elapsed * data.spinSpeed * data.spinAxis.z * 0.38 * motionScale,
          3.4,
          delta
        );
        data.rimMaterial.uniforms.uTime.value = elapsed;
        data.rimMaterial.uniforms.uBoost.value = THREE.MathUtils.damp(
          data.rimMaterial.uniforms.uBoost.value,
          data.boost * 0.42,
          4.2,
          delta
        );
      });

      camera.position.x = THREE.MathUtils.damp(camera.position.x, (variant === "center" ? 0.4 : 1.35) + pointer.x * 0.24 * motionScale, 1.55, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.12 + pointer.y * 0.14 * motionScale, 1.55, delta);
      camera.lookAt(0, 0.05, 0);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (object.material) {
          const disposeMaterial = (material) => {
            material.map?.dispose?.();
            material.dispose();
          };
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => disposeMaterial(material));
          } else {
            disposeMaterial(object.material);
          }
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      silverEnvironment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [variant]);

  return <div className={`student-prism-scene student-prism-scene-${variant}`} ref={mountRef} aria-hidden="true" />;
}
