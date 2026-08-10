import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Preload } from '@react-three/drei'
import * as THREE from 'three'

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
`

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
`

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1)

function readPointer(pointerTargetRef) {
  const pointer = pointerTargetRef?.current
  if (!pointer) return { x: 0, y: 0 }

  const strength = pointer.strength ?? 1
  return {
    x: pointer.x * strength,
    y: pointer.y * strength,
  }
}

function seededRandom(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function bellCurve(value, center, width) {
  const distance = (value - center) / width
  return Math.exp(-distance * distance)
}

function makeAsteroidBelt() {
  const count = 34

  return Array.from({ length: count }, (_, index) => {
    const rawT = index / (count - 1)
    const t = clamp01(rawT + (seededRandom(index, 1) - 0.5) * 0.055)
    const middleMass = Math.pow(Math.sin(t * Math.PI), 0.9)
    const rightMass = bellCurve(t, 0.68, 0.18)
    const edgeScale = THREE.MathUtils.lerp(0.62, 1.24, middleMass)
    const mass = edgeScale + rightMass * 0.38

    const x = THREE.MathUtils.lerp(-7.4, 8.1, t) + (seededRandom(index, 2) - 0.5) * 0.58
    const orbit =
      Math.sin(t * Math.PI * 1.38 - 0.78) * 1.12 +
      Math.sin(t * Math.PI * 3.7 + 0.45) * 0.28
    const tiltedBand = (t - 0.5) * 0.68
    const y = orbit + tiltedBand + (seededRandom(index, 3) - 0.5) * 0.58
    const z =
      THREE.MathUtils.lerp(-1.9, 1.45, seededRandom(index, 4)) +
      Math.sin(t * Math.PI * 2.1 + 0.35) * 0.52

    const xScale = (0.4 + seededRandom(index, 5) * 1.2) * mass
    const yScale = (0.12 + seededRandom(index, 6) * 0.35) * THREE.MathUtils.lerp(0.85, 1.15, middleMass)
    const zScale = (0.4 + seededRandom(index, 7) * 1.4) * mass
    const bigShardBoost = index === 18 || index === 24 ? 1.28 : 1

    return {
      key: `crystal-shard-${index}`,
      geometryIndex: Math.floor(seededRandom(index, 8) * 3),
      position: [x, y, z],
      scale: [xScale * bigShardBoost, yScale * bigShardBoost, zScale * bigShardBoost],
      rotation: [
        THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-38, 38, seededRandom(index, 9))),
        THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-70, 70, seededRandom(index, 10))),
        THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-48, 48, seededRandom(index, 11))),
      ],
      phase: seededRandom(index, 12) * Math.PI * 2,
      floatAmount: THREE.MathUtils.lerp(0.08, 0.28, seededRandom(index, 13)),
      spinSpeed: THREE.MathUtils.lerp(0.16, 0.42, seededRandom(index, 14)),
      spinAxis: [
        THREE.MathUtils.lerp(0.45, 1.12, seededRandom(index, 15)),
        THREE.MathUtils.lerp(0.65, 1.35, seededRandom(index, 16)),
        THREE.MathUtils.lerp(0.28, 0.9, seededRandom(index, 17)),
      ],
      mouseInfluence: THREE.MathUtils.lerp(0.12, 0.32, seededRandom(index, 18)) * (0.82 + middleMass * 0.38),
      depthInfluence: THREE.MathUtils.lerp(0.55, 1.28, seededRandom(index, 19)),
      rimIntensity: THREE.MathUtils.lerp(0.18, 0.42, seededRandom(index, 20)) * (0.9 + rightMass * 0.18),
    }
  })
}

