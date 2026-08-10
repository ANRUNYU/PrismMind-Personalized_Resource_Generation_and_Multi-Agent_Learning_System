// @ts-nocheck
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function seededRandom(index: number, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function createShardGeometry(index: number) {
  const roll = seededRandom(index, 2)
  if (roll > 0.72) return new THREE.ConeGeometry(0.42, 1.28, 4, 1, false)
  if (roll > 0.38) return new THREE.OctahedronGeometry(0.72, 0)
  return new THREE.TetrahedronGeometry(0.76, 0)
}

function createShard(index: number, count: number) {
  const role = index < 6 ? 'main' : index < 18 ? 'mid' : 'dust'
  const geometry = createShardGeometry(index)
  const cyan = new THREE.Color('#5ffbff')
  const violet = new THREE.Color('#7c4dff')
  const magenta = new THREE.Color('#ff4fd8')
  const material = new THREE.MeshPhysicalMaterial({
    color: role === 'main' ? '#f8ffff' : role === 'mid' ? '#d9faff' : '#e8ebff',
    metalness: role === 'main' ? 0.42 : 0.28,
    roughness: 0.12,
    transmission: role === 'dust' ? 0.38 : 0.54,
    thickness: 1.2,
    ior: 1.85,
    transparent: true,
    opacity: role === 'main' ? 0.42 : role === 'mid' ? 0.28 : 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 0.86,
    iridescenceIOR: 1.25,
    iridescenceThicknessRange: [120, 760],
    emissive: role === 'main' ? cyan : role === 'mid' ? violet : magenta,
    emissiveIntensity: role === 'main' ? 0.08 : 0.045,
    side: THREE.DoubleSide,
    flatShading: true
  })
  const mesh = new THREE.Mesh(geometry, material)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 18),
    new THREE.LineBasicMaterial({
      color: [cyan, violet, magenta][index % 3],
      transparent: true,
      opacity: role === 'main' ? 0.52 : role === 'mid' ? 0.34 : 0.18,
      blending: THREE.AdditiveBlending
    })
  )
  const group = new THREE.Group()
  const t = count === 1 ? 0.5 : index / (count - 1)
  const x = THREE.MathUtils.lerp(1.7, 6.9, Math.pow(t, 0.66)) + THREE.MathUtils.lerp(-0.42, 0.36, seededRandom(index, 4))
  const y = THREE.MathUtils.lerp(1.35, -2.65, seededRandom(index, 5)) + (role === 'main' ? -0.55 : 0)
  const z = THREE.MathUtils.lerp(-1.2, 1.4, seededRandom(index, 6))
  const scale = {
    main: THREE.MathUtils.lerp(0.72, 1.18, seededRandom(index, 7)),
    mid: THREE.MathUtils.lerp(0.34, 0.72, seededRandom(index, 7)),
    dust: THREE.MathUtils.lerp(0.14, 0.34, seededRandom(index, 7))
  }[role]

  group.add(mesh, edges)
  group.position.set(x, y, z)
  group.rotation.set(
    THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-38, 38, seededRandom(index, 8))),
    THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-54, 54, seededRandom(index, 9))),
    THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-46, 46, seededRandom(index, 10)))
  )
  group.scale.set(scale * (role === 'main' ? 1.24 : 1), scale, scale * THREE.MathUtils.lerp(0.86, 1.46, seededRandom(index, 11)))
  group.userData = {
    basePosition: group.position.clone(),
    baseRotation: group.rotation.clone(),
    phase: seededRandom(index, 12) * Math.PI * 2,
    floatX: THREE.MathUtils.lerp(0.05, 0.18, seededRandom(index, 13)),
    floatY: THREE.MathUtils.lerp(0.09, 0.25, seededRandom(index, 14)),
    spin: THREE.MathUtils.lerp(0.04, 0.13, seededRandom(index, 15)),
    material,
    edgeMaterial: edges.material
  }

  return group
}

export default function PrismBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const motionFactor = reducedMotion ? 0.32 : 1
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    const pointer = { x: 0, y: 0 }
    const clock = new THREE.Clock()
    const shardGroup = new THREE.Group()
    let frameId = 0

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.95
    mount.appendChild(renderer.domElement)

    camera.position.set(0, 0.08, 10.2)
    scene.add(new THREE.AmbientLight('#ffffff', 0.32))

    const cyanLight = new THREE.DirectionalLight('#5ffbff', 2.1)
    cyanLight.position.set(4.5, 4.2, 5)
    scene.add(cyanLight)

    const violetLight = new THREE.DirectionalLight('#7c4dff', 1.5)
    violetLight.position.set(-4.5, 1.8, 4.2)
    scene.add(violetLight)

    const pointLight = new THREE.PointLight('#ff4fd8', 7.5, 9)
    pointLight.position.set(1.4, -2.3, 2.6)
    scene.add(pointLight)

    const count = window.innerWidth < 920 ? 16 : window.innerWidth < 1320 ? 24 : 30
    for (let index = 0; index < count; index += 1) {
      shardGroup.add(createShard(index, count))
    }
    shardGroup.position.y = -0.1
    scene.add(shardGroup)

    function resize() {
      const rect = mount.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    function handlePointerMove(event: PointerEvent) {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.y = -((event.clientY / window.innerHeight) * 2 - 1)
    }

    function animate() {
      const delta = Math.min(clock.getDelta(), 0.033)
      const elapsed = clock.elapsedTime

      shardGroup.position.x = THREE.MathUtils.damp(shardGroup.position.x, pointer.x * 0.22 * motionFactor, 1.7, delta)
      shardGroup.rotation.y = THREE.MathUtils.damp(shardGroup.rotation.y, pointer.x * 0.06 * motionFactor, 1.5, delta)
      shardGroup.rotation.x = THREE.MathUtils.damp(shardGroup.rotation.x, -pointer.y * 0.035 * motionFactor, 1.5, delta)

      shardGroup.children.forEach((shard) => {
        const data = shard.userData
        const floatTime = elapsed * 0.55 + data.phase
        const glowPulse = 0.5 + Math.sin(elapsed * 0.65 + data.phase) * 0.5
        const targetX = data.basePosition.x + Math.cos(floatTime) * data.floatX * motionFactor + pointer.x * 0.05 * motionFactor
        const targetY = data.basePosition.y + Math.sin(floatTime) * data.floatY * motionFactor + pointer.y * 0.035 * motionFactor

        shard.position.x = THREE.MathUtils.damp(shard.position.x, targetX, 2.4, delta)
        shard.position.y = THREE.MathUtils.damp(shard.position.y, targetY, 2.4, delta)
        shard.rotation.x = data.baseRotation.x + elapsed * data.spin * motionFactor
        shard.rotation.y = data.baseRotation.y + elapsed * data.spin * 0.72 * motionFactor + pointer.x * 0.08 * motionFactor
        shard.rotation.z = data.baseRotation.z + Math.sin(elapsed * 0.22 + data.phase) * 0.08 * motionFactor
        data.material.emissiveIntensity = 0.045 + glowPulse * 0.09
        data.edgeMaterial.opacity = THREE.MathUtils.clamp(
          data.edgeMaterial.opacity * 0.92 + (0.18 + glowPulse * 0.3) * 0.08,
          0.1,
          0.58
        )
      })

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    frameId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="paper-prism-background" ref={mountRef} aria-hidden="true" />
}
