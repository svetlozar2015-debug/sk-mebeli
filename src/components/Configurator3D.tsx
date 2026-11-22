import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DoorOpen, Maximize2, Minimize2 } from 'lucide-react';
import {
  BoardDecor,
  ColumnConfig,
  DrawerSlideType,
  FurnitureConfig,
  Language,
} from '../types/furniture';
import {
  columnHasVitrine,
  computeSlotClearancesCm,
  getDrawerCount,
  isDrawerSlotType,
  resolveDrawerSlideLengthMm,
  upperBayHasVitrine,
  VITRINE_DEPTH_DEDUCTION_MM,
  VITRINE_PROFILE_THICKNESS_MM,
} from '../lib/carpentryEngine';
import { disposeDecorMaterials, getDecorMaterial } from '../lib/textures';
import { t } from '../lib/i18n';

export type CameraPreset =
  | 'iso'
  | 'iso_sw'
  | 'iso_se'
  | 'iso_ne'
  | 'iso_nw'
  | 'front'
  | 'back'
  | 'top'
  | 'bottom'
  | 'side_left'
  | 'side_right';

export interface MeasureReadout {
  hasFirstPoint: boolean;
  hasSecondPoint: boolean;
  distanceMm: number;
  distanceCm: number;
  dxMm: number;
  dyMm: number;
  dzMm: number;
}

interface Configurator3DProps {
  lang: Language;
  config: FurnitureConfig;
  decors: BoardDecor[];
  selectedColumnId: string | null;
  onSelectColumn: (colId: string, slotIdx?: number) => void;
  isolatedMode: boolean;
  onToggleIsolate: () => void;
  allOpen: boolean;
  onToggleAllOpen?: () => void;
  seeInside: boolean;
  lightingMode: 'day' | 'evening';
  cameraPresetTrigger: { preset: CameraPreset; seq: number } | null;
  onSelectCameraPreset?: (preset: CameraPreset) => void;
  isFullPage?: boolean;
  onToggleFullPage?: () => void;
  showDimensions: boolean;
  onToggleDimensions: () => void;
  measureMode: boolean;
  onToggleMeasureMode: () => void;
  centerTriggerSeq?: number;
  clearMeasureTriggerSeq?: number;
  panMode?: boolean;
  panNudgeTrigger?: { dx: number; dy?: number; seq: number } | null;
  swapModeActive?: boolean;
  onMeasureReadoutChange?: (readout: MeasureReadout | null) => void;
  selectedColumnLabel?: string;
  canDeleteSelected?: boolean;
  onDeleteSelected?: () => void;
}

interface AnimatedJoint {
  id: string;
  kind: 'door_left' | 'door_right' | 'flap_up' | 'drawer' | 'slide_left' | 'slide_right';
  pivot: THREE.Object3D;
  targetOpen: number;
  currentOpen: number;
  maxTravel: number; // angle (rad) for doors, meters for drawers/sliding doors
}

const BOARD_T = 0.018; // 18 mm standard MFC/MDF
const VITRINE_T = VITRINE_PROFILE_THICKNESS_MM / 1000; // 20 mm S02 aluminum profile
const VITRINE_DEDUCT = VITRINE_DEPTH_DEDUCTION_MM / 1000; // 2 mm carcass depth deduction vs 18 mm board
const HDF_T = 0.004; // 4 mm HDF back
const FILLER_W = 0.06; // 6 cm L-corner filler
const _boxTmp = new THREE.Box3();
const _objBoxTmp = new THREE.Box3();
const _centerTmp = new THREE.Vector3();
const _sizeTmp = new THREE.Vector3();
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeHitTmp = new THREE.Vector3();