function FresnelRim({ geometry, rimIntensity, boostRef }) {
  const material = useRef()
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: rimIntensity },
      uBoost: { value: 0 },
      uColorA: { value: new THREE.Color('#18f7ff') },
      uColorB: { value: new THREE.Color('#ff4fd8') },
      uColorC: { value: new THREE.Color('#ffe86a') },
    }),
    [rimIntensity],
  )

  useFrame(({ clock }, delta) => {
    if (!material.current) return

    material.current.uniforms.uTime.value = clock.elapsedTime
    material.current.uniforms.uBoost.value = THREE.MathUtils.damp(
      material.current.uniforms.uBoost.value,
      boostRef.current,
      4.2,
      delta,
    )
  })

  return (
    <mesh geometry={geometry} scale={1.035} renderOrder={2}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={rimVertexShader}
        fragmentShader={rimFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function CrystalShard({ data, geometries, pointerTargetRef }) {
  const group = useRef()
  const boostRef = useRef(0)
  const geometry = geometries[data.geometryIndex]
  const base = useMemo(
    () => ({
      position: new THREE.Vector3(...data.position),
      rotation: new THREE.Euler(...data.rotation),
      scale: new THREE.Vector3(...data.scale),
      targetPosition: new THREE.Vector3(...data.position),
      targetScale: new THREE.Vector3(...data.scale),
    }),
    [data.position, data.rotation, data.scale],
  )

  useFrame(({ clock }, delta) => {
    if (!group.current) return

    const pointer = readPointer(pointerTargetRef)
    const time = clock.elapsedTime
    const anchorX = THREE.MathUtils.clamp(base.position.x / 8, -1, 1)
    const anchorY = THREE.MathUtils.clamp(base.position.y / 3.2, -1, 1)
    const dx = pointer.x - anchorX
    const dy = pointer.y - anchorY
    const distance = Math.sqrt(dx * dx + dy * dy)
    const proximity = 1 - clamp01(distance / 1.12)
    const softProximity = proximity * proximity * (3 - 2 * proximity)
    const floatY = Math.sin(time * 0.58 + data.phase) * data.floatAmount
    const driftX = Math.cos(time * 0.19 + data.phase) * 0.035
    const driftZ = Math.sin(time * 0.24 + data.phase) * 0.08
    const parallax = 0.08 + data.depthInfluence * 0.08
    const forwardPull = softProximity * data.depthInfluence * 0.62

    boostRef.current = softProximity * 0.24 + (Math.abs(pointer.x) + Math.abs(pointer.y)) * 0.025
    base.targetPosition.set(
      base.position.x + driftX + pointer.x * parallax,
      base.position.y + floatY + pointer.y * parallax * 0.62,
      base.position.z + driftZ + forwardPull,
    )

    const scaleBoost = 1 + softProximity * 0.16
    base.targetScale.set(
      base.scale.x * scaleBoost,
      base.scale.y * (1 + softProximity * 0.08),
      base.scale.z * scaleBoost,
    )

    const ease = 1 - Math.exp(-delta * 4.1)
    group.current.position.lerp(base.targetPosition, ease)
    group.current.scale.lerp(base.targetScale, ease)
    group.current.rotation.x = THREE.MathUtils.damp(
      group.current.rotation.x,
      base.rotation.x +
        time * data.spinSpeed * data.spinAxis[0] * 0.28 +
        Math.sin(time * 0.32 + data.phase) * 0.1 +
        pointer.y * data.mouseInfluence,
      3.2,
      delta,
    )
    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      base.rotation.y +
        time * data.spinSpeed * data.spinAxis[1] +
        pointer.x * data.mouseInfluence * 1.45,
      3.0,
      delta,
    )
    group.current.rotation.z = THREE.MathUtils.damp(
      group.current.rotation.z,
      base.rotation.z +
        time * data.spinSpeed * data.spinAxis[2] * 0.38 +
        pointer.x * data.mouseInfluence * 0.38 -
        pointer.y * data.mouseInfluence * 0.2,
      3.4,
      delta,
    )
  })

  return (
    <group
      ref={group}
      position={data.position}
      rotation={data.rotation}
      scale={data.scale}
    >
      <mesh geometry={geometry} renderOrder={1}>
        <meshPhysicalMaterial
          color="#050505"
          transmission={0.7}
          roughness={0.01}
          metalness={0}
          ior={1.5}
          thickness={1.2}
          iridescence={1}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[120, 900]}
          clearcoat={1}
          clearcoatRoughness={0.01}
          envMapIntensity={3}
          attenuationColor="#070b10"
          attenuationDistance={1.55}
          specularIntensity={1}
          specularColor="#dcfbff"
          flatShading
          transparent
          opacity={data.opacity ?? 0.82}
          side={THREE.DoubleSide}
        />
      </mesh>
      <FresnelRim geometry={geometry} rimIntensity={data.rimIntensity} boostRef={boostRef} />
    </group>
  )
}

