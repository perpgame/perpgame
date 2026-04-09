import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const VERTEX_SHADER = `
attribute float lineDistance; attribute vec3 color; varying vec3 vColor; varying float vDistance; varying float vHeight;
void main() { vColor = color; vDistance = lineDistance; vHeight = (position.y + 15.0) / 30.0; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; }
`

const FRAGMENT_SHADER = `
uniform float time; uniform vec3 uEnergyColor; varying vec3 vColor; varying float vDistance; varying float vHeight;
void main() {
float flow1 = sin(vDistance * 50.0 - time * 15.0);
float flow2 = sin(vDistance * 150.0 - time * 40.0);
float pulse = smoothstep(0.6, 1.0, flow1) * 0.9 + smoothstep(0.8, 1.0, flow2) * 0.6;
float burst = smoothstep(0.4, 0.9, vHeight) * 2.0;
vec3 finalColor = mix(vColor * 0.1, uEnergyColor, pulse + burst * 0.2);
float brightness = 1.0 + (pulse * 2.5) + (burst * 1.5);
float alpha = 0.6 + pulse * 0.4;
gl_FragColor = vec4(finalColor * brightness, alpha);
}
`

const PARTICLE_VERTEX = `
attribute float size; attribute float offset; uniform float time; varying float vOpacity; varying vec3 vColor; attribute vec3 color;
void main() {
vColor = color; vec3 pos = position; float breathe = sin(time * 2.0 + offset) * 0.5; pos += normal * breathe;
vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0); gl_PointSize = size * (300.0 / -mvPosition.z); vOpacity = 0.6 + 0.4 * sin(time * 5.0 + offset); gl_Position = projectionMatrix * mvPosition;
}
`

const PARTICLE_FRAGMENT = `
varying float vOpacity; varying vec3 vColor;
void main() {
vec2 center = gl_PointCoord - 0.5; float dist = length(center); if (dist > 0.5) discard;
float glow = 1.0 - (dist * 2.0); glow = pow(glow, 2.0); gl_FragColor = vec4(vColor, vOpacity * glow);
}
`

const CONFIG = { points: 150000, dt: 0.008, scale: 9.0, a: 1.0, b: 3.0, c: 1.0, d: 5.0, r: 0.006, s: 4.0, x1: -1.6, I: 3.0 }

function createAttractorData() {
  const positions = [], colors = [], lineDistances = [], particleOffsets = [], particleSizes = []
  let x = -1, y = 0, z = 0
  const color = new THREE.Color()
  let totalDist = 0

  for (let i = 0; i < CONFIG.points; i++) {
    const dx = y - CONFIG.a * Math.pow(x, 3) + CONFIG.b * Math.pow(x, 2) - z + CONFIG.I
    const dy = CONFIG.c - CONFIG.d * Math.pow(x, 2) - y
    const dz = CONFIG.r * (CONFIG.s * (x - CONFIG.x1) - z)
    const prevX = x * CONFIG.scale, prevY = y * CONFIG.scale * 0.6, prevZ = z * CONFIG.scale * 2.0
    x += dx * CONFIG.dt; y += dy * CONFIG.dt; z += dz * CONFIG.dt
    const vx = y * CONFIG.scale * 0.6, vy = x * CONFIG.scale, vz = z * CONFIG.scale * 2.0
    positions.push(vx, vy, vz)
    if (i > 0) {
      const dist = Math.sqrt(Math.pow(vx - prevY, 2) + Math.pow(vy - prevX, 2) + Math.pow(vz - prevZ, 2))
      totalDist += dist * 0.05
    }
    lineDistances.push(totalDist)
    const normalizedHeight = (x + 2.0) / 4.0
    const primary = new THREE.Color(0xb5efdc)
    const dark = new THREE.Color(0x0a1a14)
    color.copy(dark).lerp(primary, normalizedHeight * 0.4)
    colors.push(color.r, color.g, color.b)
    particleOffsets.push(Math.random() * 100)
    if (Math.random() > 0.95 || normalizedHeight > 0.6) {
      particleSizes.push(Math.random() * 1.5 + (normalizedHeight * 2.0))
    } else {
      particleSizes.push(0.0)
    }
  }
  return { positions, colors, lineDistances, particleOffsets, particleSizes }
}

export default function SynapseViz({ style, className }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    const w = container.clientWidth, h = container.clientHeight
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000)
    camera.position.set(50, 10, 120)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.toneMapping = THREE.ReinhardToneMapping
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.05
    controls.autoRotate = true; controls.autoRotateSpeed = 0.8
    controls.maxDistance = 150; controls.minDistance = 10

    renderer.setClearColor(0x000000, 0)

    const data = createAttractorData()
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3))
    lineGeo.setAttribute('lineDistance', new THREE.Float32BufferAttribute(data.lineDistances, 1))
    lineGeo.computeBoundingSphere()
    const center = lineGeo.boundingSphere.center
    lineGeo.translate(-center.x, -center.y, -center.z)

    const lineMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0.0 }, uEnergyColor: { value: new THREE.Color(0xb5efdc) } },
      vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    scene.add(new THREE.Line(lineGeo, lineMat))

    const particlesGeo = new THREE.BufferGeometry()
    particlesGeo.setAttribute('position', lineGeo.getAttribute('position'))
    particlesGeo.setAttribute('color', lineGeo.getAttribute('color'))
    particlesGeo.setAttribute('size', new THREE.Float32BufferAttribute(data.particleSizes, 1))
    particlesGeo.setAttribute('offset', new THREE.Float32BufferAttribute(data.particleOffsets, 1))
    const particlesMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0.0 } },
      vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    scene.add(new THREE.Points(particlesGeo, particlesMat))

    const clock = new THREE.Clock()
    let animId
    function animate() {
      animId = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      lineMat.uniforms.time.value += delta
      particlesMat.uniforms.time.value += delta
      controls.update()
      renderer.render(scene, camera)
    }

    const onResize = () => {
      const w2 = container.clientWidth, h2 = container.clientHeight
      camera.aspect = w2 / h2; camera.updateProjectionMatrix()
      renderer.setSize(w2, h2)
    }
    window.addEventListener('resize', onResize)
    animate()

    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(animId)
      renderer.dispose()
      controls.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className={className} style={{ position: 'relative', overflow: 'visible', ...style }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      />
    </div>
  )
}
