import * as THREE from 'three';

const ROWS = 45;
const COLUMNS = 37;
const WIDTH = 2.6;
const HEIGHT = 2.95;
const TOP = 1.5;
const FIXED_STEP = 1 / 60;
const MAX_SPLASHES = 10;
const FLOOR = -1.9;
const DEFAULTS = {
  stiffness: 72,
  tearThreshold: 1.38,
  opacity: 100,
  waterAmount: 65,
};
const clamp = THREE.MathUtils.clamp;

// A seamless woven texture generated from two intersecting sets of threads.
function makeWeave() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = Math.cos(x * Math.PI / 8);
      const weft = Math.cos(y * Math.PI / 8);
      const crossing = Math.sin(x * Math.PI / 16) * Math.sin(y * Math.PI / 16);
      const brightness = Math.round(228 + warp * 9 + weft * 9 + crossing * 6);
      const offset = (y * size + x) * 4;
      data.set([brightness, brightness, brightness, 255], offset);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 12);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeRig() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xaba89e, metalness: 0.72, roughness: 0.32 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x34383c, metalness: 0.46, roughness: 0.43 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xb4ab9f, roughness: 0.96 });

  function cylinder(radius, length, x, y, material = metal, horizontal = false) {
    const item = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), material);
    item.position.set(x, y, -0.09);
    if (horizontal) item.rotation.z = Math.PI / 2;
    item.castShadow = item.receiveShadow = true;
    group.add(item);
    return item;
  }

  const base = cylinder(1.74, 0.145, 0, FLOOR - 0.085, stone);
  base.scale.z = 0.48;
  const baseRim = cylinder(1.73, 0.045, 0, FLOOR - 0.16, charcoal);
  baseRim.scale.z = 0.48;
  for (const side of [-1, 1]) {
    const x = side * 1.5;
    cylinder(0.032, TOP - FLOOR + 0.16, x, (TOP + FLOOR + 0.16) / 2);
    cylinder(0.087, 0.1, x, FLOOR + 0.040, charcoal);
    cylinder(0.062, 0.065, x, TOP + 0.16, charcoal);
  }
  cylinder(0.048, 3.12, 0, TOP + 0.12, charcoal, true);
  for (const x of [-1.205, -0.407, 0.407, 1.205]) {
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.075), metal);
    clasp.position.set(x, TOP + 0.047, 0.045);
    clasp.castShadow = true;
    group.add(clasp);
  }
  return group;
}