function InteractiveRimLights({ pointerTargetRef, variant = 'default' }) {
  const cyan = useRef()
  const magenta = useRef()
  const violet = useRef()
  const isRegister = variant === 'register'
  const intensityScale = isRegister ? 0.62 : 1
  const cyanBaseX = isRegister ? 3.4 : 2.4
  const cyanBaseY = isRegister ? 1.0 : 1.3
  const magentaBaseX = isRegister ? 0.8 : -3.6
  const magentaBaseY = isRegister ? -1.3 : -1.1
  const violetBaseX = isRegister ? 5.6 : 5

  useFrame((_, delta) => {
    const pointer = readPointer(pointerTargetRef)
    const energy = 1 + (Math.abs(pointer.x) + Math.abs(pointer.y)) * 0.22

    if (cyan.current) {
      cyan.current.position.x = THREE.MathUtils.damp(cyan.current.position.x, cyanBaseX + pointer.x * 2.1, 2.5, delta)
      cyan.current.position.y = THREE.MathUtils.damp(cyan.current.position.y, cyanBaseY + pointer.y * 0.7, 2.5, delta)
      cyan.current.intensity = THREE.MathUtils.damp(cyan.current.intensity, 23 * intensityScale * energy, 2.8, delta)
    }

    if (magenta.current) {
      magenta.current.position.x = THREE.MathUtils.damp(magenta.current.position.x, magentaBaseX + pointer.x * 1.4, 2.3, delta)
      magenta.current.position.y = THREE.MathUtils.damp(magenta.current.position.y, magentaBaseY + pointer.y * 0.5, 2.3, delta)
      magenta.current.intensity = THREE.MathUtils.damp(magenta.current.intensity, 18 * intensityScale * energy, 2.8, delta)
    }

    if (violet.current) {
      violet.current.position.x = THREE.MathUtils.damp(violet.current.position.x, violetBaseX + pointer.x * 1.1, 2.2, delta)
      violet.current.intensity = THREE.MathUtils.damp(violet.current.intensity, 9 * intensityScale * energy, 2.8, delta)
    }
  })

  return (
    <>
      <pointLight ref={cyan} color="#9cfffb" intensity={23 * intensityScale} distance={10} position={[cyanBaseX, cyanBaseY, 2.8]} />
      <pointLight ref={magenta} color="#7d4dff" intensity={18 * intensityScale} distance={9} position={[magentaBaseX, magentaBaseY, 3.2]} />
      <pointLight ref={violet} color="#ffd86a" intensity={9 * intensityScale} distance={7} position={[violetBaseX, -2.2, 2]} />
    </>
  )
}

