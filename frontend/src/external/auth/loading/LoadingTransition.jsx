import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, Preload } from '@react-three/drei'
import * as THREE from 'three'

import './loading-page.css'

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
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.85);
    float edge = smoothstep(0.22, 1.0, fresnel);
    float facets = 0.5 + 0.5 * sin(
      normal.x * 13.0 +
      normal.y * 9.0 +
      normal.z * 11.0 +
      vWorldPosition.x * 1.5 +
      uTime * 0.42
    );
    vec3 color = mix(uColorA, uColorB, facets);

    gl_FragColor = vec4(color * (1.15 + edge * 1.75), edge * 0.62);
  }
`

function PrismRim({ geometry }) {
  const material = useRef()
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#9cfffb') },
      uColorB: { value: new THREE.Color('#ef9cff') }
    }),
    []
  )

  useFrame(({ clock }) => {
    if (material.current) {
      material.current.uniforms.uTime.value = clock.elapsedTime
    }
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

function LoadingPrism() {
  const group = useRef()
  const mainMesh = useRef()
  const accentMesh = useRef()
  const geometry = useMemo(() => new THREE.OctahedronGeometry(1, 0), [])
  const accentGeometry = useMemo(() => new THREE.TetrahedronGeometry(0.5, 0), [])
  const axis = useMemo(() => new THREE.Vector3(1, 1, 0).normalize(), [])

  useFrame(({ clock }, delta) => {
    if (!group.current) return

    group.current.position.y = Math.sin(clock.elapsedTime * 1.8) * 0.08

    if (mainMesh.current) {
      mainMesh.current.rotateOnAxis(axis, delta * 1.8)
    }

    if (accentMesh.current) {
      accentMesh.current.rotateOnAxis(axis, delta * -1.35)
    }
  })

  return (
    <group ref={group} rotation={[0.35, -0.42, -0.42]}>
      <mesh ref={mainMesh} geometry={geometry} scale={[0.82, 1.18, 0.68]} renderOrder={1}>
        <meshPhysicalMaterial
          color="#05070a"
          transmission={0.65}
          roughness={0.02}
          metalness={0}
          ior={1.5}
          thickness={1.4}
          iridescence={1}
          iridescenceIOR={1.35}
          iridescenceThicknessRange={[120, 900]}
          clearcoat={1}
          clearcoatRoughness={0.01}
          envMapIntensity={2.5}
          attenuationColor="#060b11"
          attenuationDistance={1.4}
          specularIntensity={1}
          specularColor="#d9fff8"
          flatShading
          transparent
          opacity={0.78}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        ref={accentMesh}
        geometry={accentGeometry}
        position={[0.22, -0.06, 0.18]}
        rotation={[0.45, 0.2, -0.34]}
        scale={[0.68, 1.1, 0.54]}
        renderOrder={1}
      >
        <meshPhysicalMaterial
          color="#030508"
          transmission={0.58}
          roughness={0.025}
          metalness={0}
          ior={1.5}
          thickness={1}
          iridescence={1}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[160, 760]}
          clearcoat={1}
          clearcoatRoughness={0.01}
          envMapIntensity={2.2}
          attenuationColor="#070a12"
          attenuationDistance={1.2}
          flatShading
          transparent
          opacity={0.48}
          side={THREE.DoubleSide}
        />
      </mesh>

      <PrismRim geometry={geometry} />
    </group>
  )
}

function LoadingScene() {
  return (
    <>
      <ambientLight intensity={0.12} />
      <pointLight color="#9cfffb" intensity={28} distance={8} position={[2.2, 1.6, 2.4]} />
      <pointLight color="#ef9cff" intensity={22} distance={8} position={[-2.4, -1.2, 2.6]} />
      <pointLight color="#ffffff" intensity={7} distance={6} position={[0, 2.6, -1.6]} />

      <Environment resolution={256}>
        <Lightformer form="rect" color="#d9fff8" intensity={4} position={[0, 3, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[4.5, 0.7, 1]} />
        <Lightformer form="rect" color="#ef9cff" intensity={3.4} position={[-3, 0, 2]} rotation={[0, Math.PI / 2, 0]} scale={[3.8, 0.7, 1]} />
        <Lightformer form="rect" color="#9cfffb" intensity={3.2} position={[3, -0.4, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[3.8, 0.7, 1]} />
      </Environment>

      <LoadingPrism />

      <Preload all />
    </>
  )
}

export default function LoadingTransition({
  active,
  status = 'Loading',
  testId = 'auth-loading-transition'
}) {
  const [shouldRenderScene, setShouldRenderScene] = useState(active)

  useEffect(() => {
    if (active) {
      setShouldRenderScene(true)
      return undefined
    }

    const timer = window.setTimeout(() => {
      setShouldRenderScene(false)
    }, 520)

    return () => window.clearTimeout(timer)
  }, [active])

  return (
    <div
      className={`loading-transition ${active ? 'is-active' : 'is-hidden'}`}
      data-testid={testId}
      aria-hidden={!active}
      aria-label={status}
      aria-live="polite"
    >
      {shouldRenderScene ? (
        <div className="loading-core">
          <div className="loading-canvas" aria-hidden="true">
            <Canvas
              camera={{ position: [0, 0, 4.6], fov: 38, near: 0.1, far: 100 }}
              dpr={[1, 2]}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 0.98
              }}
              onCreated={({ gl }) => {
                gl.useLegacyLights = false
                gl.setClearColor('#000000', 0)
              }}
            >
              <LoadingScene />
            </Canvas>
          </div>

          <div className="loading-copy">
            <p className="loading-brand">Prism Mind</p>
            <p className="loading-text">
              Loading
              <span className="loading-dot">.</span>
              <span className="loading-dot">.</span>
              <span className="loading-dot">.</span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
