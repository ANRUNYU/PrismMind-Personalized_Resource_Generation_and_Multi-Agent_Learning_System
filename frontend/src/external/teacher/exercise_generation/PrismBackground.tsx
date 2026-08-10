// Copied from D:\Work Space\change\Teacher\exercise_generation\src\components\PrismBackground.
// The original component is animation-heavy Three.js code; CSS is injected by
// ExternalTeacherExercises so the visual stays scoped inside the Shadow DOM.
// @ts-nocheck
import { useEffect, useRef } from "react";
import * as THREE from "three";

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
    float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 3.18);
    float edge = smoothstep(0.21, 1.0, fresnel);
    float facets = 0.5 + 0.5 * sin(
      normal.x * 13.0 +
      normal.y * 8.0 +
      normal.z * 11.0 +
      vWorldPosition.x * 1.18 +
      uTime * 0.32
    );
    float spectral = 0.5 + 0.5 * sin(vWorldPosition.y * 2.7 - vWorldPosition.z * 1.6 + uTime * 0.22);
    vec3 rainbow = mix(uColorA, uColorB, facets);
    rainbow = mix(rainbow, uColorC, spectral * 0.58);

    float glow = uIntensity + uBoost;
    gl_FragColor = vec4(rainbow * (0.94 + edge * 1.42 + uBoost * 0.54), edge * glow);
  }