export const Configurator3D: React.FC<Configurator3DProps> = ({
  lang,
  config,
  decors,
  selectedColumnId,
  onSelectColumn,
  isolatedMode,
  onToggleIsolate,
  allOpen,
  onToggleAllOpen,
  seeInside,
  lightingMode,
  cameraPresetTrigger,
  onSelectCameraPreset,
  isFullPage = false,
  onToggleFullPage,
  showDimensions,
  onToggleDimensions,
  measureMode,
  onToggleMeasureMode,
  centerTriggerSeq = 0,
  clearMeasureTriggerSeq = 0,
  panMode = false,
  panNudgeTrigger = null,
  swapModeActive = false,
  onMeasureReadoutChange,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [measureReadout, setMeasureReadout] = React.useState<MeasureReadout | null>(null);
  const onMeasureReadoutRef = useRef(onMeasureReadoutChange);
  onMeasureReadoutRef.current = onMeasureReadoutChange;

  // Mutable refs so React UI updates never tear down WebGLRenderer
  const configRef = useRef(config);
  const decorsRef = useRef(decors);
  const selectedColRef = useRef(selectedColumnId);
  const isolatedModeRef = useRef(isolatedMode);
  const seeInsideRef = useRef(seeInside);
  const showDimensionsRef = useRef(showDimensions);
  const measureModeRef = useRef(measureMode);
  const panModeRef = useRef(panMode);
  const swapModeActiveRef = useRef(swapModeActive);
  const onSelectColumnRef = useRef(onSelectColumn);
  const openMapRef = useRef<Map<string, boolean>>(new Map());
  const jointsRef = useRef<AnimatedJoint[]>([]);
  const cameraPresetFnRef = useRef<((preset: CameraPreset) => void) | null>(null);
  const centerCameraFnRef = useRef<(() => void) | null>(null);
  const panModeFnRef = useRef<((enabled: boolean) => void) | null>(null);
  const panNudgeFnRef = useRef<((dx: number, dy?: number) => void) | null>(null);
  const rebuildFnRef = useRef<(() => void) | null>(null);
  const rebuildDimensionsFnRef = useRef<(() => void) | null>(null);
  const clearMeasureFnRef = useRef<(() => void) | null>(null);
  const lightModeFnRef = useRef<((mode: 'day' | 'evening') => void) | null>(null);
  const requestRenderFnRef = useRef<(() => void) | null>(null);

  configRef.current = config;
  decorsRef.current = decors;
  selectedColRef.current = selectedColumnId;
  isolatedModeRef.current = isolatedMode;
  seeInsideRef.current = seeInside;
  showDimensionsRef.current = showDimensions;
  measureModeRef.current = measureMode;
  panModeRef.current = panMode;
  swapModeActiveRef.current = swapModeActive;
  onSelectColumnRef.current = onSelectColumn;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL once cleanly
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeae5dc);
    scene.fog = new THREE.FogExp2(0xeae5dc, 0.022);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 50);
    camera.position.set(2.3, 1.8, 3.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Studio environment reflection (gives wood satin, acrylic gloss, glass & aluminum realistic specular depth)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmrem.dispose();

    // Balanced 4-Light Architectural Showroom Rig (key, cool fill, sky/floor bounce, rear rim)
    const hemiLight = new THREE.HemisphereLight(0xfffdf8, 0xd0c4b4, 0.82);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.56);
    keyLight.position.set(3.8, 5.6, 4.6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = isSoftwareGl ? 1024 : 2048;
    keyLight.shadow.mapSize.height = isSoftwareGl ? 1024 : 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 16.0;
    keyLight.shadow.camera.left = -3.8;
    keyLight.shadow.camera.right = 3.8;
    keyLight.shadow.camera.top = 3.8;
    keyLight.shadow.camera.bottom = -3.8;
    keyLight.shadow.radius = 3.4;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.normalBias = 0.015;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe4eefa, 0.62);
    fillLight.position.set(-4.2, 2.8, 4.0);
    scene.add(fillLight);

    const backRimLight = new THREE.DirectionalLight(0xfff6ea, 0.36);
    backRimLight.position.set(0.4, 4.6, -3.8);
    scene.add(backRimLight);

    // Procedural Wide-Plank Oiled Oak Showroom Floor (Albedo + Roughness + Micro-Bevel Bump)
    const floorSize = 1024;
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = floorSize;
    floorCanvas.height = floorSize;
    const fCtx = floorCanvas.getContext('2d');

    const floorRoughCanvas = document.createElement('canvas');
    floorRoughCanvas.width = floorSize;
    floorRoughCanvas.height = floorSize;
    const frCtx = floorRoughCanvas.getContext('2d');

    const floorBumpCanvas = document.createElement('canvas');
    floorBumpCanvas.width = floorSize;
    floorBumpCanvas.height = floorSize;
    const fbCtx = floorBumpCanvas.getContext('2d');

    if (fCtx && frCtx && fbCtx) {
      fCtx.fillStyle = '#d7c9b6';
      fCtx.fillRect(0, 0, floorSize, floorSize);
      frCtx.fillStyle = 'rgb(122,122,122)';
      frCtx.fillRect(0, 0, floorSize, floorSize);
      fbCtx.fillStyle = 'rgb(134,134,134)';
      fbCtx.fillRect(0, 0, floorSize, floorSize);

      const plankRows = 8;
      const plankH = floorSize / plankRows;
      const tones = ['#dacdbb', '#d2c2ae', '#dfd3c3', '#cdbc9f', '#d6c7b3'];
      const roughBytes = [110, 124, 104, 130, 116];
      for (let r = 0; r < plankRows; r++) {
        const y = r * plankH;
        const offset = (r % 2) * 256;
        for (let c = -1; c < 3; c++) {
          const x = c * 512 + offset;
          const toneIdx = (r * 3 + c + 7) % tones.length;
          fCtx.fillStyle = tones[toneIdx];
          fCtx.fillRect(x, y, 512, plankH);

          const rb = roughBytes[toneIdx];
          frCtx.fillStyle = `rgb(${rb},${rb},${rb})`;
          frCtx.fillRect(x, y, 512, plankH);

          // Micro-beveled plank perimeter seams
          fCtx.strokeStyle = 'rgba(115, 96, 76, 0.22)';
          fCtx.lineWidth = 2;
          fCtx.strokeRect(x, y, 512, plankH);
          frCtx.strokeStyle = 'rgb(225,225,225)';
          frCtx.lineWidth = 3;
          frCtx.strokeRect(x, y, 512, plankH);
          fbCtx.strokeStyle = 'rgb(65,65,65)';
          fbCtx.lineWidth = 3;
          fbCtx.strokeRect(x, y, 512, plankH);

          // Soft natural wood grain lines along each plank
          fCtx.lineWidth = 1.2;
          for (let g = 1; g <= 7; g++) {
            const gy = y + (plankH * g) / 8;
            fCtx.strokeStyle = g % 2 === 0 ? 'rgba(145, 122, 98, 0.13)' : 'rgba(255, 250, 242, 0.08)';
            fCtx.beginPath();
            fCtx.moveTo(x + 8, gy);
            fCtx.bezierCurveTo(
              x + 170,
              gy + ((r + g) % 2 === 0 ? 3 : -3),
              x + 340,
              gy + ((r + g) % 3 === 0 ? -3 : 2),
              x + 504,
              gy,
            );
            fCtx.stroke();
          }
        }
      }
    }
    const maxFloorAniso = renderer.capabilities.getMaxAnisotropy();
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(5.5, 5.5);
    floorTex.anisotropy = maxFloorAniso;

    const floorRoughTex = new THREE.CanvasTexture(floorRoughCanvas);
    floorRoughTex.wrapS = THREE.RepeatWrapping;
    floorRoughTex.wrapT = THREE.RepeatWrapping;
    floorRoughTex.repeat.set(5.5, 5.5);
    floorRoughTex.anisotropy = maxFloorAniso;

    const floorBumpTex = new THREE.CanvasTexture(floorBumpCanvas);
    floorBumpTex.wrapS = THREE.RepeatWrapping;
    floorBumpTex.wrapT = THREE.RepeatWrapping;
    floorBumpTex.repeat.set(5.5, 5.5);
    floorBumpTex.anisotropy = maxFloorAniso;

    const floorGeo = new THREE.PlaneGeometry(18, 18);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughnessMap: floorRoughTex,
      bumpMap: floorBumpTex,
      bumpScale: 0.0018,
      roughness: 0.52,
      metalness: 0.03,
      envMapIntensity: 0.72,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    scene.add(floor);

    // Subtle procedural limewash/plaster texture for studio backdrop walls
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const wCtx = wallCanvas.getContext('2d');
    if (wCtx) {
      wCtx.fillStyle = '#ffffff';
      wCtx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 1600; i++) {
        const wx = (i * 193) % 512;
        const wy = (i * 307) % 512;
        wCtx.fillStyle = i % 2 === 0 ? 'rgba(220,214,205,0.08)' : 'rgba(255,255,255,0.08)';
        wCtx.fillRect(wx, wy, 3, 3);
      }
    }
    const wallTex = new THREE.CanvasTexture(wallCanvas);
    wallTex.colorSpace = THREE.SRGBColorSpace;
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(3, 2);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf4f0e8,
      map: wallTex,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.25,
    });
    const baseboardMat = new THREE.MeshStandardMaterial({
      color: 0xe3ddd1,
      roughness: 0.68,
      metalness: 0.04,
      envMapIntensity: 0.4,
    });

    // Procedural Soft Contact AO Shadow Texture (grounds furniture cleanly on floor)
    const aoCanvas = document.createElement('canvas');
    aoCanvas.width = 256;
    aoCanvas.height = 256;
    const aoCtx = aoCanvas.getContext('2d');
    if (aoCtx) {
      aoCtx.clearRect(0, 0, 256, 256);
      const grad = aoCtx.createRadialGradient(128, 128, 22, 128, 128, 126);
      grad.addColorStop(0, 'rgba(18, 14, 10, 0.36)');
      grad.addColorStop(0.55, 'rgba(18, 14, 10, 0.16)');
      grad.addColorStop(1, 'rgba(18, 14, 10, 0)');
      aoCtx.fillStyle = grad;
      aoCtx.fillRect(0, 0, 256, 256);
    }
    const aoShadowTex = new THREE.CanvasTexture(aoCanvas);
    aoShadowTex.colorSpace = THREE.SRGBColorSpace;
    const aoShadowMat = new THREE.MeshBasicMaterial({
      map: aoShadowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    // Procedural Ceramic Induction Cooktop Glass Graphics Texture
    const hobCanvas = document.createElement('canvas');
    hobCanvas.width = 512;
    hobCanvas.height = 384;
    const hCtx = hobCanvas.getContext('2d');
    if (hCtx) {
      hCtx.fillStyle = '#0d0f13';
      hCtx.fillRect(0, 0, 512, 384);
      const zones = [
        { x: 145, y: 120, r: 62 },
        { x: 365, y: 115, r: 72 },
        { x: 145, y: 268, r: 54 },
        { x: 365, y: 268, r: 58 },
      ];
      zones.forEach((z) => {
        hCtx.strokeStyle = 'rgba(190, 200, 215, 0.52)';
        hCtx.lineWidth = 3;
        hCtx.beginPath();
        hCtx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        hCtx.stroke();
        hCtx.strokeStyle = 'rgba(190, 200, 215, 0.24)';
        hCtx.lineWidth = 1.5;
        hCtx.beginPath();
        hCtx.arc(z.x, z.y, z.r * 0.55, 0, Math.PI * 2);
        hCtx.stroke();
        hCtx.beginPath();
        hCtx.moveTo(z.x - 10, z.y);
        hCtx.lineTo(z.x + 10, z.y);
        hCtx.moveTo(z.x, z.y - 10);
        hCtx.lineTo(z.x, z.y + 10);
        hCtx.stroke();
      });
      // Touch control strip graphic
      hCtx.fillStyle = 'rgba(235, 70, 55, 0.85)';
      hCtx.fillRect(228, 344, 56, 5);
    }
    const hobZoneTex = new THREE.CanvasTexture(hobCanvas);
    hobZoneTex.colorSpace = THREE.SRGBColorSpace;
    hobZoneTex.anisotropy = maxFloorAniso;
    const hobTopMat = new THREE.MeshPhysicalMaterial({
      map: hobZoneTex,
      roughness: 0.06,
      metalness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.35,
    });

    const roomRoot = new THREE.Group();
    scene.add(roomRoot);

    const furnitureRoot = new THREE.Group();
    scene.add(furnitureRoot);

    const dimensionsRoot = new THREE.Group();
    scene.add(dimensionsRoot);

    const measureRoot = new THREE.Group();
    scene.add(measureRoot);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.panSpeed = 1.1;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.45;
    controls.maxDistance = 12.0;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI - 0.01;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controls.target.set(0, 0.85, 0);

    panModeFnRef.current = (enabled: boolean) => {
      controls.mouseButtons.LEFT = enabled ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.touches.ONE = enabled ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    };
    panModeFnRef.current(panModeRef.current);

    // Shared reusable metallic, glass, shadow-gap & appliance materials
    const metalHandleMat = new THREE.MeshStandardMaterial({
      color: 0x202227,
      roughness: 0.28,
      metalness: 0.88,
      envMapIntensity: 1.3,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd9dce2,
      roughness: 0.18,
      metalness: 0.94,
      envMapIntensity: 1.45,
    });
    const runnerSteelMat = new THREE.MeshStandardMaterial({
      color: 0x8f929b,
      roughness: 0.28,
      metalness: 0.86,
    });
    const golaProfileMat = new THREE.MeshStandardMaterial({
      color: 0x2a2d34,
      roughness: 0.3,
      metalness: 0.85,
      envMapIntensity: 1.25,
    });
    const blumAccentMat = new THREE.MeshStandardMaterial({
      color: 0xe06c1f,
      roughness: 0.42,
      metalness: 0.15,
    });
    const selectionAccentMat = new THREE.MeshBasicMaterial({
      color: 0xd49b62,
    });
    const hdfMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3cd,
      roughness: 0.85,
      metalness: 0.0,
    });
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x191a1e,
      roughness: 0.74,
      metalness: 0.08,
    });
    const shadowGapMat = new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.92,
      metalness: 0.05,
    });
    const sinkBowlMat = new THREE.MeshStandardMaterial({
      color: 0x1e2126,
      roughness: 0.36,
      metalness: 0.65,
      envMapIntensity: 1.1,
    });
    const ovenGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0e1014,
      roughness: 0.05,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.5,
    });
    const applianceWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf1f2f4,
      roughness: 0.26,
      metalness: 0.08,
      envMapIntensity: 0.9,
    });
    const ledEmissiveMat = new THREE.MeshStandardMaterial({
      color: 0xfff7e2,
      emissive: 0xffd27d,
      emissiveIntensity: 1.45,
      roughness: 0.2,
    });
    const emberLedMat = new THREE.MeshStandardMaterial({
      color: 0xffb38a,
      emissive: 0xff6e38,
      emissiveIntensity: 1.2,
      roughness: 0.25,
    });
    const vitrineGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b4554, // Smoked dark-grey architectural 4 mm glass with rich surface reflection
      roughness: 0.04,
      metalness: 0.08,
      transparent: true,
      opacity: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.96,
      ior: 1.52,
      envMapIntensity: 1.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const vitrineFrameMat = new THREE.MeshPhysicalMaterial({
      color: 0x1c2028, // S02 brushed matte-black anodized aluminum profile (20 mm)
      roughness: 0.28,
      metalness: 0.88,
      clearcoat: 0.3,
      clearcoatRoughness: 0.24,
      envMapIntensity: 1.45,
    });
    const aluFrameMat = new THREE.MeshStandardMaterial({
      color: 0x262930,
      roughness: 0.26,
      metalness: 0.9,
      envMapIntensity: 1.35,
    });
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: 0xdbe6ee,
      roughness: 0.04,
      metalness: 0.97,
      envMapIntensity: 1.5,
    });
    const cushionMat = new THREE.MeshStandardMaterial({
      color: 0x87857f,
      roughness: 0.92,
      metalness: 0.02,
    });
    let xrayFrontMat: THREE.MeshStandardMaterial | null = null;
    const xrayExtraMats: THREE.MeshStandardMaterial[] = [];

    const clickableMeshes: THREE.Object3D[] = [];
    const measureTargets: THREE.Object3D[] = [];
    let measurePoints: THREE.Vector3[] = [];
    let hoverMeasurePoint: THREE.Vector3 | null = null;
    let cameraGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

    const disposeGroup = (group: THREE.Group) => {
      while (group.children.length > 0) {
        const child = group.children.pop()!;
        child.traverse((obj) => {
          const anyObj = obj as unknown as {
            geometry?: THREE.BufferGeometry;
            material?: THREE.Material | THREE.Material[];
          };
          if (anyObj.geometry) {
            anyObj.geometry.dispose();
          }
          if (anyObj.material) {
            const mats = Array.isArray(anyObj.material) ? anyObj.material : [anyObj.material];
            mats.forEach((m) => {
              const map = (m as THREE.SpriteMaterial | THREE.MeshBasicMaterial).map;
              if (map) map.dispose();
              m.dispose();
            });
          }
        });
      }
    };

    // On-demand + animation loop coalescer
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        let needsAnotherFrame = false;

        // Smoothly damp all door/drawer joints
        for (const joint of jointsRef.current) {
          const diff = Math.abs(joint.targetOpen - joint.currentOpen);
          if (diff > 0.002) {
            joint.currentOpen = THREE.MathUtils.damp(joint.currentOpen, joint.targetOpen, 6.5, dt);
            needsAnotherFrame = true;
          } else {
            joint.currentOpen = joint.targetOpen;
          }

          if (joint.kind === 'door_left') {
            joint.pivot.rotation.y = -joint.currentOpen * joint.maxTravel;
          } else if (joint.kind === 'door_right') {
            joint.pivot.rotation.y = joint.currentOpen * joint.maxTravel;
          } else if (joint.kind === 'flap_up') {
            joint.pivot.rotation.x = -joint.currentOpen * joint.maxTravel;
          } else if (joint.kind === 'drawer') {
            joint.pivot.position.z = joint.currentOpen * joint.maxTravel;
          } else if (joint.kind === 'slide_left') {
            joint.pivot.position.x = joint.currentOpen * joint.maxTravel;
          } else if (joint.kind === 'slide_right') {
            joint.pivot.position.x = -joint.currentOpen * joint.maxTravel;
          }
        }

        // Smoothly glide camera preset
        if (cameraGoal) {
          camera.position.lerp(cameraGoal.pos, 1 - Math.exp(-5.5 * dt));
          controls.target.lerp(cameraGoal.target, 1 - Math.exp(-5.5 * dt));
          if (
            camera.position.distanceTo(cameraGoal.pos) < 0.015 &&
            controls.target.distanceTo(cameraGoal.target) < 0.015
          ) {
            cameraGoal = null;
          } else {
            needsAnotherFrame = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsAnotherFrame) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderFnRef.current = requestRender;

    controls.addEventListener('start', () => {
      cameraGoal = null;
    });
    controls.addEventListener('change', () => {
      requestRender();
    });

    lightModeFnRef.current = (mode: 'day' | 'evening') => {
      if (mode === 'day') {
        scene.background = new THREE.Color(0xeae5dc);
        (scene.fog as THREE.FogExp2).color.setHex(0xeae5dc);
        wallMat.color.setHex(0xf4f0e8);
        baseboardMat.color.setHex(0xe3ddd1);
        keyLight.color.setHex(0xfff5e6);
        keyLight.intensity = 1.56;
        fillLight.intensity = 0.62;
        backRimLight.intensity = 0.36;
        hemiLight.intensity = 0.82;
        ledEmissiveMat.emissiveIntensity = 1.4;
      } else {
        scene.background = new THREE.Color(0x1f2026);
        (scene.fog as THREE.FogExp2).color.setHex(0x1f2026);
        wallMat.color.setHex(0x35343a);
        baseboardMat.color.setHex(0x28272c);
        keyLight.color.setHex(0xffd2a1);
        keyLight.intensity = 1.22;
        fillLight.intensity = 0.38;
        backRimLight.intensity = 0.44;
        hemiLight.intensity = 0.44;
        ledEmissiveMat.emissiveIntensity = 2.65;
      }
      requestRender();
    };

    const addBox = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      castShadow = true,
    ) => {
      const geo = new THREE.BoxGeometry(Math.max(0.004, w), Math.max(0.004, h), Math.max(0.004, d));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const addBeveledPanel = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      bevelMm = 1.3,
      castShadow = true,
    ) => {
      const safeW = Math.max(0.012, w);
      const safeH = Math.max(0.012, h);
      const safeD = Math.max(0.006, d);
      const b = Math.min(bevelMm / 1000, safeW * 0.14, safeH * 0.14, safeD * 0.32);
      const innerW = safeW - b * 2;
      const innerH = safeH - b * 2;
      const innerD = Math.max(0.001, safeD - b * 2);

      const shape = new THREE.Shape();
      shape.moveTo(-innerW / 2, -innerH / 2);
      shape.lineTo(innerW / 2, -innerH / 2);
      shape.lineTo(innerW / 2, innerH / 2);
      shape.lineTo(-innerW / 2, innerH / 2);
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: innerD,
        bevelEnabled: true,
        bevelThickness: b,
        bevelSize: b,
        bevelSegments: 2,
      });
      geo.translate(0, 0, -innerD / 2);

      // Normalize meter-based Extrude UVs so procedural wood/stone maps tile consistently without stretching
      const uv = geo.attributes.uv;
      if (uv) {
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * 1.4 + 0.5, uv.getY(i) * 1.4 + 0.5);
        }
        uv.needsUpdate = true;
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const addCooktopDetail = (
      parent: THREE.Object3D,
      w: number,
      d: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const cw = Math.min(0.6, Math.max(0.32, w));
      const cd = Math.min(0.51, Math.max(0.32, d));
      // Brushed metallic outer frame bezel
      addBox(parent, cw + 0.008, 0.005, cd + 0.008, x, y - 0.001, z, aluFrameMat, false);
      // Gloss ceramic top slab with induction burner ring markings
      addBox(parent, cw, 0.007, cd, x, y + 0.001, z, hobTopMat, false);
    };

    const buildRun = (
      parentGroup: THREE.Group,
      cols: ColumnConfig[],
      totalH: number,
      depth: number,
      plinthH: number,
      counterT: number,
      carcassMat: THREE.Material,
      frontMat: THREE.Material,
      counterMat: THREE.Material,
      isKitchen: boolean,
      isUpper: boolean,
      baseYOffset: number,
      idPrefix: string,
      resolveDecorMat?: (decorId: string, isFront?: boolean) => THREE.Material,
    ) => {
      const totalW = cols.reduce((s, c) => s + c.widthCm / 100, 0);

      // Upper Cabinet Full-Width Inlaid LED (Single/Double) or Recessed Bottom Grip Profile
      const upperProfileStyle = configRef.current.upperProfileStyle || 'none';
      if (isUpper && upperProfileStyle !== 'none') {
        const channelZ = depth / 2 - 0.042;
        if (upperProfileStyle === 'recessed_bottom') {
          addBox(parentGroup, totalW - 0.004, 0.014, 0.026, totalW / 2, baseYOffset + 0.005, channelZ + 0.01, golaProfileMat, false);
        } else if (upperProfileStyle === 'led_single') {
          addBox(parentGroup, totalW - 0.004, 0.01, 0.022, totalW / 2, baseYOffset + 0.002, channelZ, golaProfileMat, false);
          addBox(parentGroup, totalW - 0.012, 0.005, 0.012, totalW / 2, baseYOffset - 0.001, channelZ, ledEmissiveMat, false);
        } else if (upperProfileStyle === 'led_double') {
          addBox(parentGroup, totalW - 0.004, 0.011, 0.046, totalW / 2, baseYOffset + 0.002, channelZ - 0.01, golaProfileMat, false);
          addBox(parentGroup, totalW - 0.012, 0.005, 0.011, totalW / 2, baseYOffset - 0.001, channelZ + 0.003, ledEmissiveMat, false);
          addBox(parentGroup, totalW - 0.012, 0.005, 0.011, totalW / 2, baseYOffset - 0.001, channelZ - 0.023, ledEmissiveMat, false);
        }
      }

      // Per-bay carcass plates, plinth, back panel, countertop segments (skipping tall columns > 1.3m), and slots
      let cursorX = 0;
      cols.forEach((col) => {
        const bayStartChildIdx = parentGroup.children.length;
        const colW = col.widthCm / 100;
        const colCarcassMat =
          col.carcassDecorId && resolveDecorMat
            ? resolveDecorMat(col.carcassDecorId, false)
            : carcassMat;
        const colFrontMat =
          col.frontDecorId && resolveDecorMat
            ? resolveDecorMat(col.frontDecorId, true)
            : frontMat;
        const colTotalH = isUpper
          ? totalH
          : col.heightCm
            ? Math.max(0.32, col.heightCm / 100)
            : totalH;
        const colPlinthH = isUpper || col.isSuspended ? 0 : plinthH;
        const colBaseY = baseYOffset + (!isUpper && col.isSuspended ? (col.elevationCm ?? 28) / 100 : 0);
        const colBoxH = Math.max(0.24, colTotalH - colPlinthH);
        const colBoxCenterY = colBaseY + colPlinthH + colBoxH / 2;
        const innerH = colBoxH - BOARD_T * 2;
        const isCoatPanelOnly = col.slots.length === 1 && col.slots[0].type === 'coat_panel';

        const baseBayDepth =
          !isUpper && typeof col.depthCm === 'number' && Number.isFinite(col.depthCm)
            ? Math.max(0.2, Math.min(0.85, col.depthCm / 100))
            : depth;
        const bayHasVitrine = isUpper ? upperBayHasVitrine(col) : columnHasVitrine(col);
        const bayDepth = bayHasVitrine
          ? Math.max(0.18, baseBayDepth - VITRINE_DEDUCT)
          : baseBayDepth;
        // Keeps rear wall & HDF back flush at z = -depth/2 even when bay depth or vitrine -2mm differs
        const boxCenterZ = -depth / 2 + bayDepth / 2;
        const bayFrontZ = -depth / 2 + baseBayDepth + BOARD_T / 2 + 0.002;
        const bayVitrineZ = -depth / 2 + baseBayDepth + VITRINE_T / 2;

        // Plinth recessed under bay
        if (!isUpper && colPlinthH > 0.005) {
          addBox(
            parentGroup,
            colW - 0.006,
            colPlinthH,
            bayDepth - 0.05,
            cursorX + colW / 2,
            colBaseY + colPlinthH / 2,
            boxCenterZ - 0.025,
            isKitchen ? plinthMat : colCarcassMat,
          );
        }

        // Warm under-glow LED strip underneath suspended consoles
        if (!isUpper && col.isSuspended && col.hasUnderLed) {
          addBox(
            parentGroup,
            colW - 0.04,
            0.006,
            0.018,
            cursorX + colW / 2,
            colBaseY - 0.004,
            -depth / 2 + 0.05,
            ledEmissiveMat,
            false,
          );
        }

        if (!isCoatPanelOnly) {
          // Bottom & Top plates for this bay
          addBox(parentGroup, colW, BOARD_T, bayDepth, cursorX + colW / 2, colBaseY + colPlinthH + BOARD_T / 2, boxCenterZ, colCarcassMat);
          addBox(
            parentGroup,
            colW,
            BOARD_T,
            bayDepth,
            cursorX + colW / 2,
            colBaseY + colPlinthH + colBoxH - BOARD_T / 2,
            boxCenterZ,
            colCarcassMat,
          );

          // 4mm HDF back panel for this bay
          addBox(
            parentGroup,
            colW - 0.008,
            colBoxH - 0.008,
            HDF_T,
            cursorX + colW / 2,
            colBoxCenterY,
            -depth / 2 + HDF_T / 2,
            colCarcassMat,
            false,
          );

          // Left & Right side walls for bay
          addBox(
            parentGroup,
            BOARD_T,
            innerH,
            bayDepth,
            cursorX + BOARD_T / 2,
            colBoxCenterY,
            boxCenterZ,
            colCarcassMat,
          );
          addBox(
            parentGroup,
            BOARD_T,
            innerH,
            bayDepth,
            cursorX + colW - BOARD_T / 2,
            colBoxCenterY,
            boxCenterZ,
            colCarcassMat,
          );
        }

        // Kitchen Countertop segment ONLY over low base cabinets (skip tall towers > 1.3 m)
        if (isKitchen && !isUpper && colTotalH <= 1.3) {
          const ctDepth = baseBayDepth + 0.024;
          const ctCenterZ = -depth / 2 + ctDepth / 2;
          addBeveledPanel(
            parentGroup,
            colW + 0.002,
            counterT,
            ctDepth,
            cursorX + colW / 2,
            colBaseY + colTotalH + counterT / 2,
            ctCenterZ,
            counterMat,
            1.6,
          );
          // Subtle under-countertop overhang shadow reveal between doors & worktop
          addBox(
            parentGroup,
            colW - 0.004,
            0.005,
            0.016,
            cursorX + colW / 2,
            colBaseY + colTotalH - 0.0025,
            bayFrontZ - BOARD_T / 2 + 0.004,
            shadowGapMat,
            false,
          );
          addBox(
            parentGroup,
            colW + 0.002,
            0.018,
            0.02,
            cursorX + colW / 2,
            colBaseY + colTotalH + counterT + 0.009,
            -depth / 2 + 0.012,
            aluFrameMat,
            false,
          );
        }

        const ratioSum = col.slots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;
        let cursorTopY = colBaseY + colPlinthH + colBoxH - BOARD_T;

        col.slots.forEach((slot, slotIdx) => {
          const slotH = innerH * (Math.max(0.1, slot.heightRatio) / ratioSum);
          const slotCenterY = cursorTopY - slotH / 2;
          const slotBottomY = cursorTopY - slotH;

          // Internal shelves positioned accurately by clear space (cm)
          const shelves = slot.internalShelves || 0;
          let railY = cursorTopY - 0.14;
          if (shelves > 0) {
            const clearancesCm = computeSlotClearancesCm(
              slotH * 100,
              shelves,
              slot.shelfClearancesCm,
            );
            let cursorY = slotBottomY;
            let tallestSpan = 0;
            let tallestTopY = cursorTopY;
            for (let s = 0; s < shelves; s++) {
              const spanM = (clearancesCm[s] ?? (slotH * 100) / (shelves + 1)) / 100;
              if (spanM > tallestSpan) {
                tallestSpan = spanM;
                tallestTopY = cursorY + spanM;
              }
              cursorY += spanM;
              const sy = Math.min(cursorTopY - BOARD_T, cursorY + BOARD_T / 2);
              addBox(
                parentGroup,
                colW - BOARD_T * 2,
                BOARD_T,
                bayDepth - 0.035,
                cursorX + colW / 2,
                sy,
                boxCenterZ - 0.01,
                colCarcassMat,
              );
              cursorY += BOARD_T;
            }
            const topCompartmentM = Math.max(0, cursorTopY - cursorY);
            if (topCompartmentM > tallestSpan) {
              tallestTopY = cursorTopY;
            }
            railY = tallestTopY - 0.1;
          }

          // Wardrobe / Hallway closet hanging rail if tall door & clothes rail enabled
          if (
            (configRef.current.category === 'wardrobe' ||
              configRef.current.category === 'hallway') &&
            configRef.current.includeClothesRails !== false &&
            slotH > 1.2 &&
            shelves <= 2 &&
            slot.type !== 'double_hanging_rod' &&
            slot.type !== 'trouser_rack'
          ) {
            const railGeo = new THREE.CylinderGeometry(0.012, 0.012, colW - BOARD_T * 2 - 0.02, 14);
            const rail = new THREE.Mesh(railGeo, chromeMat);
            rail.rotation.z = Math.PI / 2;
            rail.position.set(cursorX + colW / 2, railY, 0);
            parentGroup.add(rail);
          }

          const frontZ = bayFrontZ;
          const gap = 0.004;
          const isGola = !isUpper && configRef.current.handleStyle === 'gola_profile';
          const golaGap = 0.03; // 3 cm finger grip space

          const renderGolaLProfile = (topEdgeY: number) => {
            const profX = cursorX + colW / 2;
            const profZ = frontZ - BOARD_T / 2 - 0.02;
            // 5 cm L-profile back leg (3 cm exposed at top + 2 cm overlapped by door/drawer top)
            addBox(parentGroup, colW - 0.002, 0.05, 0.004, profX, topEdgeY - 0.025, profZ, golaProfileMat, false);
            // Top horizontal return flange
            addBox(parentGroup, colW - 0.002, 0.004, 0.022, profX, topEdgeY - 0.002, profZ + 0.011, golaProfileMat, false);
          };

          const renderGolaCProfile = (gapCenterY: number) => {
            const profX = cursorX + colW / 2;
            const profZ = frontZ - BOARD_T / 2 - 0.02;
            // 7 cm C-profile back web (2 cm behind upper front + 3 cm exposed + 2 cm behind lower front)
            addBox(parentGroup, colW - 0.002, 0.07, 0.004, profX, gapCenterY, profZ, golaProfileMat, false);
            // Upper & lower C-channel grip flanges framing the 3 cm opening
            addBox(parentGroup, colW - 0.002, 0.004, 0.022, profX, gapCenterY + 0.015, profZ + 0.011, golaProfileMat, false);
            addBox(parentGroup, colW - 0.002, 0.004, 0.022, profX, gapCenterY - 0.015, profZ + 0.011, golaProfileMat, false);
          };

          const registerInteractive = (mesh: THREE.Object3D, jointId: string) => {
            mesh.userData = { jointId, colId: col.id, slotIdx };
            clickableMeshes.push(mesh);
          };

          const addHandle = (
            target: THREE.Object3D,
            hx: number,
            hy: number,
            hz: number,
            vertical: boolean,
          ) => {
            if (slot.hideHandles) return;
            const style = configRef.current.handleStyle;
            const upperUsesProfile =
              isUpper &&
              configRef.current.upperProfileStyle &&
              configRef.current.upperProfileStyle !== 'none';
            if (style === 'push_to_open' || (!isUpper && style === 'gola_profile') || upperUsesProfile) {
              return;
            }
            if (style === 'knob') {
              const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.022, 16), metalHandleMat);
              knob.rotation.x = Math.PI / 2;
              knob.position.set(hx, hy, hz + 0.012);
              target.add(knob);
            } else if (style === 'profile_j') {
              if (vertical && slotH > 1.2) {
                addBox(target, 0.016, Math.min(0.45, slotH * 0.22), 0.014, hx, hy, hz + 0.002, colCarcassMat, false);
              } else {
                addBox(target, colW - 0.02, 0.018, 0.018, hx, hy, hz + 0.004, chromeMat, false);
              }
            } else {
              addBox(
                target,
                vertical ? 0.013 : Math.min(0.18, colW * 0.42),
                vertical ? (slotH > 1.5 ? Math.min(0.42, slotH * 0.22) : Math.min(0.22, slotH * 0.32)) : 0.012,
                0.022,
                hx,
                hy,
                hz + 0.012,
                metalHandleMat,
                false,
              );
            }
          };

          const makeDoorLeaf = (
            leafId: string,
            hingeSide: 'left' | 'right',
            leafW: number,
            leafOriginX: number,
            isGlass = false,
            isMirror = false,
          ) => {
            const doorH = isGola ? Math.max(0.18, slotH - golaGap - gap) : slotH - gap;
            const doorCenterY = isGola ? slotCenterY - golaGap / 2 : slotCenterY;
            const leafDepthT = isGlass ? VITRINE_T : BOARD_T;
            // Vitrine (20 mm) sits over -2 mm reduced carcass so its outer front surface aligns flush with 18 mm neighbor fronts
            const leafZ = isGlass ? bayVitrineZ : frontZ;
            const pivot = new THREE.Group();
            const hingeX = hingeSide === 'left' ? leafOriginX : leafOriginX + leafW;
            pivot.position.set(hingeX, doorCenterY, leafZ);
            parentGroup.add(pivot);

            const localCenterX = hingeSide === 'left' ? leafW / 2 : -leafW / 2;
            if (isGlass || isMirror) {
              const outerW = leafW - gap;
              const frameW = isMirror ? 0.022 : 0.022;
              const frameMat = isMirror ? aluFrameMat : vitrineFrameMat;
              const innerW = Math.max(0.06, outerW - frameW * 2);
              const innerH = Math.max(0.08, doorH - frameW * 2);
              // S02 20 mm brushed dark aluminum perimeter frame with beveled outer catchlights
              const stileL = addBeveledPanel(pivot, frameW, doorH, leafDepthT, localCenterX - outerW / 2 + frameW / 2, 0, 0, frameMat, 1.0);
              const stileR = addBeveledPanel(pivot, frameW, doorH, leafDepthT, localCenterX + outerW / 2 - frameW / 2, 0, 0, frameMat, 1.0);
              const railT = addBeveledPanel(pivot, innerW, frameW, leafDepthT, localCenterX, doorH / 2 - frameW / 2, 0, frameMat, 1.0);
              const railB = addBeveledPanel(pivot, innerW, frameW, leafDepthT, localCenterX, -doorH / 2 + frameW / 2, 0, frameMat, 1.0);
              registerInteractive(stileL, leafId);
              registerInteractive(stileR, leafId);
              registerInteractive(railT, leafId);
              registerInteractive(railB, leafId);
              // Inner thin metallic glazing bead around glass opening
              addBox(pivot, innerW + 0.004, 0.004, 0.008, localCenterX, doorH / 2 - frameW + 0.001, 0, aluFrameMat, false);
              addBox(pivot, innerW + 0.004, 0.004, 0.008, localCenterX, -doorH / 2 + frameW - 0.001, 0, aluFrameMat, false);
              // Dark smoked grey 4 mm glass or mirror center pane (interactive target)
              const glassMesh = addBox(
                pivot,
                innerW,
                innerH,
                0.005,
                localCenterX,
                0,
                0,
                isMirror ? mirrorMat : vitrineGlassMat,
                false,
              );
              registerInteractive(glassMesh, leafId);
            } else {
              const doorMesh = addBeveledPanel(
                pivot,
                leafW - gap,
                doorH,
                BOARD_T,
                localCenterX,
                0,
                0,
                colFrontMat,
                1.3,
              );
              registerInteractive(doorMesh, leafId);
            }

            // Concealed cup hinges inside door
            const hingeYOffsets = [-doorH * 0.35, doorH * 0.35];
            hingeYOffsets.forEach((hy) => {
              addBox(
                pivot,
                0.024,
                0.036,
                0.01,
                hingeSide === 'left' ? 0.015 : -0.015,
                hy,
                -leafDepthT / 2 - 0.005,
                chromeMat,
                false,
              );
            });

            // Subtle warm interior top reveal LED highlight inside vitrine bay so shelves remain readable behind smoked glass
            if (isGlass) {
              addBox(
                parentGroup,
                Math.max(0.06, leafW - 0.05),
                0.005,
                0.012,
                leafOriginX + leafW / 2,
                slotCenterY + slotH / 2 - 0.012,
                boxCenterZ + bayDepth * 0.18,
                ledEmissiveMat,
                false,
              );
            }

            const isTallDoor = !isUpper && doorH > 1.5;
            if (isGlass && configRef.current.vitrineHexiHandle !== false) {
              const hexiX = hingeSide === 'left' ? leafW - gap / 2 - 0.008 : -(leafW - gap / 2 - 0.008);
              addBox(
                pivot,
                0.012,
                Math.min(0.24, Math.max(0.12, doorH * 0.25)),
                0.016,
                hexiX,
                isTallDoor ? -doorH * 0.14 : isUpper ? -doorH / 2 + 0.14 : doorH / 2 - 0.14,
                leafDepthT / 2 + 0.006,
                vitrineFrameMat,
                false,
              );
            } else {
              const handleOffsetX =
                configRef.current.handleStyle === 'profile_j' && !isTallDoor
                  ? localCenterX
                  : hingeSide === 'left'
                    ? leafW - 0.04
                    : -(leafW - 0.04);
              const handleOffsetY =
                configRef.current.handleStyle === 'profile_j' && !isTallDoor
                  ? doorH / 2 - 0.012
                  : isTallDoor
                    ? -doorH * 0.14
                    : isUpper
                      ? -doorH / 2 + 0.14
                      : doorH / 2 - 0.14;
              addHandle(pivot, handleOffsetX, handleOffsetY, leafDepthT / 2, isTallDoor || configRef.current.handleStyle !== 'profile_j');
            }

            const isOpen = openMapRef.current.get(leafId) ?? false;
            jointsRef.current.push({
              id: leafId,
              kind: hingeSide === 'left' ? 'door_left' : 'door_right',
              pivot,
              targetOpen: isOpen ? 1 : 0,
              currentOpen: isOpen ? 1 : 0,
              maxTravel: 1.52,
            });
          };

          const isSlidingWardrobe =
            configRef.current.category === 'wardrobe' &&
            configRef.current.wardrobeDoorStyle === 'sliding' &&
            !isUpper &&
            (slot.type === 'door_left' ||
              slot.type === 'door_right' ||
              slot.type === 'door_double' ||
              slot.type === 'glass_door' ||
              slot.type === 'glass_double');

          if (isSlidingWardrobe) {
            const isGlassSlide = slot.type === 'glass_door' || slot.type === 'glass_double';
            const leafW = Math.max(0.24, colW / 2 + 0.015);
            const doorH = Math.max(0.3, slotH - 0.036);
            // Top & Bottom Aluminum Sliding Track Rails across column width
            addBox(parentGroup, colW - 0.004, 0.024, 0.056, cursorX + colW / 2, cursorTopY - 0.012, frontZ + 0.01, chromeMat, false);
            addBox(parentGroup, colW - 0.004, 0.018, 0.056, cursorX + colW / 2, slotBottomY + 0.009, frontZ + 0.01, chromeMat, false);

            const makeSlideLeaf = (
              leafId: string,
              kind: 'slide_left' | 'slide_right',
              baseX: number,
              zOffset: number,
            ) => {
              const pivot = new THREE.Group();
              const isOpen = openMapRef.current.get(leafId) ?? false;
              const travel = Math.max(0.18, colW / 2 - 0.04);
              pivot.position.set((isOpen ? (kind === 'slide_left' ? travel : -travel) : 0), slotCenterY, frontZ + zOffset);
              parentGroup.add(pivot);

              if (isGlassSlide) {
                const frameT = 0.026;
                addBox(pivot, frameT, doorH, VITRINE_T, baseX - leafW / 2 + frameT / 2, 0, 0, vitrineFrameMat);
                addBox(pivot, frameT, doorH, VITRINE_T, baseX + leafW / 2 - frameT / 2, 0, 0, vitrineFrameMat);
                addBox(pivot, leafW - frameT * 2, frameT, VITRINE_T, baseX, doorH / 2 - frameT / 2, 0, vitrineFrameMat);
                addBox(pivot, leafW - frameT * 2, frameT, VITRINE_T, baseX, -doorH / 2 + frameT / 2, 0, vitrineFrameMat);
                const gMesh = addBox(pivot, leafW - frameT * 2, doorH - frameT * 2, 0.005, baseX, 0, 0, vitrineGlassMat, false);
                registerInteractive(gMesh, leafId);
              } else {
                const sMesh = addBox(pivot, leafW, doorH, BOARD_T * 0.85, baseX, 0, 0, colFrontMat);
                registerInteractive(sMesh, leafId);
              }
              // Vertical aluminum edge grip-handle profile along outer edge
              const edgeX = kind === 'slide_left' ? baseX - leafW / 2 + 0.008 : baseX + leafW / 2 - 0.008;
              addBox(pivot, 0.014, doorH, 0.022, edgeX, 0, 0.004, aluFrameMat, false);

              jointsRef.current.push({
                id: leafId,
                kind,
                pivot,
                targetOpen: isOpen ? 1 : 0,
                currentOpen: isOpen ? 1 : 0,
                maxTravel: travel,
              });
            };

            makeSlideLeaf(`${idPrefix}_${col.id}_${slot.id}_sl1`, 'slide_left', cursorX + leafW / 2, 0.002);
            makeSlideLeaf(`${idPrefix}_${col.id}_${slot.id}_sl2`, 'slide_right', cursorX + colW - leafW / 2, 0.026);
          } else if (slot.type === 'door_left' || slot.type === 'sink_unit') {
            if (isGola) renderGolaLProfile(cursorTopY);
            if (slot.type === 'sink_unit' && colW > 0.6) {
              makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_dl1`, 'left', colW / 2, cursorX, false);
              makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_dl2`, 'right', colW / 2, cursorX + colW / 2, false);
            } else {
              makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_dl`, 'left', colW, cursorX, false);
            }
            if (slot.type === 'sink_unit' && !isUpper) {
              // Modern recessed stainless sink basin rim + dark inner bowl + arched gooseneck mixer tap
              const sinkW = Math.min(0.56, colW * 0.72);
              const sinkD = baseBayDepth * 0.65;
              const sinkY = baseYOffset + colTotalH + counterT;
              const sinkCenterZ = boxCenterZ;
              addBox(
                parentGroup,
                sinkW,
                0.007,
                sinkD,
                cursorX + colW / 2,
                sinkY + 0.0035,
                sinkCenterZ,
                chromeMat,
                false,
              );
              addBox(
                parentGroup,
                Math.max(0.18, sinkW - 0.044),
                0.004,
                Math.max(0.18, sinkD - 0.044),
                cursorX + colW / 2,
                sinkY + 0.006,
                sinkCenterZ + 0.008,
                sinkBowlMat,
                false,
              );
              // Drain strainer highlight
              addBox(
                parentGroup,
                0.055,
                0.005,
                0.055,
                cursorX + colW / 2,
                sinkY + 0.007,
                sinkCenterZ + 0.01,
                chromeMat,
                false,
              );
              // Cylindrical mixer base + vertical stem + graceful TubeGeometry spout + side lever
              const tapX = cursorX + colW / 2;
              const tapZ = sinkCenterZ - sinkD * 0.38;
              const baseCollar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.024, 0.028, 0.022, 18),
                chromeMat,
              );
              baseCollar.position.set(tapX, sinkY + 0.014, tapZ);
              baseCollar.castShadow = true;
              parentGroup.add(baseCollar);

              const tapCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(tapX, sinkY + 0.022, tapZ),
                new THREE.Vector3(tapX, sinkY + 0.22, tapZ),
                new THREE.Vector3(tapX, sinkY + 0.295, tapZ + 0.055),
                new THREE.Vector3(tapX, sinkY + 0.27, tapZ + 0.145),
                new THREE.Vector3(tapX, sinkY + 0.21, tapZ + 0.165),
              ]);
              const spoutMesh = new THREE.Mesh(
                new THREE.TubeGeometry(tapCurve, 18, 0.011, 12, false),
                chromeMat,
              );
              spoutMesh.castShadow = true;
              parentGroup.add(spoutMesh);

              // Mixer side lever
              const lever = new THREE.Mesh(
                new THREE.CylinderGeometry(0.005, 0.006, 0.065, 10),
                chromeMat,
              );
              lever.rotation.z = -Math.PI * 0.35;
              lever.position.set(tapX + 0.036, sinkY + 0.062, tapZ);
              parentGroup.add(lever);
            }
          } else if (slot.type === 'door_right') {
            if (isGola) renderGolaLProfile(cursorTopY);
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_dr`, 'right', colW, cursorX, false);
          } else if (slot.type === 'door_double') {
            if (isGola) renderGolaLProfile(cursorTopY);
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_d1`, 'left', colW / 2, cursorX, false);
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_d2`, 'right', colW / 2, cursorX + colW / 2, false);
          } else if (slot.type === 'glass_door') {
            if (isGola) renderGolaLProfile(cursorTopY);
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_gd`, 'left', colW, cursorX, true);
          } else if (slot.type === 'glass_double') {
            if (isGola) renderGolaLProfile(cursorTopY);
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_gd1`, 'left', colW / 2, cursorX, true);
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_gd2`, 'right', colW / 2, cursorX + colW / 2, true);
          } else if (slot.type === 'cargo_basket') {
            if (isGola) renderGolaLProfile(cursorTopY);
            const jId = `${idPrefix}_${col.id}_${slot.id}_cargo`;
            const doorH = isGola ? Math.max(0.18, slotH - golaGap - gap) : slotH - gap;
            const doorCenterY = isGola ? slotCenterY - golaGap / 2 : slotCenterY;
            const pivot = new THREE.Group();
            const isOpen = openMapRef.current.get(jId) ?? false;
            const boxD = Math.max(0.24, depth - 0.06);
            const maxTravel = Math.min(0.42, boxD * 0.85);
            pivot.position.set(cursorX + colW / 2, doorCenterY, isOpen ? maxTravel : 0);
            parentGroup.add(pivot);

            const front = addBox(pivot, colW - gap, doorH, BOARD_T, 0, 0, frontZ, colFrontMat);
            registerInteractive(front, jId);
            addHandle(pivot, 0, doorH / 2 - 0.14, frontZ + BOARD_T / 2, true);

            // Chrome vertical side bars + 2 wire pull-out baskets inside
            const boxW = Math.max(0.12, colW - BOARD_T * 2 - 0.036);
            const boxCenterZ = frontZ - BOARD_T / 2 - boxD / 2;
            addBox(pivot, 0.01, doorH * 0.82, 0.01, -boxW / 2, 0, frontZ - BOARD_T - 0.02, chromeMat, false);
            addBox(pivot, 0.01, doorH * 0.82, 0.01, boxW / 2, 0, frontZ - BOARD_T - 0.02, chromeMat, false);
            [-doorH * 0.28, doorH * 0.16].forEach((by) => {
              addBox(pivot, boxW, 0.012, boxD, 0, by, boxCenterZ, chromeMat, false);
              addBox(pivot, boxW, 0.04, 0.008, 0, by + 0.026, frontZ - BOARD_T - boxD + 0.01, chromeMat, false);
              addBox(pivot, 0.008, 0.04, boxD, -boxW / 2, by + 0.026, boxCenterZ, chromeMat, false);
              addBox(pivot, 0.008, 0.04, boxD, boxW / 2, by + 0.026, boxCenterZ, chromeMat, false);
            });

            jointsRef.current.push({
              id: jId,
              kind: 'drawer',
              pivot,
              targetOpen: isOpen ? 1 : 0,
              currentOpen: isOpen ? 1 : 0,
              maxTravel,
            });
          } else if (slot.type === 'flap_up') {
            const jId = `${idPrefix}_${col.id}_${slot.id}_flap`;
            const pivot = new THREE.Group();
            pivot.position.set(cursorX + colW / 2, cursorTopY - gap / 2, frontZ);
            parentGroup.add(pivot);
            const flapMesh = addBox(pivot, colW - gap, slotH - gap, BOARD_T, 0, -slotH / 2, 0, colFrontMat);
            registerInteractive(flapMesh, jId);
            addHandle(pivot, 0, -slotH + 0.045, BOARD_T / 2, false);
            const isOpen = openMapRef.current.get(jId) ?? false;
            jointsRef.current.push({
              id: jId,
              kind: 'flap_up',
              pivot,
              targetOpen: isOpen ? 1 : 0,
              currentOpen: isOpen ? 1 : 0,
              maxTravel: 1.32,
            });
          } else if (isDrawerSlotType(slot.type)) {
            const count = Math.max(1, getDrawerCount(slot));
            const dH = isGola
              ? Math.max(0.045, (slotH - count * golaGap) / count)
              : slotH / count;
            const slideLenMm = resolveDrawerSlideLengthMm(Math.round(bayDepth * 1000));
            const boxD = Math.min(Math.max(0.18, bayDepth - 0.025), slideLenMm / 1000);
            const boxW = Math.max(0.14, colW - BOARD_T * 2 - 0.028);

            if (isGola) {
              renderGolaLProfile(cursorTopY);
            }

            const effectiveSlide: DrawerSlideType =
              slot.drawerSlideType ||
              (configRef.current.hardwareTierId === 'hw_blum'
                ? 'blum_hidden'
                : configRef.current.hardwareTierId === 'hw_gtv' ||
                    configRef.current.hardwareTierId === 'hw_hettich'
                  ? 'telescopic_soft'
                  : 'ball_bearing');

            for (let d = 0; d < count; d++) {
              const jId = `${idPrefix}_${col.id}_${slot.id}_drw_${d}`;
              const dTopY = isGola
                ? cursorTopY - golaGap - d * (dH + golaGap)
                : cursorTopY - dH * d;
              const dCenterY = dTopY - dH / 2;

              if (isGola && d < count - 1) {
                renderGolaCProfile(dTopY - dH - golaGap / 2);
              }

              const pivot = new THREE.Group();
              pivot.position.set(cursorX + colW / 2, dCenterY, 0);
              parentGroup.add(pivot);

              // Beveled drawer front face (creates sharp 3 mm architectural shadow reveals between drawers)
              const frontH = isGola ? Math.max(0.04, dH - 0.002) : dH - gap;
              const front = addBeveledPanel(pivot, colW - gap, frontH, BOARD_T, 0, 0, frontZ, colFrontMat, 1.3);
              registerInteractive(front, jId);

              // 4-sided inner drawer box + HDF bottom
              const innerH = Math.max(0.055, isGola ? Math.min(0.16, dH * 0.62) : dH * 0.64);
              const boxCenterZ = frontZ - BOARD_T / 2 - boxD / 2;
              addBox(pivot, BOARD_T * 0.85, innerH, boxD, -boxW / 2 + 0.008, -0.008, boxCenterZ, colCarcassMat);
              addBox(pivot, BOARD_T * 0.85, innerH, boxD, boxW / 2 - 0.008, -0.008, boxCenterZ, colCarcassMat);
              addBox(pivot, boxW, innerH, BOARD_T * 0.85, 0, -0.008, frontZ - BOARD_T / 2 - boxD + 0.008, colCarcassMat);
              addBox(pivot, boxW, 0.012, boxD, 0, -innerH / 2 - 0.004, boxCenterZ, hdfMat);

              if (effectiveSlide === 'blum_hidden') {
                // Concealed undermount Blum runner channels underneath drawer bottom + orange front locking clips
                const underY = -innerH / 2 - 0.014;
                addBox(pivot, 0.022, 0.016, boxD, -boxW / 2 + 0.024, underY, boxCenterZ, chromeMat, false);
                addBox(pivot, 0.022, 0.016, boxD, boxW / 2 - 0.024, underY, boxCenterZ, chromeMat, false);
                addBox(pivot, 0.028, 0.014, 0.032, -boxW / 2 + 0.024, underY, frontZ - BOARD_T - 0.02, blumAccentMat, false);
                addBox(pivot, 0.028, 0.014, 0.032, boxW / 2 - 0.024, underY, frontZ - BOARD_T - 0.02, blumAccentMat, false);
              } else if (effectiveSlide === 'telescopic_soft') {
                // Full-extension telescopic dark steel side runners
                addBox(pivot, 0.011, 0.036, boxD, -boxW / 2 - 0.006, -0.016, boxCenterZ, metalHandleMat, false);
                addBox(pivot, 0.011, 0.036, boxD, boxW / 2 + 0.006, -0.016, boxCenterZ, metalHandleMat, false);
              } else {
                // Standard side-mounted ball-bearing steel rails
                addBox(pivot, 0.008, 0.026, boxD, -boxW / 2 - 0.005, -0.02, boxCenterZ, runnerSteelMat, false);
                addBox(pivot, 0.008, 0.026, boxD, boxW / 2 + 0.005, -0.02, boxCenterZ, runnerSteelMat, false);
              }

              addHandle(pivot, 0, configRef.current.handleStyle === 'profile_j' ? dH / 2 - 0.012 : 0, frontZ + BOARD_T / 2, false);

              const isOpen = openMapRef.current.get(jId) ?? false;
              jointsRef.current.push({
                id: jId,
                kind: 'drawer',
                pivot,
                targetOpen: isOpen ? 1 : 0,
                currentOpen: isOpen ? 1 : 0,
                maxTravel: Math.min(0.46, boxD * 0.85),
              });
            }
          } else if (slot.type === 'oven_hob' || slot.type === 'oven_only') {
            // Detailed Multi-Part Built-in Oven (stainless control panel, rotary knobs, LED display, dark smoked glass, tubular handle)
            const hasExplicitDrawerSlot = col.slots.some((s) => isDrawerSlotType(s.type));
            const ovenH = hasExplicitDrawerSlot ? slotH * 0.94 : slotH * 0.72;
            const ovenY = hasExplicitDrawerSlot ? slotCenterY : slotCenterY + slotH * 0.12;
            const ovenW = colW - 0.012;
            const fasciaH = Math.min(0.105, ovenH * 0.2);

            // Outer dark metal trim frame
            addBox(parentGroup, ovenW, ovenH, BOARD_T, cursorX + colW / 2, ovenY, frontZ, aluFrameMat);
            // Upper brushed stainless control fascia
            addBox(
              parentGroup,
              ovenW - 0.01,
              fasciaH,
              0.006,
              cursorX + colW / 2,
              ovenY + ovenH / 2 - fasciaH / 2 - 0.006,
              frontZ + BOARD_T / 2 + 0.001,
              chromeMat,
              false,
            );
            // Glowing digital clock/display strip on stainless fascia
            addBox(
              parentGroup,
              Math.min(0.11, ovenW * 0.22),
              0.022,
              0.004,
              cursorX + colW / 2,
              ovenY + ovenH / 2 - fasciaH / 2 - 0.006,
              frontZ + BOARD_T / 2 + 0.005,
              ovenGlassMat,
              false,
            );
            addBox(
              parentGroup,
              Math.min(0.06, ovenW * 0.12),
              0.006,
              0.003,
              cursorX + colW / 2,
              ovenY + ovenH / 2 - fasciaH / 2 - 0.006,
              frontZ + BOARD_T / 2 + 0.007,
              emberLedMat,
              false,
            );
            // Left & right cylindrical rotary knobs
            [-ovenW * 0.34, ovenW * 0.34].forEach((kx) => {
              const knobMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.017, 0.019, 0.018, 18),
                chromeMat,
              );
              knobMesh.rotation.x = Math.PI / 2;
              knobMesh.position.set(
                cursorX + colW / 2 + kx,
                ovenY + ovenH / 2 - fasciaH / 2 - 0.006,
                frontZ + BOARD_T / 2 + 0.011,
              );
              parentGroup.add(knobMesh);
            });
            // Smoked ceramic glass door window
            const glassH = Math.max(0.18, ovenH - fasciaH - 0.024);
            const glassY = ovenY - fasciaH / 2 - 0.004;
            addBox(
              parentGroup,
              ovenW - 0.024,
              glassH,
              0.006,
              cursorX + colW / 2,
              glassY,
              frontZ + BOARD_T / 2 + 0.002,
              ovenGlassMat,
              false,
            );
            // Tubular stainless door bar handle + standoffs
            const handleY = ovenY + ovenH / 2 - fasciaH - 0.032;
            addBox(
              parentGroup,
              ovenW * 0.74,
              0.014,
              0.014,
              cursorX + colW / 2,
              handleY,
              frontZ + BOARD_T / 2 + 0.024,
              chromeMat,
              false,
            );
            [-ovenW * 0.32, ovenW * 0.32].forEach((sx) => {
              addBox(
                parentGroup,
                0.012,
                0.012,
                0.02,
                cursorX + colW / 2 + sx,
                handleY,
                frontZ + BOARD_T / 2 + 0.012,
                chromeMat,
                false,
              );
            });
            if (!hasExplicitDrawerSlot) {
              addBeveledPanel(
                parentGroup,
                colW - gap,
                slotH * 0.24,
                BOARD_T,
                cursorX + colW / 2,
                slotBottomY + slotH * 0.12,
                frontZ,
                colFrontMat,
                1.2,
              );
            }
            // Induction cooktop glass with cooking zone rings on worktop when oven_hob
            if (slot.type === 'oven_hob' && isKitchen && !isUpper) {
              addCooktopDetail(
                parentGroup,
                colW * 0.82,
                baseBayDepth * 0.76,
                cursorX + colW / 2,
                colBaseY + colTotalH + counterT + 0.004,
                boxCenterZ,
              );
            }
          } else if (slot.type === 'microwave') {
            // Detailed Built-in Microwave (dark glass frame + smoked door + stainless touch column + glowing digital readout)
            const mwW = colW - 0.012;
            const mwH = slotH - 0.014;
            const mwMesh = addBox(
              parentGroup,
              mwW,
              mwH,
              BOARD_T,
              cursorX + colW / 2,
              slotCenterY,
              frontZ,
              ovenGlassMat,
            );
            registerInteractive(mwMesh, `${idPrefix}_${col.id}_${slot.id}_mw`);
            addBox(
              parentGroup,
              mwW - 0.008,
              0.012,
              0.006,
              cursorX + colW / 2,
              slotCenterY + mwH / 2 - 0.012,
              frontZ + BOARD_T / 2 + 0.003,
              chromeMat,
              false,
            );
            addBox(
              parentGroup,
              mwW * 0.19,
              mwH * 0.76,
              0.005,
              cursorX + colW * 0.77,
              slotCenterY - 0.006,
              frontZ + BOARD_T / 2 + 0.003,
              aluFrameMat,
              false,
            );
            addBox(
              parentGroup,
              mwW * 0.1,
              0.014,
              0.004,
              cursorX + colW * 0.77,
              slotCenterY + mwH * 0.16,
              frontZ + BOARD_T / 2 + 0.006,
              emberLedMat,
              false,
            );
          } else if (slot.type === 'fridge_builtin') {
            // Tall integrated fridge + freezer split front doors
            const upperRatio = 0.66;
            const upperH = slotH * upperRatio - gap;
            const lowerH = slotH * (1 - upperRatio) - gap;
            const upperY = cursorTopY - upperH / 2;
            const lowerY = slotBottomY + lowerH / 2;

            const pivotUp = new THREE.Group();
            pivotUp.position.set(cursorX, upperY, frontZ);
            parentGroup.add(pivotUp);
            const upDoor = addBox(pivotUp, colW - gap, upperH, BOARD_T, colW / 2, 0, 0, colFrontMat);
            registerInteractive(upDoor, `${idPrefix}_${col.id}_${slot.id}_fr1`);
            addHandle(pivotUp, colW - 0.045, -upperH * 0.25, BOARD_T / 2, true);

            const pivotLo = new THREE.Group();
            pivotLo.position.set(cursorX, lowerY, frontZ);
            parentGroup.add(pivotLo);
            const loDoor = addBox(pivotLo, colW - gap, lowerH, BOARD_T, colW / 2, 0, 0, colFrontMat);
            registerInteractive(loDoor, `${idPrefix}_${col.id}_${slot.id}_fr2`);
            addHandle(pivotLo, colW - 0.045, lowerH * 0.2, BOARD_T / 2, true);

            [
              { id: `${idPrefix}_${col.id}_${slot.id}_fr1`, pivot: pivotUp },
              { id: `${idPrefix}_${col.id}_${slot.id}_fr2`, pivot: pivotLo },
            ].forEach(({ id, pivot }) => {
              const isOpen = openMapRef.current.get(id) ?? false;
              jointsRef.current.push({
                id,
                kind: 'door_left',
                pivot,
                targetOpen: isOpen ? 1 : 0,
                currentOpen: isOpen ? 1 : 0,
                maxTravel: 1.52,
              });
            });
          } else if (slot.type === 'hob_only') {
            // Lower cabinet doors under independent built-in induction/ceramic hob
            if (isGola) renderGolaLProfile(cursorTopY);
            if (colW > 0.6) {
              makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_hd1`, 'left', colW / 2, cursorX);
              makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_hd2`, 'right', colW / 2, cursorX + colW / 2);
            } else {
              makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_hdl`, 'left', colW, cursorX);
            }
            if (isKitchen && !isUpper) {
              addCooktopDetail(
                parentGroup,
                Math.min(0.62, colW * 0.8),
                baseBayDepth * 0.76,
                cursorX + colW / 2,
                colBaseY + colTotalH + counterT + 0.004,
                boxCenterZ,
              );
            }
          } else if (slot.type === 'dishwasher') {
            if (isGola) renderGolaLProfile(cursorTopY);
            const isPanelMode = slot.dishwasherStyle === 'integrated_panel';
            if (isPanelMode) {
              // Visible top stainless steel control fascia + lower decor panel
              const ctrlH = 0.11;
              addBox(
                parentGroup,
                colW - gap,
                ctrlH,
                BOARD_T,
                cursorX + colW / 2,
                cursorTopY - ctrlH / 2 - gap / 2,
                frontZ,
                chromeMat,
              );
              const lowerPanelH = Math.max(0.2, slotH - ctrlH - gap * 2);
              const dwMesh = addBox(
                parentGroup,
                colW - gap,
                lowerPanelH,
                BOARD_T,
                cursorX + colW / 2,
                slotBottomY + lowerPanelH / 2,
                frontZ,
                colFrontMat,
              );
              registerInteractive(dwMesh, `${idPrefix}_${col.id}_${slot.id}_dw`);
            } else {
              // Full integrated dishwasher decor front door
              const dwMesh = addBox(
                parentGroup,
                colW - gap,
                isGola ? slotH - golaGap - gap : slotH - gap,
                BOARD_T,
                cursorX + colW / 2,
                isGola ? slotCenterY - golaGap / 2 : slotCenterY,
                frontZ,
                colFrontMat,
              );
              registerInteractive(dwMesh, `${idPrefix}_${col.id}_${slot.id}_dw`);
              addBox(
                parentGroup,
                colW * 0.36,
                0.012,
                0.018,
                cursorX + colW / 2,
                cursorTopY - (isGola ? golaGap + 0.045 : 0.045),
                frontZ + BOARD_T / 2 + 0.009,
                chromeMat,
                false,
              );
            }
          } else if (slot.type === 'washing_machine' || slot.type === 'dryer') {
            // Freestanding/under-counter washing machine or dryer with circular drum porthole
            const appW = colW - 0.024;
            const appH = slotH - 0.015;
            const appD = depth - 0.03;
            const appMesh = addBox(
              parentGroup,
              appW,
              appH,
              appD,
              cursorX + colW / 2,
              slotBottomY + appH / 2,
              0,
              applianceWhiteMat,
            );
            registerInteractive(appMesh, `${idPrefix}_${col.id}_${slot.id}_app`);
            addBox(
              parentGroup,
              appW - 0.01,
              0.085,
              0.012,
              cursorX + colW / 2,
              slotBottomY + appH - 0.055,
              appD / 2 + 0.005,
              slot.type === 'dryer' ? metalHandleMat : chromeMat,
              false,
            );
            const radius = Math.min(appW * 0.32, appH * 0.24);
            const ring = new THREE.Mesh(
              new THREE.CylinderGeometry(radius + 0.016, radius + 0.016, 0.016, 28),
              chromeMat,
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.set(cursorX + colW / 2, slotBottomY + appH * 0.44, appD / 2 + 0.006);
            parentGroup.add(ring);

            const glassDrum = new THREE.Mesh(
              new THREE.CylinderGeometry(radius, radius, 0.02, 28),
              ovenGlassMat,
            );
            glassDrum.rotation.x = Math.PI / 2;
            glassDrum.position.set(cursorX + colW / 2, slotBottomY + appH * 0.44, appD / 2 + 0.008);
            parentGroup.add(glassDrum);
          } else if (slot.type === 'extractor_hood') {
            // Detailed built-in telescopic extractor hood + grease filter + warm dual LED spots
            addBox(
              parentGroup,
              colW - 0.012,
              0.042,
              depth + 0.06,
              cursorX + colW / 2,
              slotBottomY + 0.01,
              0.03,
              chromeMat,
            );
            addBox(
              parentGroup,
              colW - 0.046,
              0.01,
              depth * 0.7,
              cursorX + colW / 2,
              slotBottomY - 0.006,
              0.01,
              aluFrameMat,
              false,
            );
            [-colW * 0.28, colW * 0.28].forEach((lx) => {
              addBox(
                parentGroup,
                0.055,
                0.006,
                0.025,
                cursorX + colW / 2 + lx,
                slotBottomY - 0.011,
                depth * 0.28,
                ledEmissiveMat,
                false,
              );
            });
            const upperDoorH = Math.max(0.18, slotH - 0.06);
            addBeveledPanel(
              parentGroup,
              colW - gap,
              upperDoorH,
              BOARD_T,
              cursorX + colW / 2,
              cursorTopY - upperDoorH / 2,
              frontZ,
              colFrontMat,
              1.2,
            );
          } else if (slot.type === 'double_hanging_rod') {
            // Dual interior clothes rails (upper + mid height)
            [cursorTopY - 0.14, slotCenterY - 0.04].forEach((ry) => {
              const railGeo = new THREE.CylinderGeometry(0.012, 0.012, colW - BOARD_T * 2 - 0.02, 14);
              const rail = new THREE.Mesh(railGeo, chromeMat);
              rail.rotation.z = Math.PI / 2;
              rail.position.set(cursorX + colW / 2, ry, 0);
              parentGroup.add(rail);
            });
          } else if (slot.type === 'trouser_rack') {
            // Pull-out chrome frame + parallel trouser bars
            const rackW = colW - BOARD_T * 2 - 0.04;
            const rackD = Math.max(0.28, depth - 0.08);
            addBox(parentGroup, rackW, 0.018, 0.018, cursorX + colW / 2, slotCenterY, rackD / 2, chromeMat, false);
            addBox(parentGroup, rackW, 0.018, 0.018, cursorX + colW / 2, slotCenterY, -rackD / 2, chromeMat, false);
            for (let b = -2; b <= 2; b++) {
              addBox(
                parentGroup,
                0.01,
                0.012,
                rackD,
                cursorX + colW / 2 + b * (rackW / 5),
                slotCenterY,
                0,
                chromeMat,
                false,
              );
            }
          } else if (slot.type === 'shoe_rack') {
            // 3 tilting drop-down shoe compartments
            const tiers = 3;
            const tierH = slotH / tiers;
            for (let tIdx = 0; tIdx < tiers; tIdx++) {
              const ty = cursorTopY - tierH * (tIdx + 0.5);
              const shoeMesh = addBox(
                parentGroup,
                colW - gap,
                tierH - gap,
                BOARD_T,
                cursorX + colW / 2,
                ty,
                frontZ,
                colFrontMat,
              );
              registerInteractive(shoeMesh, `${idPrefix}_${col.id}_${slot.id}_sh_${tIdx}`);
              addBox(
                parentGroup,
                Math.min(0.24, colW * 0.35),
                0.012,
                0.018,
                cursorX + colW / 2,
                ty + tierH * 0.25,
                frontZ + BOARD_T / 2 + 0.009,
                metalHandleMat,
                false,
              );
            }
          } else if (slot.type === 'coat_panel') {
            // Decorative wall backer panel + upper hat shelf + 4 metallic double coat hooks
            const panelMesh = addBox(
              parentGroup,
              colW - 0.01,
              colBoxH,
              BOARD_T,
              cursorX + colW / 2,
              colBoxCenterY,
              -depth / 2 + BOARD_T / 2 + 0.01,
              colFrontMat,
            );
            registerInteractive(panelMesh, `${idPrefix}_${col.id}_${slot.id}_coat`);
            // Upper hat shelf
            addBox(
              parentGroup,
              colW - 0.01,
              BOARD_T,
              Math.max(0.22, depth * 0.8),
              cursorX + colW / 2,
              cursorTopY - 0.22,
              -depth / 2 + depth * 0.4,
              colCarcassMat,
            );
            // Coat rail under hat shelf
            const railGeo = new THREE.CylinderGeometry(0.01, 0.01, colW - 0.08, 12);
            const rail = new THREE.Mesh(railGeo, chromeMat);
            rail.rotation.z = Math.PI / 2;
            rail.position.set(cursorX + colW / 2, cursorTopY - 0.28, -depth / 2 + depth * 0.45);
            parentGroup.add(rail);
            // 4 Wall hooks
            const hooks = 4;
            for (let hk = 0; hk < hooks; hk++) {
              const hx = cursorX + (colW * (hk + 0.7)) / (hooks + 0.4);
              addBox(parentGroup, 0.018, 0.055, 0.032, hx, cursorTopY - 0.48, -depth / 2 + BOARD_T + 0.025, chromeMat, false);
            }
          } else if (slot.type === 'bench_seat') {
            // Upholstered cushion atop low shoe bench
            const cushionH = 0.065;
            addBox(
              parentGroup,
              colW - 0.01,
              cushionH,
              depth + 0.01,
              cursorX + colW / 2,
              colBaseY + colTotalH + cushionH / 2,
              0.005,
              cushionMat,
            );
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_bd1`, 'left', colW / 2, cursorX, false);
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_bd2`, 'right', colW / 2, cursorX + colW / 2, false);
          } else if (slot.type === 'mirror_front') {
            makeDoorLeaf(`${idPrefix}_${col.id}_${slot.id}_mr`, 'left', colW, cursorX, false, true);
          } else if (slot.type === 'tv_niche') {
            // Open AV/Media console niche with center shelf + subtle warm LED accent
            addBox(
              parentGroup,
              colW - BOARD_T * 2,
              BOARD_T,
              depth - 0.03,
              cursorX + colW / 2,
              slotCenterY,
              -0.008,
              colCarcassMat,
            );
            addBox(
              parentGroup,
              colW - BOARD_T * 2 - 0.04,
              0.006,
              0.012,
              cursorX + colW / 2,
              cursorTopY - 0.01,
              -depth / 2 + 0.025,
              ledEmissiveMat,
              false,
            );
          } else if (slot.type === 'corner_blind') {
            // Half blind filler panel + half hinged door access (+ optional Magic Corner tray inside)
            const minCornerBlind =
              configRef.current.layoutShape === 'l_shape' && colW > depth + FILLER_W + 0.25
                ? depth + FILLER_W
                : colW * 0.46;
            const blindW = Math.min(colW - 0.25, Math.max(colW * 0.46, minCornerBlind));
            const doorW = colW - blindW;
            const blindOnLeft = configRef.current.cornerSide === 'left';
            addBox(
              parentGroup,
              blindW - gap / 2,
              slotH - gap,
              BOARD_T,
              blindOnLeft ? cursorX + blindW / 2 : cursorX + doorW + blindW / 2,
              slotCenterY,
              frontZ,
              colFrontMat,
            );
            makeDoorLeaf(
              `${idPrefix}_${col.id}_${slot.id}_cb`,
              blindOnLeft ? 'right' : 'left',
              doorW,
              blindOnLeft ? cursorX + blindW : cursorX,
              false,
            );
            if (configRef.current.includeCornerMechanism) {
              addBox(parentGroup, colW * 0.65, 0.014, depth * 0.56, cursorX + colW / 2, slotCenterY - 0.08, 0, chromeMat, false);
              addBox(parentGroup, colW * 0.65, 0.014, depth * 0.56, cursorX + colW / 2, slotCenterY + 0.14, 0, chromeMat, false);
            }
          }

          // Optional per-slot extra details matching gallery designs
          if (slot.hasCooktop && isKitchen && !isUpper) {
            addCooktopDetail(
              parentGroup,
              Math.min(0.62, colW * 0.78),
              baseBayDepth * 0.76,
              cursorX + colW / 2,
              colBaseY + colTotalH + counterT + 0.004,
              boxCenterZ,
            );
          }

          if (slot.hasLedLight) {
            addBox(
              parentGroup,
              colW - BOARD_T * 2 - 0.02,
              0.007,
              0.018,
              cursorX + colW / 2,
              cursorTopY - 0.005,
              0,
              ledEmissiveMat,
              false,
            );
          }

          if (slot.hasWoodTop && !isUpper) {
            addBox(
              parentGroup,
              colW + 0.002,
              BOARD_T * 1.4,
              depth + 0.01,
              cursorX + colW / 2,
              colBaseY + colTotalH + BOARD_T * 0.7,
              0.004,
              colCarcassMat,
            );
          }

          if (slot.hasBenchCushion && !isUpper) {
            const topY = colBaseY + colTotalH;
            // Wood seat top plank + back riser panel
            addBox(parentGroup, colW + 0.002, BOARD_T * 1.4, depth + 0.01, cursorX + colW / 2, topY + BOARD_T * 0.7, 0.004, colCarcassMat);
            addBox(parentGroup, colW + 0.002, 0.36, BOARD_T, cursorX + colW / 2, topY + BOARD_T * 1.4 + 0.18, -depth / 2 + BOARD_T / 2, colCarcassMat);
            // Seat cushion & tufted back cushion
            addBox(parentGroup, colW - 0.008, 0.068, depth - 0.03, cursorX + colW / 2, topY + BOARD_T * 1.4 + 0.034, 0.018, cushionMat);
            addBox(parentGroup, colW - 0.008, 0.25, 0.07, cursorX + colW / 2, topY + BOARD_T * 1.4 + 0.2, -depth / 2 + BOARD_T + 0.035, cushionMat);
          }

          cursorTopY -= slotH;
        });

        // Selection highlight indicator for active bay in full view
        if (col.id === selectedColRef.current && !isUpper && !isolatedModeRef.current) {
          addBox(
            parentGroup,
            colW - 0.02,
            0.006,
            0.024,
            cursorX + colW / 2,
            colBaseY + 0.005,
            depth / 2 + 0.08,
            selectionAccentMat,
            false,
          );
          addBox(
            parentGroup,
            0.008,
            colTotalH,
            0.008,
            cursorX + 0.004,
            colBaseY + colTotalH / 2,
            depth / 2 + BOARD_T + 0.015,
            selectionAccentMat,
            false,
          );
          addBox(
            parentGroup,
            0.008,
            colTotalH,
            0.008,
            cursorX + colW - 0.004,
            colBaseY + colTotalH / 2,
            depth / 2 + BOARD_T + 0.015,
            selectionAccentMat,
            false,
          );
        }

        for (let ci = bayStartChildIdx; ci < parentGroup.children.length; ci++) {
          parentGroup.children[ci].traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh && !obj.userData.colId) {
              obj.userData.colId = col.id;
              clickableMeshes.push(obj);
            }
          });
        }

        cursorX += colW;
      });
    };

    const findIsolatedColumn = (cfg: FurnitureConfig): ColumnConfig | null => {
      if (!isolatedModeRef.current || !selectedColRef.current) return null;
      return (
        cfg.columns.find((c) => c.id === selectedColRef.current) ||
        cfg.wingColumns.find((c) => c.id === selectedColRef.current) ||
        null
      );
    };

    const rebuildScene = () => {
      // Clear previous furniture group
      while (furnitureRoot.children.length > 0) {
        const child = furnitureRoot.children.pop()!;
        child.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).geometry.dispose();
          }
        });
      }
      if (xrayFrontMat) {
        xrayFrontMat.dispose();
        xrayFrontMat = null;
      }
      while (xrayExtraMats.length > 0) {
        xrayExtraMats.pop()?.dispose();
      }
      clickableMeshes.length = 0;
      measureTargets.length = 0;
      jointsRef.current = [];

      const cfg = configRef.current;
      if (
        (!cfg.columns || cfg.columns.length === 0) &&
        (!cfg.wingColumns || cfg.wingColumns.length === 0)
      ) {
        rebuildRoomShell();
        rebuildDimensions();
        requestRender();
        return;
      }

      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const findDecor = (id: string) =>
        decorsRef.current.find((d) => d.id === id) || decorsRef.current[0];

      const resolveDecorMat = (decorId: string, isFront = false): THREE.Material => {
        const mat = getDecorMaterial(findDecor(decorId), maxAniso);
        if (isFront && seeInsideRef.current) {
          const clone = mat.clone();
          clone.transparent = true;
          clone.opacity = 0.22;
          clone.depthWrite = false;
          xrayExtraMats.push(clone);
          return clone;
        }
        return mat;
      };

      const carcassMat = getDecorMaterial(findDecor(cfg.carcassDecorId), maxAniso);
      const baseFrontMat = getDecorMaterial(findDecor(cfg.frontDecorId), maxAniso);
      let frontMat: THREE.Material = baseFrontMat;
      if (seeInsideRef.current) {
        xrayFrontMat = baseFrontMat.clone();
        xrayFrontMat.transparent = true;
        xrayFrontMat.opacity = 0.22;
        xrayFrontMat.depthWrite = false;
        frontMat = xrayFrontMat;
      }
      const counterMat = getDecorMaterial(findDecor(cfg.countertopDecorId), maxAniso);
      const backsplashMat = getDecorMaterial(
        findDecor(cfg.backsplashDecorId || cfg.countertopDecorId),
        maxAniso,
      );

      const totalH = cfg.heightCm / 100;
      const depth = cfg.depthCm / 100;
      const plinthH = cfg.plinthCm / 100;
      const counterT = (cfg.countertopThicknessMm || 40) / 1000;
      const backT = (cfg.backsplashThicknessMm || 10) / 1000;
      const backH = Math.min(0.6, Math.max(0.1, (cfg.backsplashHeightMm ?? 600) / 1000));
      const isKitchen = cfg.category === 'kitchen';
      const assembly = new THREE.Group();

      const isolatedCol = findIsolatedColumn(cfg);
      if (isolatedCol) {
        const isoW = isolatedCol.widthCm / 100;
        const isoGroup = new THREE.Group();
        buildRun(
          isoGroup,
          [isolatedCol],
          totalH,
          depth,
          plinthH,
          counterT,
          carcassMat,
          frontMat,
          counterMat,
          isKitchen,
          false,
          0,
          'iso',
          resolveDecorMat,
        );
        assembly.add(isoGroup);
        assembly.position.x = -isoW / 2;
        furnitureRoot.add(assembly);
        furnitureRoot.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            measureTargets.push(obj);
          }
        });
        rebuildRoomShell();
        rebuildDimensions();
        requestRender();
        return;
      }

      const mainRunW = cfg.columns.reduce((s, c) => s + c.widthCm / 100, 0);

      const mainRunGroup = new THREE.Group();
      buildRun(
        mainRunGroup,
        cfg.columns,
        totalH,
        depth,
        plinthH,
        counterT,
        carcassMat,
        frontMat,
        counterMat,
        isKitchen,
        false,
        0,
        'main',
        resolveDecorMat,
      );
      assembly.add(mainRunGroup);

      // Thermopanel Backsplash (8 / 10 / 12 / 15 mm thick, <= 600 mm tall) — only behind low base bays
      if (isKitchen && cfg.includeBacksplash) {
        let bsCursorX = 0;
        cfg.columns.forEach((c) => {
          const colW = c.widthCm / 100;
          const colTotalCm = c.heightCm || cfg.heightCm;
          if (colTotalCm <= 130) {
            addBox(
              assembly,
              colW + 0.002,
              backH,
              backT,
              bsCursorX + colW / 2,
              totalH + counterT + backH / 2,
              -depth / 2 + backT / 2,
              backsplashMat,
              false,
            );
          }
          bsCursorX += colW;
        });
      }

      const isLeftCorner = cfg.cornerSide === 'left';
      const uDepth = (cfg.upperDepthCm || 32) / 100;
      const uHeight = (cfg.upperHeightCm || 72) / 100;
      const upperGapM = cfg.includeBacksplash ? Math.max(0.56, backH) : 0.56;
      const upperBaseY = totalH + counterT + upperGapM;

      const makeUpperCol = (
        c: ColumnConfig,
        defaultDoor: 'door_left' | 'door_right',
        widthOverrideCm?: number,
      ): ColumnConfig => {
        const wCm = widthOverrideCm ?? c.widthCm;
        const hasHob = c.slots.some((sl) => sl.type === 'oven_hob' || sl.type === 'hob_only');
        const resolvedUpper = c.upperType || (hasHob ? 'extractor_builtin' : 'doors');
        const upperDecor = c.upperFrontDecorId || c.frontDecorId;
        return {
          ...c,
          widthCm: wCm,
          carcassDecorId: upperDecor || c.carcassDecorId,
          frontDecorId: upperDecor,
          slots: [
            {
              id: `${c.id}_up`,
              heightRatio: 1,
              type:
                resolvedUpper === 'flap_up'
                  ? 'flap_up'
                  : resolvedUpper === 'extractor_builtin'
                    ? 'extractor_hood'
                    : resolvedUpper === 'extractor_chimney'
                      ? 'open_shelves'
                      : resolvedUpper === 'glass_doors'
                        ? wCm > 60
                          ? 'glass_double'
                          : 'glass_door'
                        : wCm > 60
                          ? 'door_double'
                          : defaultDoor,
              internalShelves: resolvedUpper === 'extractor_chimney' ? 0 : 1,
            },
          ],
        };
      };

      const cornerAdjacentWingCol =
        cfg.layoutShape === 'l_shape' && cfg.wingColumns.length > 0
          ? isLeftCorner
            ? cfg.wingColumns[cfg.wingColumns.length - 1]
            : cfg.wingColumns[0]
          : undefined;
      const hasWingUpperAtCorner = Boolean(
        isKitchen &&
          cfg.includeUpperCabinets &&
          cfg.layoutShape === 'l_shape' &&
          cfg.includeWingUpperCabinets !== false &&
          cornerAdjacentWingCol &&
          (cornerAdjacentWingCol.heightCm || cfg.heightCm) <= 130 &&
          cornerAdjacentWingCol.upperType !== 'none',
      );

      // Upper cabinets for kitchens (skip tall columns > 130 cm and explicit upperType === 'none')
      if (isKitchen && cfg.includeUpperCabinets) {
        let runCursorX = 0;
        cfg.columns.forEach((c, idx) => {
          const colW = c.widthCm / 100;
          if ((c.heightCm || cfg.heightCm) <= 130 && c.upperType !== 'none') {
            const hasHob = c.slots.some((sl) => sl.type === 'oven_hob' || sl.type === 'hob_only');
            const resolvedUpper = c.upperType || (hasHob ? 'extractor_builtin' : 'doors');
            if (resolvedUpper === 'extractor_chimney') {
              addBox(assembly, colW - 0.02, 0.07, depth * 0.78, runCursorX + colW / 2, upperBaseY + 0.035, -0.04, chromeMat);
              addBox(assembly, colW * 0.42, uHeight, 0.22, runCursorX + colW / 2, upperBaseY + uHeight / 2, -depth / 2 + 0.13, metalHandleMat);
            } else {
              let trimLeft = false;
              let trimRight = false;
              if (hasWingUpperAtCorner && c.widthCm > (cfg.upperDepthCm || 32) + 24) {
                if (isLeftCorner && idx === 0) trimLeft = true;
                if (!isLeftCorner && idx === cfg.columns.length - 1) trimRight = true;
              }
              const offsetX = trimLeft ? uDepth : 0;
              const trimmedWCm =
                trimLeft || trimRight
                  ? Math.max(25, c.widthCm - (cfg.upperDepthCm || 32))
                  : c.widthCm;

              const singleGroup = new THREE.Group();
              singleGroup.position.set(runCursorX + offsetX, 0, -(depth - uDepth) / 2);
              buildRun(
                singleGroup,
                [makeUpperCol(c, 'door_left', trimmedWCm)],
                uHeight,
                uDepth,
                0,
                counterT,
                carcassMat,
                frontMat,
                counterMat,
                true,
                true,
                upperBaseY,
                `upper_${c.id}`,
                resolveDecorMat,
              );
              assembly.add(singleGroup);
            }
          }
          runCursorX += colW;
        });
      }

      // L-Shaped perpendicular wing with blind corner & 6 cm filler strip (supports Right OR Left cornerSide)
      if (cfg.layoutShape === 'l_shape' && cfg.wingColumns.length > 0) {
        const wingW = cfg.wingColumns.reduce((s, c) => s + c.widthCm / 100, 0);
        const wingGroup = new THREE.Group();

        // Blind corner box + 6 cm filler
        addBox(wingGroup, depth, totalH - plinthH, depth, depth / 2, plinthH + (totalH - plinthH) / 2, depth / 2, carcassMat);
        addBox(
          wingGroup,
          FILLER_W,
          totalH - plinthH,
          BOARD_T,
          isLeftCorner ? depth - FILLER_W / 2 : depth + FILLER_W / 2,
          plinthH + (totalH - plinthH) / 2,
          depth + BOARD_T / 2,
          frontMat,
        );
        if (isKitchen) {
          addBox(wingGroup, depth + 0.024, counterT, depth + 0.024, depth / 2 + (isLeftCorner ? -0.012 : 0.012), totalH + counterT / 2, depth / 2 + 0.012, counterMat);
          addBox(wingGroup, 0.02, 0.018, depth, isLeftCorner ? 0.012 : depth - 0.012, totalH + counterT + 0.009, depth / 2, aluFrameMat, false);
          if (cfg.includeCornerMechanism) {
            addBox(wingGroup, depth * 0.68, 0.014, depth * 0.52, depth * 0.52, plinthH + (totalH - plinthH) * 0.34, depth * 0.48, chromeMat, false);
            addBox(wingGroup, depth * 0.68, 0.014, depth * 0.52, depth * 0.52, plinthH + (totalH - plinthH) * 0.68, depth * 0.48, chromeMat, false);
            addBox(wingGroup, 0.022, (totalH - plinthH) * 0.72, 0.022, depth * 0.85, plinthH + (totalH - plinthH) * 0.5, depth * 0.75, aluFrameMat, false);
          }
          if (cfg.includeBacksplash) {
            addBox(
              wingGroup,
              backT,
              backH,
              depth + FILLER_W + wingW,
              isLeftCorner ? backT / 2 : depth - backT / 2,
              totalH + counterT + backH / 2,
              (depth + FILLER_W + wingW) / 2,
              backsplashMat,
              false,
            );
          }
        }

        const wingRun = new THREE.Group();
        if (isLeftCorner) {
          wingRun.rotation.y = Math.PI / 2;
          wingRun.position.set(depth / 2, 0, depth + FILLER_W + wingW);
        } else {
          wingRun.rotation.y = -Math.PI / 2;
          wingRun.position.set(depth / 2, 0, depth + FILLER_W);
        }
        buildRun(
          wingRun,
          cfg.wingColumns,
          totalH,
          depth,
          plinthH,
          counterT,
          carcassMat,
          frontMat,
          counterMat,
          isKitchen,
          false,
          0,
          'wing',
          resolveDecorMat,
        );
        wingGroup.add(wingRun);

        // Wing Upper Cabinets + Corner Return Upper Junction (when enabled for kitchen)
        if (isKitchen && cfg.includeUpperCabinets && cfg.includeWingUpperCabinets !== false) {
          const mainCornerCol = isLeftCorner ? cfg.columns[0] : cfg.columns[cfg.columns.length - 1];
          const mainCornerWasTrimmed = Boolean(
            hasWingUpperAtCorner &&
              mainCornerCol &&
              (mainCornerCol.heightCm || cfg.heightCm) <= 130 &&
              mainCornerCol.upperType !== 'none' &&
              mainCornerCol.widthCm > (cfg.upperDepthCm || 32) + 24,
          );

          if (hasWingUpperAtCorner && cornerAdjacentWingCol) {
            const cornerMatId =
              cornerAdjacentWingCol.upperFrontDecorId ||
              cornerAdjacentWingCol.frontDecorId ||
              cfg.frontDecorId;
            const cornerUpperMat = resolveDecorMat(cornerMatId, true);
            if (mainCornerWasTrimmed) {
              addBox(
                wingGroup,
                uDepth,
                uHeight,
                uDepth,
                isLeftCorner ? uDepth / 2 : depth - uDepth / 2,
                upperBaseY + uHeight / 2,
                uDepth / 2,
                cornerUpperMat,
              );
            }
          }

          const cornerReturnSpanM = Math.max(0.24, depth + FILLER_W - uDepth);
          const cornerReturnCol: ColumnConfig | null =
            hasWingUpperAtCorner && cornerAdjacentWingCol
              ? makeUpperCol(
                  {
                    ...cornerAdjacentWingCol,
                    id: `${cornerAdjacentWingCol.id}_cret`,
                    widthCm: Math.round(cornerReturnSpanM * 100),
                  },
                  isLeftCorner ? 'door_right' : 'door_left',
                )
              : null;

          // Group contiguous wing upper columns so LED strips & doors span seamlessly
          interface WingUpperSegment {
            startLx: number;
            cols: ColumnConfig[];
          }
          const segments: WingUpperSegment[] = [];
          let curLx = 0;
          let activeSeg: WingUpperSegment | null = null;
          cfg.wingColumns.forEach((wc, wIdx) => {
            const wcW = wc.widthCm / 100;
            const wantsUpper = (wc.heightCm || cfg.heightCm) <= 130 && wc.upperType !== 'none';
            if (wantsUpper) {
              const upCol = makeUpperCol(wc, isLeftCorner ? 'door_right' : 'door_left');
              if (!activeSeg) {
                activeSeg = { startLx: curLx, cols: [] };
                if (!isLeftCorner && wIdx === 0 && cornerReturnCol) {
                  activeSeg.startLx -= cornerReturnCol.widthCm / 100;
                  activeSeg.cols.push(cornerReturnCol);
                }
                segments.push(activeSeg);
              }
              activeSeg.cols.push(upCol);
              if (isLeftCorner && wIdx === cfg.wingColumns.length - 1 && cornerReturnCol) {
                activeSeg.cols.push(cornerReturnCol);
              }
            } else {
              activeSeg = null;
            }
            curLx += wcW;
          });

          segments.forEach((seg, sIdx) => {
            const wingUpperGroup = new THREE.Group();
            if (isLeftCorner) {
              wingUpperGroup.rotation.y = Math.PI / 2;
              wingUpperGroup.position.set(uDepth / 2, 0, depth + FILLER_W + wingW - seg.startLx);
            } else {
              wingUpperGroup.rotation.y = -Math.PI / 2;
              wingUpperGroup.position.set(depth - uDepth / 2, 0, depth + FILLER_W + seg.startLx);
            }
            buildRun(
              wingUpperGroup,
              seg.cols,
              uHeight,
              uDepth,
              0,
              counterT,
              carcassMat,
              frontMat,
              counterMat,
              true,
              true,
              upperBaseY,
              `wing_upper_${sIdx}`,
              resolveDecorMat,
            );
            wingGroup.add(wingUpperGroup);
          });
        }

        wingGroup.position.set(isLeftCorner ? 0 : mainRunW - depth, 0, -depth / 2);
        assembly.add(wingGroup);
      }

      // Render secondary floating wall cabinets, shelves, hooks, round mirror, or TV backdrop addons
      if (Array.isArray(cfg.wallDecorItems) && cfg.wallDecorItems.length > 0) {
        cfg.wallDecorItems.forEach((addon) => {
          const ax = addon.xCm / 100;
          const ay = addon.elevationCm / 100;
          const aw = addon.widthCm / 100;
          const ah = addon.heightCm / 100;
          const ad = addon.depthCm / 100;
          const addonCarcass = addon.carcassDecorId ? resolveDecorMat(addon.carcassDecorId, false) : carcassMat;
          const backWallZ = -depth / 2;

          if (addon.kind === 'cabinet') {
            const cabGroup = new THREE.Group();
            cabGroup.position.set(ax, 0, -(depth - ad) / 2);
            buildRun(
              cabGroup,
              [
                {
                  id: addon.id,
                  widthCm: addon.widthCm,
                  heightCm: addon.heightCm,
                  isSuspended: true,
                  elevationCm: addon.elevationCm,
                  carcassDecorId: addon.carcassDecorId,
                  frontDecorId: addon.frontDecorId,
                  slots:
                    addon.slots && addon.slots.length > 0
                      ? addon.slots
                      : [{ id: `${addon.id}_s`, heightRatio: 1, type: 'open_shelves', internalShelves: 1 }],
                },
              ],
              ah,
              ad,
              0,
              counterT,
              carcassMat,
              frontMat,
              counterMat,
              false,
              false,
              0,
              `addon_${addon.id}`,
              resolveDecorMat,
            );
            assembly.add(cabGroup);
          } else if (addon.kind === 'shelf') {
            addBox(
              assembly,
              aw,
              Math.max(0.036, ah),
              ad,
              ax + aw / 2,
              ay + ah / 2,
              backWallZ + ad / 2,
              addonCarcass,
            );
          } else if (addon.kind === 'coat_hooks') {
            const count = Math.max(2, addon.hooksCount || 5);
            for (let hk = 0; hk < count; hk++) {
              const hx = ax + (aw * (hk + 0.5)) / count;
              addBox(assembly, 0.014, 0.058, 0.012, hx, ay, backWallZ + 0.006, metalHandleMat, false);
              addBox(assembly, 0.014, 0.022, 0.032, hx, ay - 0.015, backWallZ + 0.02, metalHandleMat, false);
            }
          } else if (addon.kind === 'round_mirror') {
            const radius = Math.max(0.18, aw / 2);
            const ringGeo = new THREE.CylinderGeometry(radius, radius, 0.032, 36);
            const ringMesh = new THREE.Mesh(ringGeo, addonCarcass);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.position.set(ax + aw / 2, ay, backWallZ + 0.016);
            ringMesh.castShadow = true;
            ringMesh.receiveShadow = true;
            assembly.add(ringMesh);

            const glassGeo = new THREE.CylinderGeometry(radius - 0.022, radius - 0.022, 0.036, 36);
            const glassMesh = new THREE.Mesh(glassGeo, mirrorMat);
            glassMesh.rotation.x = Math.PI / 2;
            glassMesh.position.set(ax + aw / 2, ay, backWallZ + 0.018);
            assembly.add(glassMesh);
          } else if (addon.kind === 'tv_panel') {
            addBox(assembly, aw, ah, 0.025, ax + aw / 2, ay + ah / 2, backWallZ + 0.014, aluFrameMat, false);
            addBox(assembly, aw - 0.035, ah - 0.035, 0.008, ax + aw / 2, ay + ah / 2, backWallZ + 0.028, ovenGlassMat, false);
            addBox(assembly, aw * 0.65, 0.045, 0.065, ax + aw / 2, (cfg.columns[0]?.elevationCm ?? 24) / 100 + cfg.heightCm / 100 + 0.025, 0, aluFrameMat, false);
          }
        });
      }

      // Center assembly horizontally around X=0
      assembly.position.x = -mainRunW / 2;
      furnitureRoot.add(assembly);
      furnitureRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          measureTargets.push(obj);
        }
      });

      rebuildRoomShell();
      rebuildDimensions();
      requestRender();
    };

    const rebuildRoomShell = () => {
      disposeGroup(roomRoot);
      if (furnitureRoot.children.length === 0) {
        const emptyWallH = 2.95;
        const emptyBackW = 5.4;
        const emptyBackZ = -0.35;
        const emptySideD = 4.2;
        const emptySideX = -emptyBackW / 2;

        const backWall = new THREE.Mesh(
          new THREE.PlaneGeometry(emptyBackW, emptyWallH),
          wallMat,
        );
        backWall.position.set(0, emptyWallH / 2, emptyBackZ);
        backWall.receiveShadow = true;
        backWall.raycast = () => {};
        roomRoot.add(backWall);

        const sideWall = new THREE.Mesh(
          new THREE.PlaneGeometry(emptySideD, emptyWallH),
          wallMat,
        );
        sideWall.position.set(emptySideX, emptyWallH / 2, emptyBackZ + emptySideD / 2);
        sideWall.rotation.y = Math.PI / 2;
        sideWall.receiveShadow = true;
        sideWall.raycast = () => {};
        roomRoot.add(sideWall);

        const baseH = 0.095;
        const baseT = 0.016;
        const backSkirt = addBox(
          roomRoot,
          emptyBackW,
          baseH,
          baseT,
          0,
          baseH / 2,
          emptyBackZ + baseT / 2,
          baseboardMat,
          false,
        );
        backSkirt.raycast = () => {};

        const sideSkirt = addBox(
          roomRoot,
          baseT,
          baseH,
          emptySideD,
          emptySideX + baseT / 2,
          baseH / 2,
          emptyBackZ + emptySideD / 2,
          baseboardMat,
          false,
        );
        sideSkirt.raycast = () => {};
        return;
      }

      furnitureRoot.updateMatrixWorld(true);
      _boxTmp.setFromObject(furnitureRoot);
      if (_boxTmp.isEmpty()) return;

      const cfg = configRef.current;
      const isLeftCorner = cfg.cornerSide === 'left';
      const wallH = Math.max(2.95, _boxTmp.max.y + 0.65);
      const padLeft = isLeftCorner && cfg.layoutShape === 'l_shape' ? 0.008 : 1.45;
      const padRight = !isLeftCorner && cfg.layoutShape === 'l_shape' ? 0.008 : 1.45;
      const backZ = _boxTmp.min.z - 0.006;
      const wallLeftX = _boxTmp.min.x - padLeft;
      const wallRightX = _boxTmp.max.x + padRight;
      const backW = Math.max(4.5, wallRightX - wallLeftX);
      const backCenterX = (wallLeftX + wallRightX) * 0.5;

      // Back Plaster Wall (single-sided inward facing so back camera orbit is never obstructed)
      const backWallGeo = new THREE.PlaneGeometry(backW, wallH);
      const backWall = new THREE.Mesh(backWallGeo, wallMat);
      backWall.position.set(backCenterX, wallH / 2, backZ);
      backWall.receiveShadow = true;
      backWall.raycast = () => {};
      roomRoot.add(backWall);

      // Corner Side Return Wall + Baseboard Skirting
      const sideD = Math.max(3.6, _boxTmp.max.z - backZ + 1.5);
      const sideCenterZ = backZ + sideD / 2;
      const sideWallGeo = new THREE.PlaneGeometry(sideD, wallH);
      const useRightCornerWall = cfg.layoutShape === 'l_shape' && !isLeftCorner;
      const sideWallX = useRightCornerWall ? wallRightX : wallLeftX;
      const sideWall = new THREE.Mesh(sideWallGeo, wallMat);
      sideWall.position.set(sideWallX, wallH / 2, sideCenterZ);
      sideWall.rotation.y = useRightCornerWall ? -Math.PI / 2 : Math.PI / 2;
      sideWall.receiveShadow = true;
      sideWall.raycast = () => {};
      roomRoot.add(sideWall);

      // Architectural skirting baseboard (9.5 cm tall) along open spans of back wall & corner side wall
      const baseH = 0.095;
      const baseT = 0.016;
      if (_boxTmp.min.x - wallLeftX > 0.06) {
        const spanW = _boxTmp.min.x - wallLeftX;
        const leftSkirt = addBox(
          roomRoot,
          spanW,
          baseH,
          baseT,
          wallLeftX + spanW / 2,
          baseH / 2,
          backZ + baseT / 2,
          baseboardMat,
          false,
        );
        leftSkirt.raycast = () => {};
      }
      if (wallRightX - _boxTmp.max.x > 0.06) {
        const spanW = wallRightX - _boxTmp.max.x;
        const rightSkirt = addBox(
          roomRoot,
          spanW,
          baseH,
          baseT,
          _boxTmp.max.x + spanW / 2,
          baseH / 2,
          backZ + baseT / 2,
          baseboardMat,
          false,
        );
        rightSkirt.raycast = () => {};
      }

      // Open portion of side return wall in front of the furniture
      const sideFrontStartZ = cfg.layoutShape === 'l_shape' ? _boxTmp.max.z : _boxTmp.max.z;
      const sideFrontLimitZ = backZ + sideD;
      const sideOpenZ = cfg.layoutShape === 'l_shape' ? sideFrontStartZ : backZ;
      if (sideFrontLimitZ - sideOpenZ > 0.1) {
        const len = sideFrontLimitZ - sideOpenZ;
        const sideSkirt = addBox(
          roomRoot,
          baseT,
          baseH,
          len,
          useRightCornerWall ? sideWallX - baseT / 2 : sideWallX + baseT / 2,
          baseH / 2,
          sideOpenZ + len / 2,
          baseboardMat,
          false,
        );
        sideSkirt.raycast = () => {};
      }

      // Ground Contact AO Halo underneath furniture footprint (adds crisp architectural depth on floor)
      const aoW = Math.max(0.8, _boxTmp.max.x - _boxTmp.min.x + 0.65);
      const aoD = Math.max(0.6, _boxTmp.max.z - _boxTmp.min.z + 0.65);
      const aoPlane = new THREE.Mesh(new THREE.PlaneGeometry(aoW, aoD), aoShadowMat);
      aoPlane.rotation.x = -Math.PI / 2;
      aoPlane.position.set(
        (_boxTmp.min.x + _boxTmp.max.x) * 0.5,
        0.0008,
        (_boxTmp.min.z + _boxTmp.max.z) * 0.5,
      );
      aoPlane.raycast = () => {};
      roomRoot.add(aoPlane);
    };

    const createLabelSprite = (
      text: string,
      borderColor = '#E2AC76',
      bgColor = '#111622',
      textColor = '#FFF8EE',
      scaleW = 0.44,
      scaleH = 0.11,
    ) => {
      const canvas = document.createElement('canvas');
      canvas.width = 340;
      canvas.height = 84;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 18);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = textColor;
        ctx.font = 'bold 32px Inter, system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(scaleW, scaleH, 1);
      sprite.renderOrder = 25;
      sprite.raycast = () => {};
      return sprite;
    };

    const addDimensionLine = (
      parent: THREE.Group,
      start: THREE.Vector3,
      end: THREE.Vector3,
      extStart: THREE.Vector3 | null,
      extEnd: THREE.Vector3 | null,
      label: string,
      labelOffset: THREE.Vector3,
      colorHex = 0xb47b44,
      scaleW = 0.44,
      scaleH = 0.11,
    ) => {
      const mainGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
      const mainMat = new THREE.LineBasicMaterial({ color: colorHex, depthTest: false });
      const mainLine = new THREE.Line(mainGeo, mainMat);
      mainLine.renderOrder = 20;
      mainLine.raycast = () => {};
      parent.add(mainLine);

      if (extStart && extEnd) {
        const extGeo = new THREE.BufferGeometry().setFromPoints([extStart, start, extEnd, end]);
        const extMat = new THREE.LineBasicMaterial({
          color: 0x64748b,
          transparent: true,
          opacity: 0.55,
          depthTest: false,
        });
        const extLines = new THREE.LineSegments(extGeo, extMat);
        extLines.renderOrder = 19;
        extLines.raycast = () => {};
        parent.add(extLines);
      }

      [start, end].forEach((pt) => {
        const dotGeo = new THREE.SphereGeometry(0.013, 10, 10);
        const dotMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(pt);
        dot.renderOrder = 21;
        dot.raycast = () => {};
        parent.add(dot);
      });

      const mid = start.clone().add(end).multiplyScalar(0.5).add(labelOffset);
      const sprite = createLabelSprite(label, '#E2AC76', '#111622', '#FFF8EE', scaleW, scaleH);
      sprite.position.copy(mid);
      parent.add(sprite);
    };

    const rebuildDimensions = () => {
      disposeGroup(dimensionsRoot);
      if (!showDimensionsRef.current || furnitureRoot.children.length === 0) {
        requestRender();
        return;
      }

      furnitureRoot.updateMatrixWorld(true);
      _boxTmp.setFromObject(furnitureRoot);
      if (_boxTmp.isEmpty()) return;

      const min = _boxTmp.min;
      const max = _boxTmp.max;
      const wMm = Math.round((max.x - min.x) * 1000);
      const hMm = Math.round((max.y - min.y) * 1000);
      const dMm = Math.round((max.z - min.z) * 1000);
      const isBg = lang === 'bg';
      const unitMm = isBg ? 'мм' : 'mm';

      // 1. Total Width (front floor rail, in millimeters)
      const wZ = max.z + 0.28;
      addDimensionLine(
        dimensionsRoot,
        new THREE.Vector3(min.x, 0.015, wZ),
        new THREE.Vector3(max.x, 0.015, wZ),
        new THREE.Vector3(min.x, 0.015, max.z + 0.03),
        new THREE.Vector3(max.x, 0.015, max.z + 0.03),
        `${isBg ? 'Ш' : 'W'}: ${wMm} ${unitMm}`,
        new THREE.Vector3(0, 0.08, 0.04),
      );

      // 1b. Per-bay widths along main run in millimeters
      const cfg = configRef.current;
      if (!isolatedModeRef.current && cfg.columns.length > 1) {
        const mainRunW = cfg.columns.reduce((s, c) => s + c.widthCm / 100, 0);
        let bayX = -mainRunW / 2;
        const bayLineZ = max.z + 0.11;
        cfg.columns.forEach((col) => {
          const bw = col.widthCm / 100;
          const bMm = Math.round(col.widthCm * 10);
          addDimensionLine(
            dimensionsRoot,
            new THREE.Vector3(bayX + 0.008, 0.012, bayLineZ),
            new THREE.Vector3(bayX + bw - 0.008, 0.012, bayLineZ),
            null,
            null,
            `${bMm} ${unitMm}`,
            new THREE.Vector3(0, 0.055, 0),
            0xb47b44,
            0.29,
            0.074,
          );
          bayX += bw;
        });
      }

      // 2. Total Height (left side vertical rail, in millimeters)
      const hX = min.x - 0.24;
      const hZ = (min.z + max.z) * 0.5;
      addDimensionLine(
        dimensionsRoot,
        new THREE.Vector3(hX, min.y, hZ),
        new THREE.Vector3(hX, max.y, hZ),
        new THREE.Vector3(min.x - 0.03, min.y, hZ),
        new THREE.Vector3(min.x - 0.03, max.y, hZ),
        `${isBg ? 'В' : 'H'}: ${hMm} ${unitMm}`,
        new THREE.Vector3(-0.24, 0, 0),
      );

      // 3. Total Depth (left side floor rail, in millimeters)
      const dX = min.x - 0.24;
      addDimensionLine(
        dimensionsRoot,
        new THREE.Vector3(dX, 0.015, min.z),
        new THREE.Vector3(dX, 0.015, max.z),
        new THREE.Vector3(min.x - 0.03, 0.015, min.z),
        new THREE.Vector3(min.x - 0.03, 0.015, max.z),
        `${isBg ? 'Д' : 'D'}: ${dMm} ${unitMm}`,
        new THREE.Vector3(-0.2, 0.08, 0),
      );

      requestRender();
    };

    const rebuildMeasureVisuals = () => {
      disposeGroup(measureRoot);
      if (!measureModeRef.current && measurePoints.length === 0) {
        requestRender();
        return;
      }

      const addMarker = (pt: THREE.Vector3, colorHex: number, radius = 0.02) => {
        const g = new THREE.SphereGeometry(radius, 14, 14);
        const m = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.copy(pt);
        mesh.renderOrder = 31;
        mesh.raycast = () => {};
        measureRoot.add(mesh);
      };

      if (hoverMeasurePoint && measureModeRef.current) {
        addMarker(hoverMeasurePoint, 0x38bdf8, 0.013);
      }

      if (measurePoints.length >= 1) {
        addMarker(measurePoints[0], 0x10b981, 0.022);
      }

      const targetPt =
        measurePoints.length >= 2
          ? measurePoints[1]
          : measurePoints.length === 1 && hoverMeasurePoint
            ? hoverMeasurePoint
            : null;

      if (measurePoints.length >= 1 && targetPt) {
        if (measurePoints.length >= 2) {
          addMarker(targetPt, 0x10b981, 0.022);
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints([measurePoints[0], targetPt]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, depthTest: false });
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 30;
        line.raycast = () => {};
        measureRoot.add(line);

        const distM = measurePoints[0].distanceTo(targetPt);
        const distMm = Math.round(distM * 1000);
        const distCm = Math.round(distM * 1000) / 10;
        const unitLabel = lang === 'bg' ? `${distMm} мм (${distCm.toFixed(1)} см)` : `${distMm} mm (${distCm.toFixed(1)} cm)`;
        const mid = measurePoints[0].clone().add(targetPt).multiplyScalar(0.5);
        mid.y += 0.085;
        const sprite = createLabelSprite(
          unitLabel,
          '#22D3EE',
          '#0B1420',
          '#ECFEFF',
          0.56,
          0.11,
        );
        sprite.position.copy(mid);
        measureRoot.add(sprite);
      }

      requestRender();
    };

    rebuildDimensionsFnRef.current = rebuildDimensions;
    clearMeasureFnRef.current = () => {
      measurePoints = [];
      hoverMeasurePoint = null;
      setMeasureReadout(null);
      rebuildMeasureVisuals();
    };

    rebuildFnRef.current = rebuildScene;

    centerCameraFnRef.current = () => {
      furnitureRoot.updateMatrixWorld(true);
      _boxTmp.setFromObject(furnitureRoot);
      if (_boxTmp.isEmpty()) {
        cameraGoal = {
          pos: new THREE.Vector3(2.2, 1.55, 2.55),
          target: new THREE.Vector3(0, 0.72, 0),
        };
        requestRender();
        return;
      }
      _boxTmp.getCenter(_centerTmp);
      _boxTmp.getSize(_sizeTmp);
      const maxSpan = Math.max(_sizeTmp.x, _sizeTmp.y, _sizeTmp.z, 0.85);
      const dist = Math.max(1.9, maxSpan * 1.48);
      cameraGoal = {
        pos: new THREE.Vector3(
          _centerTmp.x + dist * 0.74,
          _centerTmp.y + dist * 0.44,
          _centerTmp.z + dist * 0.82,
        ),
        target: _centerTmp.clone(),
      };
      requestRender();
    };

    panNudgeFnRef.current = (dx: number, dy = 0) => {
      const basePos = (cameraGoal ? cameraGoal.pos : camera.position).clone();
      const baseTarget = (cameraGoal ? cameraGoal.target : controls.target).clone();
      const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      const offset = rightVec.multiplyScalar(dx).addScaledVector(upVec, dy);
      cameraGoal = {
        pos: basePos.add(offset),
        target: baseTarget.add(offset),
      };
      requestRender();
    };

    cameraPresetFnRef.current = (preset: CameraPreset) => {
      const cfg = configRef.current;
      const isolatedCol = findIsolatedColumn(cfg);
      const wM = isolatedCol
        ? Math.max(0.45, isolatedCol.widthCm / 100)
        : Math.max(1.2, cfg.widthCm / 100);
      const hM = isolatedCol
        ? Math.max(0.55, cfg.heightCm / 100)
        : Math.max(
            0.8,
            (cfg.category === 'kitchen' && cfg.includeUpperCabinets
              ? cfg.heightCm + 120
              : cfg.heightCm) / 100,
          );
      const dM = Math.max(0.4, cfg.depthCm / 100);
      const dist = isolatedCol
        ? Math.max(1.25, Math.max(wM, hM, dM) * 1.95)
        : Math.max(2.2, Math.max(wM, hM) * 1.45);
      const targetY = hM * 0.48;

      if (preset === 'front') {
        cameraGoal = {
          pos: new THREE.Vector3(0, targetY + 0.08, dist),
          target: new THREE.Vector3(0, targetY, 0),
        };
      } else if (preset === 'back') {
        cameraGoal = {
          pos: new THREE.Vector3(0, targetY + 0.08, -dist),
          target: new THREE.Vector3(0, targetY, 0),
        };
      } else if (preset === 'top') {
        cameraGoal = {
          pos: new THREE.Vector3(0, targetY + dist * 1.28, 0.04),
          target: new THREE.Vector3(0, targetY * 0.35, 0),
        };
      } else if (preset === 'bottom') {
        cameraGoal = {
          pos: new THREE.Vector3(0, -dist * 1.08, 0.28),
          target: new THREE.Vector3(0, targetY * 0.4, 0),
        };
      } else if (preset === 'side_left') {
        cameraGoal = {
          pos: new THREE.Vector3(-dist, targetY + 0.12, 0.04),
          target: new THREE.Vector3(0, targetY, 0),
        };
      } else if (preset === 'side_right') {
        cameraGoal = {
          pos: new THREE.Vector3(dist, targetY + 0.12, 0.04),
          target: new THREE.Vector3(0, targetY, 0),
        };
      } else if (preset === 'iso_sw') {
        // Front-Left Isometric (SW)
        cameraGoal = {
          pos: new THREE.Vector3(-dist * 0.74, targetY + dist * 0.46, dist * 0.8),
          target: new THREE.Vector3(0, targetY, 0),
        };
      } else if (preset === 'iso_nw') {
        // Back-Left Isometric (NW)
        cameraGoal = {
          pos: new THREE.Vector3(-dist * 0.74, targetY + dist * 0.52, -dist * 0.8),
          target: new THREE.Vector3(0, targetY, 0),
        };
      } else if (preset === 'iso_ne') {
        // Back-Right Isometric (NE)
        cameraGoal = {
          pos: new THREE.Vector3(dist * 0.74, targetY + dist * 0.52, -dist * 0.8),
          target: new THREE.Vector3(0, targetY, 0),
        };
      } else {
        // Front-Right Isometric (SE / Default ISO)
        cameraGoal = {
          pos: new THREE.Vector3(dist * 0.74, targetY + dist * 0.46, dist * 0.8),
          target: new THREE.Vector3(0, targetY, 0),
        };
      }
      requestRender();
    };

    const pickMeasurePoint = (e: PointerEvent): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(measureTargets, false);
      if (hits.length > 0) {
        const hitPt = hits[0].point.clone();
        // Snap gently to nearest bounding corner of the hit board if within 3.2 cm
        _objBoxTmp.setFromObject(hits[0].object);
        const xs = [_objBoxTmp.min.x, _objBoxTmp.max.x];
        const ys = [_objBoxTmp.min.y, _objBoxTmp.max.y];
        const zs = [_objBoxTmp.min.z, _objBoxTmp.max.z];
        let bestCorner: THREE.Vector3 | null = null;
        let bestDist = 0.032;
        for (const cx of xs) {
          for (const cy of ys) {
            for (const cz of zs) {
              const d = Math.hypot(hitPt.x - cx, hitPt.y - cy, hitPt.z - cz);
              if (d < bestDist) {
                bestDist = d;
                bestCorner = new THREE.Vector3(cx, cy, cz);
              }
            }
          }
        }
        return bestCorner ?? hitPt;
      }

      if (raycaster.ray.intersectPlane(_floorPlane, _planeHitTmp)) {
        if (Math.hypot(_planeHitTmp.x, _planeHitTmp.z) <= 6) {
          return _planeHitTmp.clone();
        }
      }
      return null;
    };

    // Raycasting for clicking doors/drawers OR 2-point measuring
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastHoverRaycast = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!measureModeRef.current) return;
      const now = performance.now();
      if (now - lastHoverRaycast < 33) return;
      lastHoverRaycast = now;

      const pt = pickMeasurePoint(e);
      hoverMeasurePoint = pt;
      if (measurePoints.length === 1 && pt) {
        const d = measurePoints[0].distanceTo(pt);
        setMeasureReadout({
          hasFirstPoint: true,
          hasSecondPoint: false,
          distanceMm: Math.round(d * 1000),
          distanceCm: Math.round(d * 1000) / 10,
          dxMm: Math.round(Math.abs(pt.x - measurePoints[0].x) * 1000),
          dyMm: Math.round(Math.abs(pt.y - measurePoints[0].y) * 1000),
          dzMm: Math.round(Math.abs(pt.z - measurePoints[0].z) * 1000),
        });
      }
      rebuildMeasureVisuals();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0 || panModeRef.current) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6) return; // Was an orbit drag, not a click

      if (measureModeRef.current) {
        const pt = pickMeasurePoint(e);
        if (!pt) return;
        if (measurePoints.length === 0 || measurePoints.length >= 2) {
          measurePoints = [pt];
          setMeasureReadout({
            hasFirstPoint: true,
            hasSecondPoint: false,
            distanceMm: 0,
            distanceCm: 0,
            dxMm: 0,
            dyMm: 0,
            dzMm: 0,
          });
        } else {
          measurePoints = [measurePoints[0], pt];
          const d = measurePoints[0].distanceTo(pt);
          setMeasureReadout({
            hasFirstPoint: true,
            hasSecondPoint: true,
            distanceMm: Math.round(d * 1000),
            distanceCm: Math.round(d * 1000) / 10,
            dxMm: Math.round(Math.abs(pt.x - measurePoints[0].x) * 1000),
            dyMm: Math.round(Math.abs(pt.y - measurePoints[0].y) * 1000),
            dzMm: Math.round(Math.abs(pt.z - measurePoints[0].z) * 1000),
          });
        }
        rebuildMeasureVisuals();
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitData = hits[0].object.userData as {
          jointId?: string;
          colId?: string;
          slotIdx?: number;
        };
        if (hitData.colId) {
          onSelectColumnRef.current(hitData.colId, hitData.slotIdx);
        }
        if (!swapModeActiveRef.current && hitData.jointId) {
          const next = !(openMapRef.current.get(hitData.jointId) ?? false);
          openMapRef.current.set(hitData.jointId, next);
          const joint = jointsRef.current.find((j) => j.id === hitData.jointId);
          if (joint) {
            joint.targetOpen = next ? 1 : 0;
            requestRender();
          }
        }
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    rebuildScene();
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      disposeGroup(roomRoot);
      disposeGroup(dimensionsRoot);
      disposeGroup(measureRoot);
      controls.dispose();
      floorTex.dispose();
      floorRoughTex.dispose();
      floorBumpTex.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      wallTex.dispose();
      wallMat.dispose();
      baseboardMat.dispose();
      aoShadowTex.dispose();
      aoShadowMat.dispose();
      hobZoneTex.dispose();
      hobTopMat.dispose();
      metalHandleMat.dispose();
      chromeMat.dispose();
      runnerSteelMat.dispose();
      golaProfileMat.dispose();
      blumAccentMat.dispose();
      selectionAccentMat.dispose();
      hdfMat.dispose();
      plinthMat.dispose();
      shadowGapMat.dispose();
      sinkBowlMat.dispose();
      ovenGlassMat.dispose();
      applianceWhiteMat.dispose();
      ledEmissiveMat.dispose();
      emberLedMat.dispose();
      vitrineGlassMat.dispose();
      vitrineFrameMat.dispose();
      aluFrameMat.dispose();
      mirrorMat.dispose();
      cushionMat.dispose();
      if (xrayFrontMat) {
        xrayFrontMat.dispose();
      }
      disposeDecorMaterials();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild 3D geometry whenever configuration, decors, selection, isolation, or transparency change
  useEffect(() => {
    rebuildFnRef.current?.();
  }, [config, decors, selectedColumnId, isolatedMode, seeInside]);

  // Toggle dimension lines cleanly without rebuilding the entire cabinet scene
  useEffect(() => {
    rebuildDimensionsFnRef.current?.();
  }, [showDimensions]);

  // Reset measurement markers when exiting Measure mode
  useEffect(() => {
    if (!measureMode) {
      clearMeasureFnRef.current?.();
    }
  }, [measureMode]);

  // Forward live measurement readout up to top bar when measuring
  useEffect(() => {
    onMeasureReadoutRef.current?.(measureReadout);
  }, [measureReadout]);

  // Trigger Clear Measure from top bar
  useEffect(() => {
    if (clearMeasureTriggerSeq > 0) {
      clearMeasureFnRef.current?.();
    }
  }, [clearMeasureTriggerSeq]);

  // Trigger Center Camera View from outside Ribbon/HUD
  useEffect(() => {
    if (centerTriggerSeq > 0) {
      centerCameraFnRef.current?.();
    }
  }, [centerTriggerSeq]);

  // Smoothly frame camera when entering or exiting Isolated Cabinet mode
  useEffect(() => {
    cameraPresetFnRef.current?.('iso');
  }, [isolatedMode]);

  // Trigger camera presets controlled from side panel
  useEffect(() => {
    if (cameraPresetTrigger) {
      cameraPresetFnRef.current?.(cameraPresetTrigger.preset);
    }
  }, [cameraPresetTrigger]);

  // Sync Open All / Close All controlled from side panel
  useEffect(() => {
    jointsRef.current.forEach((j) => {
      openMapRef.current.set(j.id, allOpen);
      j.targetOpen = allOpen ? 1 : 0;
    });
    requestRenderFnRef.current?.();
  }, [allOpen]);

  // Sync Pan Mode controlled from bottom bar
  useEffect(() => {
    panModeFnRef.current?.(panMode);
  }, [panMode]);

  // Trigger camera pan nudge (← / → arrows)
  useEffect(() => {
    if (panNudgeTrigger) {
      panNudgeFnRef.current?.(panNudgeTrigger.dx, panNudgeTrigger.dy ?? 0);
    }
  }, [panNudgeTrigger]);

  // Sync Lighting Mode controlled from side panel
  useEffect(() => {
    lightModeFnRef.current?.(lightingMode);
  }, [lightingMode]);

  const isEmpty = config.columns.length === 0 && config.wingColumns.length === 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F2EFE9]">
      {/* Clean Full-Bleed WebGL Viewport */}
      <div
        ref={mountRef}
        className={`h-full w-full ${
          panMode
            ? 'cursor-move'
            : measureMode
              ? 'cursor-crosshair'
              : swapModeActive
                ? 'cursor-pointer'
                : 'cursor-grab active:cursor-grabbing'
        }`}
      />

      {/* Bottom-Right Corner Action Buttons */}
      {(onToggleAllOpen || onToggleFullPage) && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2">
          {onToggleAllOpen && (
            <button
              type="button"
              disabled={isEmpty}
              onClick={onToggleAllOpen}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold shadow-xl transition-colors whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none ${
                allOpen
                  ? 'bg-[#B47B44] text-white hover:bg-[#9E6835]'
                  : 'border border-[#D49B62]/60 bg-zinc-950/92 text-amber-200 hover:bg-[#B47B44] hover:text-white'
              }`}
            >
              <DoorOpen className="h-4 w-4 shrink-0" />
              <span>
                {allOpen
                  ? lang === 'bg'
                    ? 'Затвори вратите'
                    : 'Close Doors'
                  : lang === 'bg'
                    ? 'Отвори / Затвори вратите'
                    : 'Open / Close Doors'}
              </span>
            </button>
          )}

          {onToggleFullPage && (
            <button
              type="button"
              onClick={onToggleFullPage}
              title={
                isFullPage
                  ? lang === 'bg'
                    ? 'Изход от цял екран'
                    : 'Exit Full Screen'
                  : lang === 'bg'
                    ? 'Цял екран'
                    : 'Full Screen'
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold shadow-xl transition-colors whitespace-nowrap ${
                isFullPage
                  ? 'bg-[#B47B44] text-white hover:bg-[#9E6835]'
                  : 'border border-zinc-700/80 bg-zinc-950/92 text-zinc-100 hover:border-[#D49B62]/60 hover:bg-[#B47B44] hover:text-white'
              }`}
            >
              {isFullPage ? (
                <Minimize2 className="h-4 w-4 shrink-0" />
              ) : (
                <Maximize2 className="h-4 w-4 shrink-0" />
              )}
              <span>
                {isFullPage
                  ? lang === 'bg'
                    ? 'Изход от цял екран'
                    : 'Exit Full Screen'
                  : lang === 'bg'
                    ? 'Цял екран'
                    : 'Full Screen'}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
