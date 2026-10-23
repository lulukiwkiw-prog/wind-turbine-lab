// 相機與視角控制：360° 旋轉、縮放、預設視角、聚焦到零件（平滑移動）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VIEW } from '../spec/turbineSpec.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** yawAngle：回傳偏航節點目前角度（弧度）；frame: 'yaw' 的預設視角會跟著機艙轉 */
export function createCameraRig(canvas, { yawAngle = () => 0 } = {}) {
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
  controls.addEventListener('start', () => { tween = null; follow = null; }); // 使用者自己轉動：停止自動移動

  /** 直式螢幕視野較窄：沿觀看方向拉遠，確保預設視角看得到需要的寬度 */
  function fitted(name, p) {
    const target = new THREE.Vector3().fromArray(p.target);
    const pos = new THREE.Vector3().fromArray(p.camera);
    if (p.frame === 'yaw') { // 偏航軸通過世界原點（x = z = 0），繞 +Y 旋轉即可
      const a = yawAngle();
      target.applyAxisAngle(Y_AXIS, a);
      pos.applyAxisAngle(Y_AXIS, a);
    }
    const half = VIEW.fitHalfWidth[name] ?? VIEW.fitHalfWidth.full;
    const need = half / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const d = pos.distanceTo(target);
    if (need > d) pos.sub(target).multiplyScalar(Math.min(need, VIEW.maxDistance) / d).add(target);
    return { target, pos };
  }
  const presetOf = (name) => (name === 'default' ? { target: VIEW.defaultTarget, camera: VIEW.defaultCamera } : VIEW.presets[name]);

  let follow = null; // 鏡頭沿路徑移動：{ t, duration, fn, fromT, fromP }

  function flyTo(target, position, duration = VIEW.focusDurationSec) {
    follow = null;
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
    if (h > 170) { t.x *= 170 / h; t.z *= 170 / h; } // 可以走到變電所，但不會離風機太遠
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
    /** 從某個方向（世界座標單位向量）看一個包圍球 */
    viewFrom(center, dir, radius) {
      const fov = (camera.fov * Math.PI) / 180;
      const dist = THREE.MathUtils.clamp((radius / Math.sin(fov / 2)) * 1.3 / Math.min(camera.aspect, 1), VIEW.minDistance + 0.5, VIEW.maxDistance);
      flyTo(center, center.clone().addScaledVector(dir, dist));
    },
    /**
     * 鏡頭跟著路徑走：fn(u) 回傳 u∈[0,1] 時的 { target, position }；duration 秒走完。
     * 開頭先平順地從目前位置接上路徑；使用者自己轉動畫面就停止跟隨。
     */
    followPath(fn, duration) {
      tween = null;
      follow = { t: 0, duration, fn, fromT: controls.target.clone(), fromP: camera.position.clone() };
    },
    isFollowing: () => follow !== null,
    /** 飛到指定的相機位置，看著 target（兩者都是世界座標） */
    lookFrom(target, position) { flyTo(target, position); },
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
      follow = null;
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
      } else if (follow) {
        follow.t = Math.min(follow.duration, follow.t + dt);
        const { target, position } = follow.fn(ease(follow.t / follow.duration));
        const k = ease(Math.min(1, follow.t / VIEW.focusDurationSec)); // 開頭從目前位置接上路徑
        controls.target.lerpVectors(follow.fromT, target, k);
        camera.position.lerpVectors(follow.fromP, position, k);
        if (follow.t >= follow.duration) follow = null;
      }
      clampTarget();
      controls.update();
    },
  };
}