function makeCloth() {
  const count = ROWS * COLUMNS;
  const rest = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);
  const previous = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const pinned = new Uint8Array(count);
  const edgeLookup = new Map();
  const constraints = [];
  const faces = [];
  const nodeIndex = (x, y) => y * COLUMNS + x;
  const constraintKey = (a, b) => Math.min(a, b) * count + Math.max(a, b);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const node = nodeIndex(x, y);
      const u = x / (COLUMNS - 1);
      const v = y / (ROWS - 1);
      rest[node * 3] = WIDTH * (u - 0.5);
      rest[node * 3 + 1] = TOP - HEIGHT * v;
      rest[node * 3 + 2] = Math.sin(u * Math.PI * 10) * Math.sin(v * Math.PI) * 0.052;
      uvs[node * 2] = u;
      uvs[node * 2 + 1] = 1 - v;
      pinned[node] = Number(y === 0);
    }
  }

  function connect(a, b, type = 'structural') {
    const ai = a * 3;
    const bi = b * 3;
    const edgeIndex = constraints.length;
    edgeLookup.set(constraintKey(a, b), edgeIndex);
    constraints.push({
      a,
      b,
      ai,
      bi,
      restLength: Math.hypot(rest[bi] - rest[ai], rest[bi + 1] - rest[ai + 1], rest[bi + 2] - rest[ai + 2]),
      shear: type === 'shear',
      broken: false,
    });
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const a = nodeIndex(x, y);
      if (x + 1 < COLUMNS) connect(a, a + 1);
      if (y + 1 < ROWS) connect(a, a + COLUMNS);
      if (x + 1 < COLUMNS && y + 1 < ROWS) connect(a, a + 1 + COLUMNS, 'shear');
    }
  }
  function face(a, b, c) {
    faces.push({ nodes: [a, b, c], edges: [edgeLookup.get(constraintKey(a, b)), edgeLookup.get(constraintKey(b, c)), edgeLookup.get(constraintKey(c, a))] });
  }
  for (let y = 0; y + 1 < ROWS; y++) {
    for (let x = 0; x + 1 < COLUMNS; x++) {
      const topLeft = nodeIndex(x, y);
      const bottomLeft = topLeft + COLUMNS;
      face(topLeft, bottomLeft, bottomLeft + 1);
      face(topLeft, bottomLeft + 1, topLeft + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const colorAttribute = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
  const index = new Uint16Array(faces.length * 3);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1).setUsage(THREE.DynamicDrawUsage));
  // Raycasting uses this fixed conservative bound while deformed positions update.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 7);
  const weave = makeWeave();
  const material = new THREE.MeshStandardMaterial({
    map: weave,
    bumpMap: weave,
    bumpScale: 0.014,
    roughness: 0.88,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  const activeFaces = [];

  function rebuildFaces() {
    activeFaces.length = 0;
    let indexCount = 0;
    for (const triangle of faces) {
      if (triangle.edges.some(edge => constraints[edge].broken)) continue;
      activeFaces.push(triangle);
      const [a, b, c] = triangle.nodes;
      index[indexCount++] = a;
      index[indexCount++] = b;
      index[indexCount++] = c;
    }
    geometry.setDrawRange(0, indexCount);
    geometry.index.needsUpdate = true;
    // computeVertexNormals uses the whole index buffer, not drawRange.
    index.fill(0, indexCount);
  }

  function reset() {
    positions.set(rest);
    previous.set(rest);
    for (const edge of constraints) edge.broken = false;
    rebuildFaces();
  }
  reset();
  return { count, previous, positions, colors, pinned, constraints, geometry, material, mesh, positionAttribute, colorAttribute, activeFaces, rebuildFaces, reset };
}

export function createClothScene(canvas, { onReady, onTear, onSplash } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 32);
  const target = new THREE.Vector3(0, -0.11, 0);
  const rig = makeRig();
  const cloth = makeCloth();
  scene.add(rig, cloth.mesh);
  scene.add(new THREE.HemisphereLight(0xfff3e4, 0x616e7c, 2.15));
  const key = new THREE.DirectionalLight(0xffefda, 2.5);
  const rim = new THREE.DirectionalLight(0xbacef5, 1.35);
  key.position.set(-3, 5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.0001;
  rim.position.set(3, 2, -3);
  scene.add(key, rim);

  const droplets = [];
  const dropletGeometry = new THREE.SphereGeometry(1, 10, 8);
  const dropletMaterial = new THREE.MeshStandardMaterial({ color: 0x98d6ee, metalness: 0.27, roughness: 0.2, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(dropletGeometry, dropletMaterial);
    mesh.visible = false;
    scene.add(mesh);
    droplets.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
  }
  const wetness = new Float32Array(cloth.count);
  const nextWetness = new Float32Array(cloth.count);
  const clothColor = new THREE.Color('#5bb7ab');
  const dampColor = new THREE.Color();
  const settings = { ...DEFAULTS };
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const targetNormal = new THREE.Vector3();
  const grabPlane = new THREE.Plane();
  const grabPoint = new THREE.Vector3();
  const pointers = new Map();
  let mode = 'fabric';
  let drag = null;
  let pinchDistance = 0;
  let zoomLevel = 1;
  let wet = false;
  let kinetic = 0;
  let frameId = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let drawn = false;
  let disposed = false;

  function writeColors() {
    for (let i = 0; i < cloth.count; i++) {
      const offset = i * 3;
      const shade = 1 - 0.63 * wetness[i];
      dampColor.copy(clothColor).multiplyScalar(shade);
      cloth.colors[offset] = dampColor.r;
      cloth.colors[offset + 1] = dampColor.g;
      cloth.colors[offset + 2] = dampColor.b;
    }
    cloth.colorAttribute.needsUpdate = true;
  }
  writeColors();

  function setCamera() {
    const verticalFit = 8.2;
    const horizontalFit = 6.45 / Math.max(camera.aspect, 0.25);
    const distance = Math.max(verticalFit, horizontalFit) / zoomLevel;
    camera.position.set(0.11, 0.025, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function resize() {
    const host = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(host.width));
    const height = Math.max(1, Math.round(host.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    setCamera();
    invalidate();
  }

  function updateRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      2 * (clientX - rect.left) / rect.width - 1,
      1 - 2 * (clientY - rect.top) / rect.height,
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function clothHit(clientX, clientY) {
    updateRay(clientX, clientY);
    return raycaster.intersectObject(cloth.mesh, false)[0];
  }

  function zoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    zoomLevel = clamp(zoomLevel * factor, 0.66, 2.35);
    setCamera();
    invalidate();
  }

  function wetCloth(hit) {
    const amount = 0.18 + (settings.waterAmount / 100) * 0.82;
    const radius = 0.1 + amount * 0.23;
    const positions = cloth.positions;
    for (let i = 0; i < cloth.count; i++) {
      const offset = i * 3;
      const dx = positions[offset] - hit.point.x;
      const dy = positions[offset + 1] - hit.point.y;
      const distance = Math.sqrt(dx * dx + dy * dy) / radius;
      const irregularity = 1 + Math.sin(i * 1.53) * 0.18;
      if (distance < irregularity) wetness[i] = clamp(wetness[i] + amount * (1 - (distance / irregularity) ** 2), 0, 1);
    }
    let launched = 0;
    for (const drop of droplets) {
      if (drop.life > 0) continue;
      const phi = launched * 2.39996;
      const speed = 0.45 + ((launched * 17) % 13) / 15;
      const scale = 0.012 + (launched % 4) * 0.004;
      drop.mesh.position.copy(hit.point);
      drop.mesh.position.z += 0.045;
      drop.mesh.scale.setScalar(scale);
      drop.mesh.visible = true;
      drop.velocity.set(Math.cos(phi) * speed, Math.sin(phi) * speed + 0.68, 0.35 + (launched % 5) / 9);
      drop.life = 0.52 + (launched % 5) * 0.035;
      if (++launched >= Math.round(MAX_SPLASHES + amount * 8)) break;
    }
    wet = true;
    writeColors();
    invalidate();
    onSplash?.();
  }

  function beginPointer(event) {
    if (event.button !== 0) return;
    const { pointerId, clientX, clientY } = event;
    pointers.set(pointerId, { x: clientX, y: clientY, startX: clientX, startY: clientY, tap: true });
    canvas.setPointerCapture(pointerId);
    if (pointers.size > 1) {
      drag = null;
      const [a, b] = pointers.values();
      for (const contact of pointers.values()) contact.tap = false;
      pinchDistance = Math.hypot(b.x - a.x, b.y - a.y);
      return;
    }
    if (mode === 'water') return;
    const hit = clothHit(clientX, clientY);
    if (!hit) return;
    const face = cloth.activeFaces[hit.faceIndex];
    if (!face) return;
    let node = -1;
    let minimum = Infinity;
    for (const candidate of face.nodes) {
      if (cloth.pinned[candidate]) continue;
      const i = candidate * 3;
      const distance = (hit.point.x - cloth.positions[i]) ** 2 + (hit.point.y - cloth.positions[i + 1]) ** 2 + (hit.point.z - cloth.positions[i + 2]) ** 2;
      if (distance < minimum) {
        node = candidate;
        minimum = distance;
      }
    }
    if (node < 0) return;
    const offset = node * 3;
    camera.getWorldDirection(targetNormal);
    grabPoint.fromArray(cloth.positions, offset);
    grabPlane.setFromNormalAndCoplanarPoint(targetNormal, grabPoint);
    drag = { pointerId, node, origin: grabPoint.clone(), goal: grabPoint.clone(), motion: 0, startX: clientX, startY: clientY };
    canvas.style.cursor = 'grabbing';
    invalidate();
  }

  function movePointer(event) {
    const { pointerId, clientX, clientY } = event;
    const contact = pointers.get(pointerId);
    if (!contact) return;
    contact.x = clientX;
    contact.y = clientY;
    if (Math.hypot(clientX - contact.startX, clientY - contact.startY) > 12) contact.tap = false;
    if (pointers.size > 1) {
      const [a, b] = pointers.values();
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (pinchDistance > 10) zoom(distance / pinchDistance);
      pinchDistance = distance;
      return;
    }
    if (!drag || pointerId !== drag.pointerId) return;
    updateRay(clientX, clientY);
    if (!raycaster.ray.intersectPlane(grabPlane, grabPoint)) return;
    drag.motion = Math.hypot(clientX - drag.startX, clientY - drag.startY);
    drag.goal.copy(grabPoint);
    drag.goal.x = clamp(drag.goal.x, -3.7, 3.7);
    drag.goal.y = clamp(drag.goal.y, FLOOR + 0.06, 2.4);
    drag.goal.z = drag.origin.z + Math.min(0.64, drag.motion * 0.0039);
    invalidate();
  }

  function releasePointer(event) {
    const contact = pointers.get(event.pointerId);
    if (event.type === 'pointerup' && mode === 'water' && contact?.tap && pointers.size === 1) {
      const hit = clothHit(event.clientX, event.clientY);
      if (hit) wetCloth(hit);
    }
    pointers.delete(event.pointerId);
    if (drag?.pointerId === event.pointerId) {
      drag = null;
      kinetic = Math.max(kinetic, 100);
      canvas.style.cursor = mode === 'water' ? 'crosshair' : 'grab';
    }
    if (pointers.size < 2) pinchDistance = 0;
    invalidate();
  }

  function wheel(event) {
    event.preventDefault();
    zoom(Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.016 : 0.0014)));
  }

  function stepCloth() {
    const { count, positions, previous, pinned, constraints } = cloth;
    const movingNode = drag?.node ?? -1;
    for (let i = COLUMNS; i < count; i++) {
      if (i === movingNode) continue;
      const offset = i * 3;
      const x = positions[offset];
      const y = positions[offset + 1];
      const z = positions[offset + 2];
      positions[offset] += (x - previous[offset]) * 0.955;
      positions[offset + 1] = Math.max(FLOOR + 0.04, y + (y - previous[offset + 1]) * 0.955 - 0.0015);
      positions[offset + 2] += (z - previous[offset + 2]) * 0.955 - z * 0.0011;
      previous[offset] = x;
      previous[offset + 1] = y;
      previous[offset + 2] = z;
    }
    if (drag) {
      const offset = movingNode * 3;
      previous[offset] = positions[offset];
      previous[offset + 1] = positions[offset + 1];
      previous[offset + 2] = positions[offset + 2];
      positions[offset] += (drag.goal.x - positions[offset]) * 0.3;
      positions[offset + 1] += (drag.goal.y - positions[offset + 1]) * 0.3;
      positions[offset + 2] += (drag.goal.z - positions[offset + 2]) * 0.3;
    }
    const elasticity = 0.42 + settings.stiffness * 0.005;
    const mayTear = drag && drag.motion > 18;
    const tearLimit = settings.tearThreshold;
    let breaks = 0;
    for (let iteration = 0; iteration < 4; iteration++) {
      for (const edge of constraints) {
        if (edge.broken) continue;
        const { a, b, ai, bi } = edge;
        const ax = positions[bi] - positions[ai];
        const ay = positions[bi + 1] - positions[ai + 1];
        const az = positions[bi + 2] - positions[ai + 2];
        const length = Math.sqrt(ax * ax + ay * ay + az * az);
        if (length < 1e-8) continue;
        if (mayTear && !iteration && breaks < 7 && !pinned[a] && !pinned[b] && length > edge.restLength * tearLimit) {
          edge.broken = true;
          breaks++;
          continue;
        }
        const moveA = !pinned[a] && a !== movingNode;
        const moveB = !pinned[b] && b !== movingNode;
        if (!moveA && !moveB) continue;
        const correction = (1 - edge.restLength / length) * elasticity / (moveA && moveB ? 2 : 1) * (edge.shear ? 0.76 : 1);
        if (moveA) {
          positions[ai] += ax * correction;
          positions[ai + 1] += ay * correction;
          positions[ai + 2] += az * correction;
        }
        if (moveB) {
          positions[bi] -= ax * correction;
          positions[bi + 1] -= ay * correction;
          positions[bi + 2] -= az * correction;
        }
      }
    }
    if (breaks) {
      cloth.rebuildFaces();
      onTear?.(breaks);
    }
    cloth.positionAttribute.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
  }

  function updateDrops(delta) {
    let active = false;
    for (const drop of droplets) {
      if (drop.life <= 0) continue;
      drop.life -= delta;
      drop.mesh.visible = drop.life > 0;
      drop.velocity.y -= 4.5 * delta;
      drop.mesh.position.addScaledVector(drop.velocity, delta);
      active ||= drop.mesh.visible;
    }
    return active;
  }

  function dampStep() {
    let nearWater = false;
    nextWetness.set(wetness);
    for (const edge of cloth.constraints) {
      if (edge.broken || edge.shear) continue;
      const transfer = (wetness[edge.a] - wetness[edge.b]) * 0.014;
      nextWetness[edge.a] -= transfer;
      nextWetness[edge.b] += transfer;
    }
    for (let i = 0; i < wetness.length; i++) {
      const value = nextWetness[i] * 0.994;
      wetness[i] = value > 0.0015 ? value : 0;
      nearWater ||= wetness[i] > 0;
    }
    wet = nearWater;
    writeColors();
    return wet;
  }

  function frame(now) {
    frameId = 0;
    if (disposed) return;
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.045) : FIXED_STEP;
    lastFrame = now;
    accumulator += delta;
    while (accumulator >= FIXED_STEP) {
      if (drag || kinetic > 0) stepCloth();
      if (wet) dampStep();
      if (kinetic > 0) kinetic--;
      accumulator -= FIXED_STEP;
    }
    const splashing = updateDrops(delta);
    renderer.render(scene, camera);
    if (!drawn) {
      drawn = true;
      onReady?.();
    }
    if (drag || kinetic || wet || splashing) {
      invalidate();
    } else {
      lastFrame = 0;
      accumulator = 0;
    }
  }

  function invalidate() {
    if (!disposed && !frameId) frameId = requestAnimationFrame(frame);
  }

  function clearWater() {
    wet = false;
    wetness.fill(0);
    for (const drop of droplets) {
      drop.life = 0;
      drop.mesh.visible = false;
    }
    writeColors();
    invalidate();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  canvas.addEventListener('pointerdown', beginPointer);
  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  cloth.geometry.computeVertexNormals();
  resize();

  return {
    setMode(value) {
      mode = value === 'water' ? 'water' : 'fabric';
      drag = null;
      canvas.style.cursor = mode === 'water' ? 'crosshair' : 'grab';
    },
    setColor(hex) {
      clothColor.set(hex);
      writeColors();
      invalidate();
    },
    setSetting(keyName, value) {
      const number = Number(value);
      if (!Number.isFinite(number) || !Object.hasOwn(settings, keyName)) return;
      settings[keyName] = keyName === 'tearThreshold' ? clamp(number, 1.02, 3) : clamp(number, 0, 100);
      if (keyName === 'opacity') {
        const opacity = settings.opacity / 100;
        const transparent = opacity < 1;
        if (cloth.material.transparent !== transparent) {
          cloth.material.transparent = transparent;
          cloth.material.needsUpdate = true;
        }
        cloth.material.opacity = opacity;
        cloth.material.depthWrite = opacity >= 1;
      }
      invalidate();
    },
    reset() {
      drag = null;
      kinetic = 0;
      cloth.reset();
      cloth.positionAttribute.needsUpdate = true;
      cloth.geometry.computeVertexNormals();
      clearWater();
    },
    clearWater,
    zoom,
    resetView() {
      zoomLevel = 1;
      setCamera();
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', beginPointer);
      canvas.removeEventListener('pointermove', movePointer);
      canvas.removeEventListener('pointerup', releasePointer);
      canvas.removeEventListener('pointercancel', releasePointer);
      canvas.removeEventListener('lostpointercapture', releasePointer);
      canvas.removeEventListener('wheel', wheel);
      const resources = new Set();
      scene.traverse(object => {
        if (object.geometry) resources.add(object.geometry);
        if (object.material) resources.add(object.material);
      });
      resources.add(cloth.material.map);
      for (const resource of resources) resource.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}