function AsteroidBeltScene({ pointerTargetRef, variant = 'default' }) {
  const group = useRef()
  const { camera } = useThree()
  const geometries = useMemo(
    () => [
      new THREE.OctahedronGeometry(1, 0),
      new THREE.TetrahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
    ],
    [],
  )
  const shards = useMemo(makeAsteroidBelt, [])
  const sceneShards = useMemo(() => {
    if (variant !== 'register') return shards

    return shards.map((shard) => {
      const isLeftTitleZone = shard.position[0] < -1.7 && shard.position[1] > -1.4
      const isPanelZone = shard.position[0] > 4.2 && shard.position[1] > -0.7
      const isMiddleAccent = shard.position[0] >= -1.7 && shard.position[0] <= 3.2
      const opacity = isLeftTitleZone ? 0.22 : isPanelZone ? 0.42 : isMiddleAccent ? 0.56 : 0.66
      const scaleTrim = isLeftTitleZone ? 0.72 : isPanelZone ? 0.84 : 0.94

      return {
        ...shard,
        position: [
          shard.position[0] + (isLeftTitleZone ? 1.25 : 0.85),
          shard.position[1] + (isLeftTitleZone ? -0.85 : -0.18),
          shard.position[2] - 0.35,
        ],
        scale: shard.scale.map((value) => value * scaleTrim),
        opacity,
        rimIntensity: shard.rimIntensity * (isLeftTitleZone ? 0.34 : isPanelZone ? 0.42 : 0.64),
      }
    })
  }, [shards, variant])

  useFrame((_, delta) => {
    const pointer = readPointer(pointerTargetRef)
    const registerOffsetX = variant === 'register' ? 0.64 : 0
    const registerOffsetY = variant === 'register' ? -0.16 : 0

    if (group.current) {
      group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, registerOffsetX + pointer.x * 0.45, 0.06)
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, registerOffsetY + pointer.y * 0.25, 0.06)
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, pointer.x * 0.095, 1.9, delta)
      group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -pointer.y * 0.055, 1.9, delta)
      group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, pointer.x * 0.025, 1.7, delta)
    }

    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.46, 1.55, delta)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.12 + pointer.y * 0.22, 1.55, delta)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 10.5 - Math.abs(pointer.x) * 0.18, 1.4, delta)
    camera.lookAt(0, 0.05, 0)
  })

  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.07} />
      <directionalLight color="#7ee7ff" intensity={1.9} position={[4.5, 4, 5]} />
      <directionalLight color="#ff55d6" intensity={1.45} position={[-5, 1.6, 4]} />
      <InteractiveRimLights pointerTargetRef={pointerTargetRef} variant={variant} />

      <Environment resolution={512}>
        <Lightformer form="rect" color="#bdfcff" intensity={4.7} position={[0, 4, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 1.1, 1]} />
        <Lightformer form="rect" color="#ff4fd8" intensity={3.8} position={[-5, 0, 2.5]} rotation={[0, Math.PI / 2, 0]} scale={[6, 1.4, 1]} />
        <Lightformer form="rect" color="#725bff" intensity={3.35} position={[5, -1.3, 3]} rotation={[0, -Math.PI / 2, 0]} scale={[5.8, 1.2, 1]} />
        <Lightformer form="circle" color="#fff3a6" intensity={2.5} position={[0, -3.4, 4]} scale={[2.6, 2.6, 1]} />
      </Environment>

      <group ref={group}>
        {sceneShards.map((shard) => (
          <CrystalShard
            key={shard.key}
            data={shard}
            geometries={geometries}
            pointerTargetRef={pointerTargetRef}
          />
        ))}
      </group>

      <Preload all />
    </>
  )
}

export default function LensBackground({ pointerTargetRef, variant = 'default' }) {
  const fallbackPointerRef = useRef({ x: 0, y: 0, strength: 1 })
  const scenePointerRef = pointerTargetRef ?? fallbackPointerRef

  return (
    <div className={`lens-background lens-background-${variant}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0.1, 10.5], fov: 38, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.92,
        }}
        onCreated={({ gl }) => {
          gl.physicallyCorrectLights = true
          gl.useLegacyLights = false
        }}
      >
        <AsteroidBeltScene pointerTargetRef={scenePointerRef} variant={variant} />
      </Canvas>
    </div>
  )
}
