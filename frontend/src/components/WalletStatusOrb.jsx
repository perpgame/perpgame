import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// Ray-marched sphere with noise displacement, rings, and particle field
const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec3  uColor;       // primary color
uniform vec3  uColor2;      // secondary accent
uniform float uIntensity;   // 0..1 energy level
uniform float uSpeed;       // animation speed multiplier

out vec4 fragColor;

// simplex-style hash
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3d(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

// Sphere SDF with noise displacement
float sdSphere(vec3 p, float r, float t) {
  float disp = fbm(p * 2.5 + t * uSpeed * 0.4) * 0.15 * uIntensity;
  return length(p) - r - disp;
}

// Orbit ring SDF
float sdRing(vec3 p, float r, float thick) {
  float d = length(vec2(length(p.xz) - r, p.y));
  return d - thick;
}

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  float t = uTime;

  // Camera
  vec3 ro = vec3(0.0, 0.0, 2.8);
  vec3 rd = normalize(vec3(uv, -1.2));

  // Gentle auto-rotation
  float rotAngle = t * uSpeed * 0.15;
  rd.xz *= rot2(rotAngle);
  ro.xz *= rot2(rotAngle);

  // Ray march
  float totalDist = 0.0;
  float minDist = 999.0;
  vec3 hitPos = ro;
  bool hit = false;

  for (int i = 0; i < 64; i++) {
    hitPos = ro + rd * totalDist;
    float d = sdSphere(hitPos, 0.6, t);
    minDist = min(minDist, d);
    if (d < 0.001) { hit = true; break; }
    if (totalDist > 5.0) break;
    totalDist += d * 0.8;
  }

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit) {
    // Normal via central differences
    vec2 e = vec2(0.001, 0.0);
    vec3 n = normalize(vec3(
      sdSphere(hitPos + e.xyy, 0.6, t) - sdSphere(hitPos - e.xyy, 0.6, t),
      sdSphere(hitPos + e.yxy, 0.6, t) - sdSphere(hitPos - e.yxy, 0.6, t),
      sdSphere(hitPos + e.yyx, 0.6, t) - sdSphere(hitPos - e.yyx, 0.6, t)
    ));

    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
    float diff = max(dot(n, lightDir), 0.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    // Surface noise color
    float noiseVal = fbm(hitPos * 3.0 + t * uSpeed * 0.3);
    vec3 surfCol = mix(uColor, uColor2, noiseVal * 0.5 + 0.5);

    col = surfCol * (0.15 + diff * 0.6);
    col += uColor * fres * 0.8 * uIntensity;

    // Sub-surface scattering fake
    float sss = max(dot(n, rd), 0.0);
    col += uColor2 * sss * 0.3 * uIntensity;

    alpha = 0.95;
  }

  // Glow around sphere (even on miss)
  float glowFactor = exp(-minDist * 4.0) * uIntensity;
  col += uColor * glowFactor * 0.8;
  alpha = max(alpha, glowFactor * 0.6);

  // Orbit rings
  for (int r = 0; r < 2; r++) {
    float ringRad = 0.9 + float(r) * 0.25;
    float ringSpeed = (0.3 + float(r) * 0.2) * uSpeed;
    vec3 rp = hitPos;

    // Tilt each ring differently
    float tilt = 0.5 + float(r) * 0.7;
    rp.xy *= rot2(tilt);
    rp.yz *= rot2(t * ringSpeed * 0.3);

    // March for ring
    float ringTotal = 0.0;
    float ringMin = 999.0;
    for (int i = 0; i < 32; i++) {
      vec3 rpos = ro + rd * ringTotal;
      rpos.xy *= rot2(tilt);
      rpos.yz *= rot2(t * ringSpeed * 0.3);
      rpos.xz *= rot2(rotAngle);
      float d = sdRing(rpos, ringRad, 0.004);
      ringMin = min(ringMin, d);
      if (d < 0.001 || ringTotal > 5.0) break;
      ringTotal += d;
    }
    float ringGlow = exp(-ringMin * 50.0) * 0.3 * uIntensity;
    col += uColor * ringGlow;
    alpha = max(alpha, ringGlow * 0.5);
  }

  // Particle field
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float angle = fi * 2.399 + t * uSpeed * 0.5;
    float radius = 0.8 + sin(fi * 1.7 + t) * 0.3;
    float height = sin(fi * 2.3 + t * uSpeed * 0.7) * 0.5;
    vec3 pPos = vec3(cos(angle) * radius, height, sin(angle) * radius);

    // Project to screen
    vec3 pp = pPos - ro;
    pp.xz *= rot2(rotAngle);
    float pDist = length(uv - pp.xy / (-pp.z) * 1.2);
    float pGlow = exp(-pDist * 80.0) * 0.4 * uIntensity;
    col += uColor2 * pGlow;
    alpha = max(alpha, pGlow);
  }

  // Vignette
  float vig = 1.0 - length(uv) * 0.5;
  col *= vig;

  fragColor = vec4(col, alpha * vig);
}
`

const STATUS_CONFIGS = {
  active: {
    color: [0.0, 0.83, 0.67],   // #00D4AA
    color2: [0.71, 0.94, 0.86],  // #b5efdc
    intensity: 1.0,
    speed: 1.0,
  },
  inactive: {
    color: [0.35, 0.4, 0.45],
    color2: [0.25, 0.3, 0.35],
    intensity: 0.3,
    speed: 0.3,
  },
  unauthorized: {
    color: [1.0, 0.7, 0.2],
    color2: [1.0, 0.4, 0.1],
    intensity: 0.7,
    speed: 0.6,
  },
}

export default function WalletStatusOrb({ status = 'inactive' }) {
  const ctnRef = useRef(null)
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    const ctn = ctnRef.current
    if (!ctn) return

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.canvas.style.backgroundColor = 'transparent'

    const cfg = STATUS_CONFIGS[status] || STATUS_CONFIGS.inactive

    const geometry = new Triangle(gl)
    if (geometry.attributes.uv) delete geometry.attributes.uv

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uColor: { value: cfg.color },
        uColor2: { value: cfg.color2 },
        uIntensity: { value: cfg.intensity },
        uSpeed: { value: cfg.speed },
      },
    })

    const mesh = new Mesh(gl, { geometry, program })
    ctn.appendChild(gl.canvas)

    function resize() {
      if (!ctn) return
      const w = ctn.offsetWidth
      const h = ctn.offsetHeight
      renderer.setSize(w, h)
      program.uniforms.uResolution.value = [w, h]
    }
    window.addEventListener('resize', resize)
    resize()

    // Smooth transition between states
    const current = { ...cfg }

    let animId = 0
    const update = (t) => {
      animId = requestAnimationFrame(update)

      const target = STATUS_CONFIGS[statusRef.current] || STATUS_CONFIGS.inactive
      const lerp = 0.04

      current.color = current.color.map((v, i) => v + (target.color[i] - v) * lerp)
      current.color2 = current.color2.map((v, i) => v + (target.color2[i] - v) * lerp)
      current.intensity += (target.intensity - current.intensity) * lerp
      current.speed += (target.speed - current.speed) * lerp

      program.uniforms.uTime.value = t * 0.001
      program.uniforms.uColor.value = current.color
      program.uniforms.uColor2.value = current.color2
      program.uniforms.uIntensity.value = current.intensity
      program.uniforms.uSpeed.value = current.speed

      renderer.render({ scene: mesh })
    }
    animId = requestAnimationFrame(update)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      if (ctn && gl.canvas.parentNode === ctn) ctn.removeChild(gl.canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <div className="wallet-status-orb-wrap">
      <div ref={ctnRef} className="wallet-status-orb" />
      <span className={`wallet-status-orb-label wallet-status-orb-label--${status}`}>
        {status === 'active' ? 'Active' : status === 'unauthorized' ? 'Not Authorized' : 'Inactive'}
      </span>
    </div>
  )
}