`;

function seededRandom(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function buildGeometry(vertices, faces) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(faces.flat());
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createIrregularPrismGeometry(type, seed) {
  const ringSides = type === "small" ? 3 : seededRandom(seed, 1) > 0.58 ? 5 : 4;
  const vertices = [];
  const faces = [];
  const ring = [];
  const primaryLength = {
    long: THREE.MathUtils.lerp(0.82, 1.08, seededRandom(seed, 2)),
    poly: THREE.MathUtils.lerp(0.62, 0.86, seededRandom(seed, 2)),
    small: THREE.MathUtils.lerp(0.46, 0.68, seededRandom(seed, 2))
  }[type];
  const ringRadiusA = {
    long: THREE.MathUtils.lerp(0.2, 0.32, seededRandom(seed, 3)),
    poly: THREE.MathUtils.lerp(0.38, 0.54, seededRandom(seed, 3)),
    small: THREE.MathUtils.lerp(0.22, 0.34, seededRandom(seed, 3))
  }[type];
  const ringRadiusB = {
    long: THREE.MathUtils.lerp(0.18, 0.3, seededRandom(seed, 4)),
    poly: THREE.MathUtils.lerp(0.3, 0.5, seededRandom(seed, 4)),
    small: THREE.MathUtils.lerp(0.18, 0.3, seededRandom(seed, 4))
  }[type];
  const tipSkew = [
    THREE.MathUtils.lerp(-0.08, 0.08, seededRandom(seed, 5)),
    THREE.MathUtils.lerp(-0.08, 0.08, seededRandom(seed, 6)),
    THREE.MathUtils.lerp(-0.08, 0.08, seededRandom(seed, 7))
  ];

  if (type === "long") {
    vertices.push([-primaryLength, tipSkew[0], tipSkew[1]]);
    vertices.push([primaryLength * THREE.MathUtils.lerp(0.88, 1.08, seededRandom(seed, 8)), -tipSkew[0], tipSkew[2]]);

    for (let index = 0; index < ringSides; index += 1) {
      const angle = (index / ringSides) * Math.PI * 2 + seededRandom(seed + index, 9) * 0.22;
      const radiusWarp = THREE.MathUtils.lerp(0.82, 1.2, seededRandom(seed + index, 10));
      ring.push(vertices.length);
      vertices.push([
        THREE.MathUtils.lerp(-0.12, 0.12, seededRandom(seed + index, 11)),
        Math.cos(angle) * ringRadiusA * radiusWarp,
        Math.sin(angle) * ringRadiusB * THREE.MathUtils.lerp(0.82, 1.16, seededRandom(seed + index, 12))
      ]);
    }
  } else {
    const tipAxis = type === "small" ? "z" : "y";
    const firstTip = tipAxis === "z" ? [tipSkew[0], tipSkew[1], -primaryLength] : [tipSkew[0], -primaryLength, tipSkew[1]];
    const secondTip =
      tipAxis === "z"
        ? [-tipSkew[0], tipSkew[2], primaryLength * THREE.MathUtils.lerp(0.82, 1.08, seededRandom(seed, 8))]
        : [-tipSkew[0], primaryLength * THREE.MathUtils.lerp(0.82, 1.08, seededRandom(seed, 8)), tipSkew[2]];

    vertices.push(firstTip);
    vertices.push(secondTip);

    for (let index = 0; index < ringSides; index += 1) {
      const angle = (index / ringSides) * Math.PI * 2 + seededRandom(seed + index, 9) * 0.3;
      const radiusWarp = THREE.MathUtils.lerp(0.76, 1.18, seededRandom(seed + index, 10));
      ring.push(vertices.length);

      if (tipAxis === "z") {
        vertices.push([
          Math.cos(angle) * ringRadiusA * radiusWarp,
          Math.sin(angle) * ringRadiusB * THREE.MathUtils.lerp(0.82, 1.18, seededRandom(seed + index, 12)),
          THREE.MathUtils.lerp(-0.04, 0.04, seededRandom(seed + index, 11))
        ]);
      } else {
        vertices.push([
          Math.cos(angle) * ringRadiusA * radiusWarp,
          THREE.MathUtils.lerp(-0.08, 0.08, seededRandom(seed + index, 11)),
          Math.sin(angle) * ringRadiusB * THREE.MathUtils.lerp(0.82, 1.18, seededRandom(seed + index, 12))
        ]);
      }
    }
  }

  for (let index = 0; index < ringSides; index += 1) {
    const next = (index + 1) % ringSides;
    faces.push([0, ring[index], ring[next]]);
    faces.push([1, ring[next], ring[index]]);
  }

  return buildGeometry(vertices, faces);
}

function getShardCount(width) {
  if (width < 900) return 18;
  if (width < 1360) return 26;
  return 34;
}

function makeShardData(width) {
  const count = getShardCount(width);
  const edgePalette = ["#5ffbff", "#7c4dff", "#ff4fd8", "#69eaff", "#8a72ff"];

  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const role = index < 5 ? "main" : index < 19 ? "medium" : index < 28 ? "small" : "distant";
    const rightCluster = role !== "distant";
    const isMain = role === "main";
    const isMedium = role === "medium";
    const typeRoll = seededRandom(index, 14);
    const geometryType = isMain ? (typeRoll < 0.58 ? "long" : "poly") : isMedium ? (typeRoll < 0.38 ? "long" : "poly") : typeRoll < 0.44 ? "long" : "small";
    const x = rightCluster
      ? THREE.MathUtils.lerp(2.16, 6.52, Math.pow(t, 0.62)) + THREE.MathUtils.lerp(-0.34, 0.34, seededRandom(index, 1))
      : THREE.MathUtils.lerp(-5.7, -2.6, seededRandom(index, 1));
    const y = isMain
      ? THREE.MathUtils.lerp(-0.28, -2.04, seededRandom(index, 2)) + Math.sin(t * Math.PI * 1.4) * 0.28
      : isMedium
        ? THREE.MathUtils.lerp(0.62, -2.2, seededRandom(index, 2)) + Math.sin((t + 0.18) * Math.PI) * 0.18
        : rightCluster
          ? THREE.MathUtils.lerp(0.38, -2.45, seededRandom(index, 2))
          : THREE.MathUtils.lerp(-0.06, -1.34, seededRandom(index, 2));
    const z = rightCluster ? THREE.MathUtils.lerp(-1.72, 0.15, seededRandom(index, 3)) : THREE.MathUtils.lerp(-2.5, -1.45, seededRandom(index, 3));
    const baseScale = {
      main: THREE.MathUtils.lerp(0.92, 1.34, seededRandom(index, 4)),
      medium: THREE.MathUtils.lerp(0.44, 0.82, seededRandom(index, 4)),
      small: THREE.MathUtils.lerp(0.22, 0.42, seededRandom(index, 4)),
      distant: THREE.MathUtils.lerp(0.24, 0.46, seededRandom(index, 4))
    }[role];
    const longShard = geometryType === "long";
    const polyShard = geometryType === "poly";
    const opacity = {
      main: THREE.MathUtils.lerp(0.52, 0.74, seededRandom(index, 11)),
      medium: THREE.MathUtils.lerp(0.28, 0.5, seededRandom(index, 11)),
      small: THREE.MathUtils.lerp(0.16, 0.32, seededRandom(index, 11)),
      distant: THREE.MathUtils.lerp(0.06, 0.14, seededRandom(index, 11))
    }[role];
    const bodyColor = isMain ? "#05070a" : isMedium ? "#151a20" : role === "small" ? "#343d46" : "#4b545b";
    const motionScale = { main: 1, medium: 1.18, small: 1.46, distant: 0.68 }[role];

    return {
      role,
      geometryType,
      geometrySeed: index * 19 + count,
      position: new THREE.Vector3(x, y, z),
      scale: new THREE.Vector3(
        baseScale * (longShard ? 1.92 : polyShard ? 1.05 : 0.9),
        baseScale * (longShard ? 0.32 : polyShard ? 0.74 : 0.62),
        baseScale * (longShard ? 1.18 : polyShard ? 0.98 : 0.72)
      ),
      rotation: new THREE.Euler(
        THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-18, 18, seededRandom(index, 5))),
        THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-62, 62, seededRandom(index, 6))),
        THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-48, 48, seededRandom(index, 7)))
      ),
      phase: seededRandom(index, 8) * Math.PI * 2,
      spinSpeed: THREE.MathUtils.lerp(0.026, 0.092, seededRandom(index, 9)) * (role === "main" ? 0.72 : role === "small" ? 1.08 : 1),
      spinAxis: new THREE.Vector3(
        THREE.MathUtils.lerp(0.25, 0.82, seededRandom(index, 15)),
        THREE.MathUtils.lerp(0.32, 0.9, seededRandom(index, 16)),
        THREE.MathUtils.lerp(0.2, 0.62, seededRandom(index, 17))
      ),
      mouseInfluence: THREE.MathUtils.lerp(0.035, 0.13, seededRandom(index, 10)),
      bodyColor,
      opacity,
      rimIntensity: { main: 0.5, medium: 0.34, small: 0.2, distant: 0.12 }[role] * THREE.MathUtils.lerp(0.82, 1.24, seededRandom(index, 12)),
      edgeColor: edgePalette[index % edgePalette.length],
      edgeOpacity: { main: 0.34, medium: 0.22, small: 0.12, distant: 0.05 }[role],
      floatX: THREE.MathUtils.lerp(0.09, 0.22, seededRandom(index, 21)) * motionScale,
      floatY: THREE.MathUtils.lerp(0.13, 0.34, seededRandom(index, 22)) * motionScale,
      floatZ: THREE.MathUtils.lerp(0.06, 0.16, seededRandom(index, 23)) * motionScale,
      floatSpeed: THREE.MathUtils.lerp(0.38, 0.82, seededRandom(index, 24)) * (role === "main" ? 0.68 : role === "small" ? 1.18 : 1),
      spinDrift: THREE.MathUtils.lerp(0.075, 0.16, seededRandom(index, 25)) * motionScale,
      glowSpeed: THREE.MathUtils.lerp(0.42, 0.9, seededRandom(index, 26)),
      glowPhase: seededRandom(index, 27) * Math.PI * 2,
      metalness: THREE.MathUtils.lerp(role === "small" ? 0.26 : 0.36, isMain ? 0.56 : 0.48, seededRandom(index, 18)),
      roughness: THREE.MathUtils.lerp(0.08, role === "small" ? 0.22 : 0.16, seededRandom(index, 19)),
      transmission: THREE.MathUtils.lerp(0.13, isMain ? 0.2 : 0.25, seededRandom(index, 20))
    };
  });
}

function createShard(data) {
  const geometry = createIrregularPrismGeometry(data.geometryType, data.geometrySeed);
  const group = new THREE.Group();
  group.position.copy(data.position);
  group.rotation.copy(data.rotation);
  group.scale.copy(data.scale);
  group.userData = {
    basePosition: data.position.clone(),
    baseRotation: data.rotation.clone(),
    baseScale: data.scale.clone(),
    role: data.role,
    phase: data.phase,
    spinSpeed: data.spinSpeed,
    spinAxis: data.spinAxis.clone(),
    mouseInfluence: data.mouseInfluence,
    floatX: data.floatX,
    floatY: data.floatY,
    floatZ: data.floatZ,
    floatSpeed: data.floatSpeed,
    spinDrift: data.spinDrift,
    glowSpeed: data.glowSpeed,
    glowPhase: data.glowPhase,
    baseRimIntensity: data.rimIntensity,
    baseEdgeOpacity: data.edgeOpacity,
    baseEmissiveIntensity: 0.18,
    rimMaterial: null,
    bodyMaterial: null,
    edgeMaterial: null
  };

  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      color: data.bodyColor,
      metalness: data.metalness,
      roughness: data.roughness,
      transmission: data.transmission,
      thickness: 1.8,
      ior: 2.1,
      reflectivity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: data.opacity,
      emissive: "#140014",
      emissiveIntensity: 0.18,
      envMapIntensity: 3.2,
      iridescence: 1,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 900],
      attenuationColor: "#05070a",
      attenuationDistance: 1.45,
      specularColor: "#5ffbff",
      flatShading: true,
      side: THREE.DoubleSide
    })
  );
  body.renderOrder = 1;

  const rimMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: data.rimIntensity },
      uBoost: { value: 0 },
      uColorA: { value: new THREE.Color("#5ffbff") },
      uColorB: { value: new THREE.Color("#7c4dff") },
      uColorC: { value: new THREE.Color("#ff4fd8") }
    },
    vertexShader: rimVertexShader,
    fragmentShader: rimFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const rim = new THREE.Mesh(geometry, rimMaterial);
  rim.scale.setScalar(1.032);
  rim.renderOrder = 2;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 18),
    new THREE.LineBasicMaterial({
      color: data.edgeColor,
      transparent: true,
      opacity: data.edgeOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  edges.scale.setScalar(1.008);
  edges.renderOrder = 3;

  group.userData.rimMaterial = rimMaterial;
  group.userData.bodyMaterial = body.material;
  group.userData.edgeMaterial = edges.material;
  group.add(body, rim, edges);

  return group;
}

export default function PrismBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionFactor = reducedMotion ? 0.48 : 1;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    const pointer = { x: 0, y: 0 };
    const clock = new THREE.Clock();
    const shardGroup = new THREE.Group();
    let frameId = 0;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.physicallyCorrectLights = true;
    renderer.useLegacyLights = false;
    mount.appendChild(renderer.domElement);

    camera.position.set(0, 0.08, 10.4);
    scene.add(new THREE.AmbientLight(0xffffff, 0.055));

    const cyanLight = new THREE.DirectionalLight("#5ffbff", 1.85);
    cyanLight.position.set(4.5, 4, 5);
    scene.add(cyanLight);

    const magentaLight = new THREE.DirectionalLight("#ff4fd8", 1.42);
    magentaLight.position.set(-5, 1.6, 4);
    scene.add(magentaLight);

    const cyanPoint = new THREE.PointLight("#5ffbff", 18, 10);
    cyanPoint.position.set(2.8, 1.4, 2.7);
    scene.add(cyanPoint);

    const violetPoint = new THREE.PointLight("#7c4dff", 15, 9);
    violetPoint.position.set(-2.8, -1.2, 2.6);
    scene.add(violetPoint);

    const magentaPoint = new THREE.PointLight("#ff4fd8", 9, 8);
    magentaPoint.position.set(0.6, -2.1, 2.4);
    scene.add(magentaPoint);

    makeShardData(window.innerWidth).forEach((data) => {
      shardGroup.add(createShard(data));
    });
    shardGroup.position.y = -0.1;
    scene.add(shardGroup);

    function resize() {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function handlePointerMove(event) {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    }

    function handlePointerLeave() {
      pointer.x = 0;
      pointer.y = 0;
    }

    function animate() {
      const delta = Math.min(clock.getDelta(), 0.033);
      const elapsed = clock.elapsedTime;

      shardGroup.position.x = THREE.MathUtils.damp(shardGroup.position.x, pointer.x * 0.26 * motionFactor, 1.75, delta);
      shardGroup.position.y = THREE.MathUtils.damp(shardGroup.position.y, -0.1 + pointer.y * 0.075 * motionFactor, 1.75, delta);
      shardGroup.rotation.y = THREE.MathUtils.damp(shardGroup.rotation.y, pointer.x * 0.058 * motionFactor, 1.65, delta);
      shardGroup.rotation.x = THREE.MathUtils.damp(shardGroup.rotation.x, -pointer.y * 0.028 * motionFactor, 1.65, delta);
      shardGroup.rotation.z = THREE.MathUtils.damp(
        shardGroup.rotation.z,
        (Math.sin(elapsed * 0.2) * 0.026 + pointer.x * 0.01) * motionFactor,
        1.6,
        delta
      );

      shardGroup.children.forEach((shard) => {
        const data = shard.userData;
        const anchorX = THREE.MathUtils.clamp(data.basePosition.x / 6.8, -1, 1);
        const anchorY = THREE.MathUtils.clamp(data.basePosition.y / 3.4, -1, 1);
        const dx = pointer.x - anchorX;
        const dy = pointer.y - anchorY;
        const proximity = 1 - clamp01(Math.sqrt(dx * dx + dy * dy) / 1.3);
        const softProximity = proximity * proximity * (3 - 2 * proximity);
        const floatTime = elapsed * data.floatSpeed;
        const floatY = Math.sin(floatTime + data.phase) * data.floatY * motionFactor;
        const driftX = Math.cos(floatTime * 0.72 + data.phase * 0.7) * data.floatX * motionFactor;
        const driftZ = Math.cos(floatTime * 0.84 + data.phase) * data.floatZ * motionFactor;
        const glowPulse = 0.5 + 0.5 * Math.sin(elapsed * data.glowSpeed + data.glowPhase);
        const targetPosition = data.basePosition.clone().add(
          new THREE.Vector3(
            driftX + pointer.x * data.mouseInfluence * 0.42 * motionFactor,
            floatY + pointer.y * data.mouseInfluence * 0.22 * motionFactor,
            driftZ + softProximity * 0.26 * motionFactor
          )
        );
        const boost = (softProximity * 0.18 + glowPulse * 0.055 + (Math.abs(pointer.x) + Math.abs(pointer.y)) * 0.016) * motionFactor;
        const targetScale = data.baseScale.clone().multiplyScalar(1 + (softProximity * 0.075 + glowPulse * 0.018) * motionFactor);
        const ease = 1 - Math.exp(-delta * 3.4);

        shard.position.lerp(targetPosition, ease);
        shard.scale.lerp(targetScale, ease);
        shard.rotation.x = THREE.MathUtils.damp(
          shard.rotation.x,
          data.baseRotation.x + elapsed * data.spinSpeed * data.spinAxis.x + Math.sin(elapsed * 0.24 + data.phase) * data.spinDrift * motionFactor + pointer.y * data.mouseInfluence * 0.82 * motionFactor,
          2.7,
          delta
        );
        shard.rotation.y = THREE.MathUtils.damp(
          shard.rotation.y,
          data.baseRotation.y + elapsed * data.spinSpeed * data.spinAxis.y + Math.cos(elapsed * 0.2 + data.phase) * data.spinDrift * 0.86 * motionFactor + pointer.x * data.mouseInfluence * 0.9 * motionFactor,
          2.7,
          delta
        );
        shard.rotation.z = THREE.MathUtils.damp(
          shard.rotation.z,
          data.baseRotation.z + elapsed * data.spinSpeed * data.spinAxis.z + Math.cos(elapsed * 0.22 + data.phase) * data.spinDrift * 0.95 * motionFactor,
          3,
          delta
        );
        data.rimMaterial.uniforms.uTime.value = elapsed;
        data.rimMaterial.uniforms.uIntensity.value = data.baseRimIntensity * (0.86 + glowPulse * 0.26);
        data.rimMaterial.uniforms.uBoost.value = THREE.MathUtils.damp(data.rimMaterial.uniforms.uBoost.value, boost, 4.2, delta);
        data.bodyMaterial.emissiveIntensity = THREE.MathUtils.damp(data.bodyMaterial.emissiveIntensity, data.baseEmissiveIntensity * (0.76 + glowPulse * 0.62), 2.8, delta);
        data.edgeMaterial.opacity = THREE.MathUtils.damp(data.edgeMaterial.opacity, data.baseEdgeOpacity * (0.78 + glowPulse * 0.45), 2.8, delta);
      });

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }

        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="exercise-prism-background" ref={mountRef} aria-hidden="true" />;
}
