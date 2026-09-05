import * as THREE from "three";
import { canPlantTree } from "./camera-rig.js?v=1.0.0";

// Screen-door fade retains correct depth while opening the view around an exploring camera.
export function softenNearCamera(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFoliageTime = uniforms.time;
    shader.uniforms.uFoliageWind = uniforms.wind;
    shader.vertexShader =
      "varying vec3 vFoliageWorld; uniform float uFoliageTime; uniform float uFoliageWind;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      transformed.x += sin(instanceMatrix[3].x*.17+instanceMatrix[3].z*.11+uFoliageTime*.45)*max(0.0,position.y)*uFoliageWind;
      #endif`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
      vec4 foliagePosition = vec4(transformed,1.0);
      #ifdef USE_INSTANCING
      foliagePosition = instanceMatrix * foliagePosition;
      #endif
      vFoliageWorld = (modelMatrix * foliagePosition).xyz;`,
    );
    shader.fragmentShader =
      "varying vec3 vFoliageWorld;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `#include <alphatest_fragment>
      float visibility = smoothstep(2.5, 6.5, distance(cameraPosition, vFoliageWorld));
      float dither = fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
      if (visibility < dither) discard;`,
    );
  };
  material.customProgramCacheKey = () => "s2w-foliage-v1";
  return material;
}

export function makeForest(world, theme) {
  const random = world.random,
    count = Math.floor(155 * world.identity.density);
  const dummy = new THREE.Object3D();
  world.foliageUniforms = { time: { value: 0 }, wind: { value: 0.04 } };
  world.treeCrownMaterial = softenNearCamera(
    new THREE.MeshStandardMaterial({
      color: theme.crown,
      roughness: 0.93,
      emissive: theme.crown,
      emissiveIntensity: 0.1,
    }),
    world.foliageUniforms,
  );
  world.trunkMaterial = softenNearCamera(
    new THREE.MeshStandardMaterial({ color: 0x26302a, roughness: 1 }),
    world.foliageUniforms,
  );
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.24, 0.52, 1, 7),
    world.trunkMaterial,
    count,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    world.treeCrownMaterial,
    count * 5,
  );
  let planted = 0;
  for (let attempt = 0; planted < count && attempt < count * 5; attempt++) {
    const angle = random() * Math.PI * 2,
      radius = 32 + Math.sqrt(random()) * 49;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius;
    const width = 2.6 + random() * 2.2;
    if (!canPlantTree(x, z, width)) continue;
    const y = world.heightAt(x, z),
      height = 7 + random() * 10;
    dummy.position.set(x, y + height * 0.5, z);
    dummy.rotation.set(0, random() * 6.28, (random() - 0.5) * 0.08);
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(planted, dummy.matrix);
    for (let lobe = 0; lobe < 5; lobe++) {
      const a = lobe * 2.4,
        spread = lobe === 4 ? 0 : width * 0.7;
      dummy.position.set(
        x + Math.cos(a) * spread,
        y + height + (lobe === 4 ? 2 : 0),
        z + Math.sin(a) * spread,
      );
      dummy.scale.set(
        width * (0.8 + random() * 0.4),
        2 + random() * 2.4,
        width * (0.8 + random() * 0.35),
      );
      dummy.rotation.set(random() * 0.3, random() * 6.28, random() * 0.2);
      dummy.updateMatrix();
      crowns.setMatrixAt(planted * 5 + lobe, dummy.matrix);
      const colour = new THREE.Color(theme.crown).multiplyScalar(
        0.65 + random() * 0.65,
      );
      crowns.setColorAt(planted * 5 + lobe, colour);
    }
    world.colliders.push({ x, z, radius: 1.3 });
    planted++;
  }
  trunks.count = planted;
  crowns.count = planted * 5;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  crowns.instanceColor.needsUpdate = true;
  world.worldRoot.add(trunks, crowns);
}

export function makeUnderstory(world, theme) {
  const random = world.random,
    dummy = new THREE.Object3D();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: theme.groundHigh,
    roughness: 0.94,
    metalness: 0.08,
  });
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    rockMaterial,
    170,
  );
  for (let i = 0; i < 170; i++) {
    const a = random() * 6.28,
      r = 7 + Math.sqrt(random()) * 70,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r,
      s = 0.25 + random() * 1.5;
    dummy.position.set(x, world.heightAt(x, z) + s * 0.18, z);
    dummy.scale.set(s, s * 0.42, s * 0.8);
    dummy.rotation.set(random(), random() * 6.28, random());
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  world.worldRoot.add(rocks);
  if (theme.kind !== "forest") return;
  const leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, -0.24, 0.48, 0.18, 0, 1.05, 0.46, 0, 0, 0, 0, 1.05, 0.46, 0.24,
        0.48, 0.18,
      ],
      3,
    ),
  );
  leafGeometry.computeVertexNormals();
  const leafMaterial = softenNearCamera(
    new THREE.MeshStandardMaterial({
      color: 0x35896e,
      side: THREE.DoubleSide,
      roughness: 0.8,
      emissive: 0x0b3429,
      emissiveIntensity: 0.3,
    }),
    world.foliageUniforms,
  );
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, 1600);
  for (let plant = 0; plant < 200; plant++) {
    const a = random() * 6.28,
      r = 9 + Math.sqrt(random()) * 59,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    for (let leaf = 0; leaf < 8; leaf++) {
      dummy.position.set(x, world.heightAt(x, z) + 0.06, z);
      dummy.rotation.set(0.3 + random() * 0.5, (leaf / 8) * 6.28, 0);
      const s = 0.55 + random() * 1.05;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      leaves.setMatrixAt(plant * 8 + leaf, dummy.matrix);
    }
  }
  world.worldRoot.add(leaves);
  // Low flowering islands enrich the clearing while leaving the camera-height view open.
  const flowers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    new THREE.MeshStandardMaterial({
      color: theme.petal,
      emissive: theme.petal,
      emissiveIntensity: 0.7,
      roughness: 0.7,
    }),
    650,
  );
  const moss = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 4),
    new THREE.MeshStandardMaterial({
      color: 0x316e52,
      emissive: 0x124a37,
      emissiveIntensity: 0.35,
      roughness: 1,
    }),
    110,
  );
  for (let i = 0; i < 650; i++) {
    const cluster = i % 13,
      a = (cluster / 13) * 6.28,
      r = 12 + (cluster % 4) * 6,
      x = Math.cos(a) * r + (random() - 0.5) * 6,
      z = Math.sin(a) * r + (random() - 0.5) * 6;
    dummy.position.set(x, world.heightAt(x, z) + 0.25 + random() * 0.5, z);
    dummy.scale.set(1, 0.65, 1);
    dummy.rotation.set(0, random() * 6.28, 0);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(
      i,
      new THREE.Color(i % 3 === 0 ? theme.accent : theme.petal),
    );
    if (i < 110) {
      dummy.position.y = world.heightAt(x, z) + 0.02;
      dummy.scale.set(
        0.5 + random() * 1.2,
        0.08 + random() * 0.09,
        0.6 + random(),
      );
      dummy.updateMatrix();
      moss.setMatrixAt(i, dummy.matrix);
    }
  }
  world.worldRoot.add(flowers, moss);
}

export function makeStructures(world, theme) {
  if (theme.kind === "forest") return;
  const random = world.random;
  const stone = new THREE.MeshStandardMaterial({
    color: theme.groundHigh,
    emissive: theme.groundHigh,
    emissiveIntensity: 0.16,
    roughness: 0.8,
    metalness: 0.12,
  });
  const geometry =
    theme.kind === "city"
      ? new THREE.BoxGeometry(1, 1, 1)
      : theme.kind === "islands"
        ? new THREE.CylinderGeometry(1, 0.06, 1.45, 7, 1)
        : new THREE.OctahedronGeometry(1, 0);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: theme.accent,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
  });
  const edgeGeometry = new THREE.EdgesGeometry(geometry);
  const islandTop = new THREE.CylinderGeometry(0.97, 1, 0.12, 7),
    islandMaterial = new THREE.MeshStandardMaterial({
      color: 0x779c9b,
      emissive: theme.secondary,
      emissiveIntensity: 0.15,
      roughness: 1,
    });
  const spireGeometry = new THREE.OctahedronGeometry(0.13, 0),
    spireMaterial = world.glowMaterial(theme.accent, 0.65);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 6.28 + (random() - 0.5) * 0.15,
      r = 34 + random() * 44,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    const group = new THREE.Group();
    group.position.set(
      x,
      world.heightAt(x, z) +
        (theme.kind === "islands" ? 10 + random() * 13 : 3),
      z,
    );
    const mesh = new THREE.Mesh(geometry, stone);
    const size = 2 + random() * 4;
    mesh.scale.set(
      size,
      theme.kind === "islands" ? size * 0.7 : 4 + random() * 14,
      size,
    );
    if (theme.kind !== "islands") {
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      mesh.add(edges);
    } else {
      const top = new THREE.Mesh(islandTop, islandMaterial);
      top.position.y = 0.73;
      mesh.add(top);
      for (let j = 0; j < 3; j++) {
        const spire = new THREE.Mesh(spireGeometry, spireMaterial);
        spire.position.set((random() - 0.5) * 0.9, 1, (random() - 0.5) * 0.9);
        spire.scale.set(1, 2 + random() * 2, 1);
        mesh.add(spire);
      }
    }
    group.add(mesh);
    group.rotation.z = theme.kind === "shards" ? (random() - 0.5) * 0.65 : 0;
    world.worldRoot.add(group);
    world.reactiveObjects.push({
      group,
      baseY: group.position.y,
      phase: random() * 6.28,
      kind: theme.kind,
    });
    if (theme.kind !== "islands")
      world.colliders.push({ x, z, radius: size * 1.45 + 1 });
  }
  if (theme.kind !== "islands") {
    islandTop.dispose();
    islandMaterial.dispose();
    spireGeometry.dispose();
    spireMaterial.dispose();
  } else {
    edgeGeometry.dispose();
    edgeMaterial.dispose();
  }
}

export function makeMountains(world, theme) {
  const positions = [],
    colours = [];
  const random = world.random,
    low = new THREE.Color(theme.fog),
    high = new THREE.Color(theme.horizon);
  for (let layer = 0; layer < 3; layer++) {
    const radius = 104 + layer * 27,
      n = 84;
    const heights = Array.from(
      { length: n },
      () => 9 + random() * 18 + layer * 5,
    );
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28,
        b = ((i + 1) / n) * 6.28;
      const verts = [
        [Math.cos(a) * radius, -6, Math.sin(a) * radius],
        [Math.cos(a) * radius, heights[i], Math.sin(a) * radius],
        [Math.cos(b) * radius, heights[(i + 1) % n], Math.sin(b) * radius],
        [Math.cos(a) * radius, -6, Math.sin(a) * radius],
        [Math.cos(b) * radius, heights[(i + 1) % n], Math.sin(b) * radius],
        [Math.cos(b) * radius, -6, Math.sin(b) * radius],
      ];
      for (const [x, y, z] of verts) {
        positions.push(x, y, z);
        const c = low
          .clone()
          .lerp(high, 0.1 + layer * 0.1 + (y > 0 ? 0.12 : 0));
        colours.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  world.worldRoot.add(
    new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: false,
      }),
    ),
  );
}
