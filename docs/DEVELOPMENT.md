# Guía de desarrollo

[← Volver a la presentación del proyecto](../README.md) · [Despliegue de producción](../DEPLOYMENT.md)

## Capturas de la presentación

Las imágenes versionadas del README están en `docs/screenshots/`. Son capturas reales de una sala Party de demostración, con dos personas simuladas y una plaza de IA, después de completar la colocación inicial. Se tomaron con Chromium: tablero a 1440 × 1000, televisión y vestíbulo a 1600 × 1000, y mando móvil a 390 × 844.

Al renovarlas, espera a que termine la sincronización y desaparezca el vestíbulo antes de capturar el tablero o el mando. Mantén los nombres de archivo, los textos alternativos y las rutas relativas del README. Los resultados temporales de Playwright siguen en `test-results/` y no se suben a Git.

## Desarrollo

Requisitos: Node.js 24 y npm. En desarrollo las salas se guardan en `.isla-rooms/`, excluido de Git; no necesitas claves externas. El plugin de Vite sirve tanto la interfaz como `/api/rooms`, también con `npm run preview`. Puedes cambiar la carpeta con `ISLA_ROOM_DIR`.

```sh
cd /workspace/CatanUniversal
npm ci
npm run dev -- --port 5173
```

```sh
npm test          # Reglas e integración: incluye partidas completas hasta victoria
npm run build    # TypeScript y compilación optimizada en dist/
npm run preview -- --port 4173
```

Las pruebas de navegador esperan un servidor de desarrollo en el puerto 5173:

```sh
npm run test:e2e
```

La configuración de Playwright usa `/usr/bin/chromium`, disponible en este entorno cloud. En otra máquina indica el ejecutable con `CHROMIUM_PATH=/ruta/al/chromium npm run test:e2e`. Las capturas y trazas se guardan en `test-results/`, excluido de Git. La escena requiere WebGL; para equipos sin WebGL hay un aviso y un selector alternativo de construcciones.

El entorno cloud ya está aislado: utiliza este checkout existente. No hace falta crear un worktree salvo petición expresa.

## Despliegue en Vercel

`vercel.json` configura Vite, `npm ci`, `npm run build`, salida `dist` y la función Node.js `api/rooms.ts`. Despliega la raíz del repositorio completa, incluyendo `api/` y `server/`; publicar solo `dist/` deja disponibles únicamente los modos locales.

Para Online y Party, crea un almacén **privado de Vercel Blob** y conéctalo al proyecto en los entornos que vayas a usar. Vercel proporciona `BLOB_READ_WRITE_TOKEN` a la función; nunca lo expongas con prefijo `VITE_` ni lo envíes al cliente. El proyecto publicado ya tiene conectado `isla-universal-rooms` en Frankfurt y la función se ejecuta en esa región. El consumo de funciones y Blob depende del uso y de los límites del plan de Vercel.

Opciones de publicación:

1. Conecta el repositorio que contenga estos archivos a tu cuenta de Vercel, importa el proyecto y acepta el framework Vite. Vercel ejecutará la compilación y emitirá la URL de producción.
2. Desde una máquina autenticada en Vercel, ejecuta `npx vercel --prod` en la raíz del proyecto y selecciona tu cuenta/proyecto.

Para que Codex publique desde este entorno, hace falta acceso autorizado a tu cuenta. Se ha declarado `VERCEL_TOKEN` como requisito de despliegue en los ajustes seguros del entorno, con destino `api.vercel.com`. No escribas tokens en el chat, archivos del repositorio ni comandos que los impriman. Los dominios `api.vercel.com` y `*.vercel.app` se han añadido al borrador de red para publicación y verificación. Revisa y guarda los cambios del entorno y publícalo cuando corresponda; guardar el borrador no aplica ni publica por sí solo la configuración.

**Publicación:** el juego está disponible en https://isla-universal.vercel.app/ en Vercel. El código fuente se conserva en https://github.com/Rapidfiend34/CatanUniversal. Las futuras actualizaciones requieren desplegar el código fuente; el proyecto actual no está conectado a Git para despliegue automático.

La carpeta `dist/` puede alojarse también en cualquier servidor web estático con HTTPS para jugar contra la IA o en el mismo dispositivo. Las salas requieren además la API y almacenamiento privado persistente.

## Servidor de salas y privacidad

El servidor es la autoridad de las reglas, dados, mazo, robos y turnos de la IA. Cada dispositivo conserva un secreto aleatorio de 256 bits; el servidor almacena únicamente su hash para reconocer la plaza. El código sirve para unirse, no para recuperar identidades ajenas. La API proyecta la partida por participante: devuelve solo su mano, cantidades públicas de cartas y puntos visibles. La TV no recibe manos, cartas de desarrollo privadas ni orden del mazo, ni siquiera a través del diagnóstico `window.__isla`.

La sincronización consulta el servidor aproximadamente cada 1,4 segundos con la pestaña visible, y cada 5 segundos en segundo plano. Se usan versiones, identificadores de acción y escrituras condicionales por ETag para rechazar acciones obsoletas, duplicados y cambios simultáneos incompatibles. Las lecturas son privadas y no se cachean. Las consultas sin cambios no reescriben el almacenamiento.

En producción, los documentos viven en Vercel Blob privado y sobreviven a reinicios de funciones y nuevos despliegues. A las 48 horas se deniega el acceso, aunque los documentos no se borran automáticamente del almacén: su eliminación administrativa corresponde al propietario del proyecto. Las salas de desarrollo se guardan en archivos privados, con control de concurrencia. La limitación de creación/unión por IP es básica y por instancia; no sustituye protección distribuida para un servicio de gran escala.

## Estructura

| Archivo | Responsabilidad |
| --- | --- |
| `src/engine.ts` | Estado serializable y comandos con validación; no depende del navegador ni de Three.js. |
| `src/bot.ts` | Decisiones de los participantes automáticos. |
| `src/trading.ts` | Valoración de ofertas y generación de propuestas de la IA, sin inspeccionar las manos ocultas de sus rivales. |
| `src/board.ts` | Modelos 3D, cámara, iluminación, selección y visualización de ubicaciones legales. |
| `src/main.ts` | Interfaz, modales, guardado, importación/exportación y turnos. |
| `src/style.css` | Diseño adaptable de escritorio y móvil. |
| `src/online/` | Protocolo de vistas privadas y cliente de salas con reconexión. |
| `server/rooms.ts` | Autorización, vestíbulo, reglas y turnos automáticos del servidor. |
| `server/store.ts` | Persistencia con escrituras condicionales en Blob o archivos. |
| `api/rooms.ts` | Entrada de la función HTTP para Vercel. |
| `tests/engine.test.ts` | Reglas, conservación de recursos y simulaciones completas. |
| `tests/rooms.test.ts` | Autorización, privacidad, concurrencia, reintentos y persistencia. |
| `tests/game.spec.ts` | Pruebas reales de navegador con Playwright. |
| `tests/online.spec.ts` | Amigos en navegadores independientes y Party con TV y móviles. |

El motor usa actualizaciones inmutables mediante `execute(estado, comando)`; una operación ilegal lanza `RuleError` sin modificar el estado anterior. La aleatoriedad se puede inyectar para pruebas reproducibles. La escena recibe el estado final y no decide las reglas del juego.
