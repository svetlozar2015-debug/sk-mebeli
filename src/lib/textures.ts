import * as THREE from 'three';
import { BoardDecor } from '../types/furniture';

const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 200;
  const g = parseInt(clean.slice(2, 4), 16) || 200;
  const b = parseInt(clean.slice(4, 6), 16) || 200;
  return [r, g, b];
}

interface ProceduralPbrMaps {
  map: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
}

function createProceduralDecorMaps(
  decor: BoardDecor,
  maxAnisotropy: number,
): ProceduralPbrMaps {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const [r, g, b] = hexToRgb(decor.colorHex);
  const [gr, gg, gb] = hexToRgb(decor.grainHex || decor.colorHex);

  ctx.fillStyle = decor.colorHex;
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const isGloss = decor.category === 'gloss';
  const baseRoughByte = isGloss
    ? 22
    : Math.round(Math.max(0.32, Math.min(0.92, decor.roughness ?? 0.65)) * 255);
  rCtx.fillStyle = `rgb(${baseRoughByte},${baseRoughByte},${baseRoughByte})`;
  rCtx.fillRect(0, 0, size, size);

  if (decor.category === 'wood') {
    // Rich vertical laminated wood grain with subtle cathedral fibers & tactile pores
    for (let x = 0; x < size; x += 2) {
      const wave = Math.sin(x * 0.045) * 0.5 + Math.cos(x * 0.13) * 0.5;
      const alpha = 0.06 + Math.abs(wave) * 0.13;
      ctx.fillStyle = `rgba(${gr}, ${gg}, ${gb}, ${alpha.toFixed(3)})`;
      ctx.fillRect(x, 0, 1 + (x % 3 === 0 ? 1 : 0), size);

      const bumpShade = Math.round(126 + wave * 14);
      bCtx.fillStyle = `rgb(${bumpShade},${bumpShade},${bumpShade})`;
      bCtx.fillRect(x, 0, 2, size);
    }

    // Organic fine wood pores along vertical grain (albedo + recessed pore bump + matte pore roughness)
    ctx.lineWidth = 1.15;
    bCtx.lineWidth = 1.25;
    rCtx.lineWidth = 1.3;
    for (let i = 0; i < 72; i++) {
      const baseX = ((i * 79) % 500) + 6;
      const tone = 0.16 + (i % 4) * 0.04;
      ctx.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${tone.toFixed(2)})`;
      bCtx.strokeStyle = 'rgba(72, 72, 72, 0.45)';
      rCtx.strokeStyle = 'rgba(218, 218, 218, 0.42)';

      const drawPath = (targetCtx: CanvasRenderingContext2D) => {
        targetCtx.beginPath();
        targetCtx.moveTo(baseX, 0);
        for (let y = 0; y <= size; y += 32) {
          const offset = Math.sin(y * 0.018 + i) * 7 + Math.cos(y * 0.05 + i * 2) * 2.5;
          targetCtx.lineTo(baseX + offset, y);
        }
        targetCtx.stroke();
      };

      drawPath(ctx);
      drawPath(bCtx);
      drawPath(rCtx);
    }

    // Subtle natural knots for natural oak / hickory decors
    if (
      decor.code.includes('H1180') ||
      decor.code.includes('H3730') ||
      decor.code.includes('H3331') ||
      decor.code.includes('K003')
    ) {
      for (let k = 0; k < 4; k++) {
        const kx = 90 + ((k * 137) % 340);
        const ky = 85 + ((k * 163) % 340);
        const grad = ctx.createRadialGradient(kx, ky, 1, kx, ky, 15);
        grad.addColorStop(
          0,
          `rgba(${Math.max(0, gr - 38)}, ${Math.max(0, gg - 32)}, ${Math.max(0, gb - 26)}, 0.52)`,
        );
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 10, 18, 0.1, 0, Math.PI * 2);
        ctx.fill();

        bCtx.fillStyle = 'rgba(65, 65, 65, 0.35)';
        bCtx.beginPath();
        bCtx.ellipse(kx, ky, 7, 13, 0.1, 0, Math.PI * 2);
        bCtx.fill();
      }
    }
  } else if (decor.category === 'stone') {
    // Mineral concrete / stone / marble aggregate speckles & micro-pits
    for (let i = 0; i < 2800; i++) {
      const sx = (i * 197) % size;
      const sy = (i * 313) % size;
      const pSize = (i % 4) + 1;
      const light = i % 3 === 0;
      ctx.fillStyle = light
        ? 'rgba(255, 255, 255, 0.065)'
        : `rgba(${Math.max(0, gr - 22)}, ${Math.max(0, gg - 22)}, ${Math.max(0, gb - 22)}, 0.14)`;
      ctx.fillRect(sx, sy, pSize, pSize);

      bCtx.fillStyle = light ? 'rgba(155, 155, 155, 0.22)' : 'rgba(95, 95, 95, 0.26)';
      bCtx.fillRect(sx, sy, pSize, pSize);

      rCtx.fillStyle = light ? 'rgba(115, 115, 115, 0.22)' : 'rgba(185, 185, 185, 0.22)';
      rCtx.fillRect(sx, sy, pSize, pSize);
    }
    // Delicate natural stone / marble veining
    ctx.lineWidth = 1.6;
    for (let v = 0; v < 9; v++) {
      ctx.strokeStyle =
        v % 2 === 0 ? 'rgba(255, 255, 255, 0.075)' : `rgba(${gr}, ${gg}, ${gb}, 0.12)`;
      ctx.beginPath();
      ctx.moveTo(0, (v * 67) % size);
      ctx.bezierCurveTo(
        170,
        ((v * 97) % 450) + 20,
        340,
        ((v * 53) % 450) + 30,
        size,
        (v * 111) % size,
      );
      ctx.stroke();
    }
  } else {
    // Architectural velvet matte or acrylic lacquer micro-grain
    for (let i = 0; i < 1200; i++) {
      const sx = (i * 149) % size;
      const sy = (i * 271) % size;
      ctx.fillStyle =
        i % 2 === 0
          ? `rgba(${Math.min(255, r + 6)}, ${Math.min(255, g + 6)}, ${Math.min(255, b + 6)}, 0.028)`
          : `rgba(${Math.max(0, r - 6)}, ${Math.max(0, g - 6)}, ${Math.max(0, b - 6)}, 0.028)`;
      ctx.fillRect(sx, sy, 2, 2);
      if (!isGloss) {
        bCtx.fillStyle = i % 2 === 0 ? 'rgba(142,142,142,0.18)' : 'rgba(114,114,114,0.18)';
        bCtx.fillRect(sx, sy, 2, 2);
      }
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = Math.max(1, maxAnisotropy);
  map.needsUpdate = true;

  if (isGloss) {
    return { map };
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = Math.max(1, maxAnisotropy);
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = Math.max(1, maxAnisotropy);
  roughnessMap.needsUpdate = true;

  return { map, bumpMap, roughnessMap };
}

export function getDecorMaterial(
  decor: BoardDecor,
  maxAnisotropy: number,
): THREE.MeshPhysicalMaterial {
  const key = `${decor.id}_${decor.colorHex}_${decor.category}_${decor.roughness}_pbr2`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const { map, bumpMap, roughnessMap } = createProceduralDecorMaps(decor, maxAnisotropy);
  const isGloss = decor.category === 'gloss';
  const isWood = decor.category === 'wood';
  const isStone = decor.category === 'stone';
  const isMdf = decor.materialType === 'MDF';

  const mat = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bumpMap || null,
    bumpScale: isWood ? 0.0024 : isStone ? 0.0018 : 0.0005,
    roughnessMap: roughnessMap || null,
    color: 0xffffff,
    roughness: isGloss
      ? 0.075
      : isStone
        ? Math.max(0.36, Math.min(0.62, decor.roughness ?? 0.5))
        : isWood
          ? Math.max(0.42, Math.min(0.72, decor.roughness ?? 0.56))
          : Math.max(0.55, Math.min(0.86, decor.roughness ?? 0.72)),
    metalness: isStone ? 0.04 : 0.02,
    clearcoat: isGloss ? 1.0 : isStone ? 0.22 : isMdf ? 0.14 : isWood ? 0.08 : 0.04,
    clearcoatRoughness: isGloss ? 0.045 : isStone ? 0.28 : 0.42,
    sheen: !isGloss && !isStone ? 0.16 : 0,
    sheenRoughness: 0.65,
    ior: 1.5,
    envMapIntensity: isGloss ? 1.38 : isStone ? 0.95 : 0.85,
  });

  materialCache.set(key, mat);
  return mat;
}

export function disposeDecorMaterials(): void {
  materialCache.forEach((mat) => {
    mat.map?.dispose();
    mat.bumpMap?.dispose();
    mat.roughnessMap?.dispose();
    mat.dispose();
  });
  materialCache.clear();
}
