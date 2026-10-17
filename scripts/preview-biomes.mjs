import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Run against Vite: node scripts/preview-biomes.mjs [output-directory]
const output = process.argv[2] || 'test-results/biomes';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem('isla-theme-v1', 'voxel'));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/');
  await page.locator('#board[data-map-style="voxel"] canvas').waitFor();
  await page.screenshot({ path: `${output}/map.png` });
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { VoxelMap } = await import('/src/voxel-map.ts');
    const map = new VoxelMap();
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(720, 620); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#f4f1e8');
    scene.add(new THREE.HemisphereLight('#fff9e9', '#8fa9a0', 2.6));
    const sun = new THREE.DirectionalLight('#fff5dd', 4); sun.position.set(-6, 13, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .5, far: 35 });
    sun.shadow.bias = -.0003; sun.shadow.normalBias = .012; scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.20; floor.receiveShadow = true; scene.add(floor);
    const camera = new THREE.OrthographicCamera(-1.48, 1.48, 1.27, -1.27, .1, 100);
    camera.position.set(3.4, 3.4, 4.2); camera.lookAt(0, .10, 0);
    const resources = [['wood', 'Bosque de roble'], ['brick', 'Cantera de arcilla'], ['sheep', 'Pradera'], ['wheat', 'Campos de trigo'], ['ore', 'Mina de hierro'], ['desert', 'Desierto']];
    const root = document.createElement('main'); root.id = 'biome-gallery';
    root.style.cssText = 'padding:40px;background:#f4f1e8;color:#334537;font:16px system-ui;min-height:100vh';
    root.innerHTML = '<div style="font-size:12px;letter-spacing:3px;color:#758568">ISLA UNIVERSAL · MUNDO DE BLOQUES</div><h1 style="font:36px Georgia;margin:12px 0 8px">Biomas flotantes estilo Skyblock</h1><p style="margin:0 0 24px;color:#758568">Modelos 3D reales del juego · tierra y roca escalonadas hasta acabar en pico</p><div id="models" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px"></div>';
    for (const [resource, name] of resources) {
      const tile = map.tile({ id: 0, x: 0, z: 0, resource }); scene.add(tile); renderer.render(scene, camera);
      const figure = document.createElement('figure'); figure.style.cssText = 'margin:0;border:1px solid #dcded1;border-radius:12px;overflow:hidden;background:#f4f1e8';
      const image = document.createElement('img'); image.src = renderer.domElement.toDataURL(); image.alt = name; image.style.cssText = 'width:100%;display:block';
      figure.append(image); const label = document.createElement('figcaption'); label.textContent = name; label.style.cssText = 'padding:0 20px 20px;font-size:17px'; figure.append(label);
      root.querySelector('#models').append(figure); scene.remove(tile);
    }
    document.querySelector('#app').replaceWith(root); document.body.style.margin = '0'; renderer.dispose();
    await Promise.all([...root.querySelectorAll('img')].map(img => img.decode()));
  });
  await page.screenshot({ path: `${output}/gallery.png`, fullPage: true });
  await page.evaluate(() => {
    const root = document.querySelector('#biome-gallery');
    root.querySelector('h1').textContent = 'Bosque de roble';
    root.querySelector('p').textContent = 'Árboles, troncos cortados, arbustos, flores y capas de césped y tierra.';
    const models = root.querySelector('#models'); models.style.gridTemplateColumns = '1fr';
    [...models.children].slice(1).forEach(card => card.remove()); models.querySelector('figcaption').remove();
  });
  await page.setViewportSize({ width: 1080, height: 1120 });
  await page.screenshot({ path: `${output}/forest.png`, fullPage: true });
  console.log(`Previews saved in ${output}`);
} finally { await browser.close(); }
