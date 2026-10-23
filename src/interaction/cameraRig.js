// 相機與視角控制：360° 旋轉、縮放、預設視角、聚焦到零件（平滑移動）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VIEW } from '../spec/turbineSpec.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig(canvas) {
  const camera = new THREE.PerspectiveCamera(VIEW.fovDeg, 1, VIEW.near, VIEW.far);
  camera.position.fromArray(VIEW.defaultCamera);
  const controls = new OrbitControls(camera, canvas);
  controls.target.fromArray(VIEW.defaultTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = VIEW.minDistance;
  controls.maxDistance = VIEW.maxDistance;
  controls.maxPolarAngle = Math.PI / 2 - 0.03; // 不鑽到地面下
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.6;
  controls.update();

  let tween = null;

  /** 直式螢幕視野較窄：沿觀看方向拉遠，確保預設視角看得到需要的寬度 */
  function fitted(name, p) {
    const target = new THREE.Vector3().fromArray(p.target);
    const pos = new THREE.Vector3().fromArray(p.camera);
    const half = name === 'nacelle' ? VIEW.fitHalfWidth.nacelle : VIEW.fitHalfWidth.full;
    const need = half / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const d = pos.distanceTo(target);
    if (need > d) pos.sub(target).multiplyScalar(Math.min(need, VIEW.maxDistance) / d).add(target);
    return { target, pos };
  }
  const presetOf = (name) => (name === 'default' ? { target: VIEW.defaultTarget, camera: VIEW.defaultCamera } : VIEW.presets[name]);

  function flyTo(target, position, duration = VIEW.focusDurationSec) {
    tween = {
      t: 0, duration,
      fromT: controls.target.clone(), toT: new THREE.Vector3().copy(target),
      fromP: camera.position.clone(), toP: new THREE.Vector3().copy(position),
    };
  }

  function clampTarget() {
    // 平移時別讓目標跑太遠，以免小朋友找不到風機
    const t = controls.target;
    t.y = THREE.MathUtils.clamp(t.y, 0, 110);
    const h = Math.hypot(t.x, t.z);
    if (h > 80) { t.x *= 80 / h; t.z *= 80 / h; }
  }

  return {
    camera,
    controls,
    /** 聚焦到一個世界座標包圍球（保持目前的觀看方向） */
    focusSphere(center, radius) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      const fov = (camera.fov * Math.PI) / 180;
      const fit = Math.min(camera.aspect, 1);
      const dist = THREE.MathUtils.clamp((radius / Math.sin(fov / 2)) * 1.5 / fit, VIEW.minDistance + 1, VIEW.maxDistance);
      const pos = center.clone().addScaledVector(dir, dist);
      if (pos.y < 2) pos.y = 2;
      flyTo(center, pos);
    },
    preset(name) {
      const { target, pos } = fitted(name, presetOf(name));
      flyTo(target, pos);
    },
    reset() {
      const { target, pos } = fitted('default', presetOf('default'));
      flyTo(target, pos);
    },
    /** 立即跳到預設視角（截圖用，不做動畫） */
    jump(name) {
      const { target, pos } = fitted(name, presetOf(name));
      tween = null;
      controls.target.copy(target);
      camera.position.copy(pos);
      controls.update();
    },
    isAnimating: () => tween !== null,
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    /** 每幀更新（相機移動屬於介面操作，不受動畫暫停影響） */
    update(dt) {
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / tween.duration);
        const k = ease(tween.t);
        controls.target.lerpVectors(tween.fromT, tween.toT, k);
        camera.position.lerpVectors(tween.fromP, tween.toP, k);
        if (tween.t >= 1) tween = null;
      }
      clampTarget();
      controls.update();
    },
  };
}
