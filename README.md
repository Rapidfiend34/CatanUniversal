# Isla Universal

Juego de estrategia de mesa con tablero 3D isométrico, interfaz en español y una identidad visual propia. Adaptación independiente de las mecánicas del juego base de CATAN, sin utilizar sus ilustraciones, modelos ni otros recursos oficiales.

## Jugar

La partida inicial te enfrenta a dos rivales automáticos. Pulsa **Nueva partida** para elegir tu nombre, 3 o 4 participantes y jugar contra la IA o con personas compartiendo el dispositivo. **Salas online** abre los modos Online y Party.

### Online con amigos

1. Abre https://isla-universal.vercel.app/, pulsa **Salas online → Online** y crea una sala de 3 o 4 plazas.
2. Comparte el código de siete caracteres, el enlace de invitación o su QR. Tus amigos entran desde sus propios navegadores con su nombre.
3. Todos los jugadores pulsan **Estoy listo**. El anfitrión pulsa **Empezar partida**. Se necesitan dos personas como mínimo; las plazas restantes se completan con IA.
4. Cada participante ve su propia mano y puede actuar cuando le corresponda. Las ofertas llegan al destinatario y los descartes se eligen desde el dispositivo de cada afectado.

### Party: televisión y mandos móviles

Abre el juego en el navegador de la televisión, o conecta un ordenador por HDMI o duplicación de pantalla. Selecciona **Salas online → Party · TV**. Esa pantalla queda como tablero público y no ocupa plaza de jugador. Los participantes escanean el QR o introducen el código desde sus móviles; incluso el anfitrión entra como jugador desde otro navegador/dispositivo.

Los móviles muestran las cartas privadas y los controles de turno. **Elegir ubicación** permite seleccionar cruces y tramos cuyos números aparecen en la televisión; **Ver tablero** permite consultar también el tablero 3D en el móvil. La TV ofrece pantalla completa. Todos los dispositivos necesitan internet; pueden estar en redes diferentes. No hace falta instalar aplicaciones.

Las salas caducan 48 horas después de crearse. Recarga el mismo navegador con el enlace de la sala para recuperar tu plaza: el acceso se conserva en ese navegador, no en el código público. No borres los datos del sitio ni cambies a otro navegador durante una partida. Tras empezar, no se admiten nuevos jugadores. Si alguien se desconecta, la partida espera sus acciones; no hay sustitución automática ni migración del anfitrión.

1. Selecciona un cruce iluminado para fundar un poblado y después un tramo contiguo para su carretera gratuita. Cada participante coloca dos parejas, en orden de ida y vuelta.
2. Lanza los dados. Todos los poblados junto a las parcelas del número obtenido reciben recursos; las ciudades reciben el doble.
3. Usa los botones inferiores para construir, comprar desarrollo o comerciar. Selecciona las construcciones directamente en el tablero o con **Ver ubicaciones**.
4. Termina tu turno. Gana quien alcanza 10 puntos de victoria durante su propio turno.

Arrastra el tablero para rotar la cámara, usa la rueda o los controles +/− para acercarte y la brújula para restablecer la vista. Haz clic en una parcela para consultar su producción o en un puerto para consultar su tarifa.

Las partidas se guardan automáticamente en `localStorage` después de cada acción. El menú de ajustes permite exportarlas e importarlas como JSON y activar sonidos. En móvil, los ajustes están en la barra superior. En partidas locales aparece una pantalla de traspaso para revelar la mano del siguiente participante. Es una medida de cortesía para un dispositivo compartido; los datos del juego no están cifrados y pueden consultarse con herramientas del navegador.

## Qué incluye esta versión

- Tablero aleatorio de 19 hexágonos, 54 cruces y 72 tramos. Distribución estándar de terrenos y fichas de producción, sin 6 y 8 adyacentes.
- Cinco recursos, banco finito de 19 cartas por recurso y producción con reglas de escasez.
- Poblados, ciudades y carreteras con costes, conexión, distancia mínima e inventario de piezas: 5 poblados, 4 ciudades y 15 carreteras por participante.
- Ladrón, descarte obligatorio con un 7 y selección de una carta boca abajo de un rival adyacente.
- Nueve puertos, comercio bancario 4:1, general 3:1 y especializado 2:1. Ofertas entre personas e IA con aceptación explícita.
- Mazo estándar de 25 cartas: 14 caballeros, 5 puntos de victoria, 2 de carreteras, 2 de monopolio y 2 de abundancia. Restricciones de antigüedad y una carta jugada por turno.
- Carretera más larga calculada como recorrido sin reutilizar aristas, interrupción por edificios rivales y conservación del titular en caso de empate. Mayor ejército y puntos secretos de desarrollo.
- Rivales automáticos con colocación por probabilidad, construcción, mejoras, cartas, comercio bancario, negociación con otros participantes y decisiones de ladrón.
- Escena procedural de Three.js: bosques, ovejas, montañas, campos, arcilla, poblados, ciudades, muelles, ladrón y océano animado. Todos los modelos se generan en código.

El juego base utiliza **carreteras** terrestres. Los barcos, puentes y otras reglas de expansiones no están incluidos. Se puede jugar localmente, online por código y en Party con televisión y móviles, sin cuentas. La IA es heurística, no un jugador experto. No hay comercio antes de lanzar los dados.

## Robo del ladrón

Después de mover el ladrón, se abre la selección de robo si hay rivales con un poblado o una ciudad adyacente y al menos una carta de recurso. Si hay varios, eliges a cuál robar; si solo hay uno, se muestra directamente su mano boca abajo. Pulsa una de sus cartas para completar el robo: mover el ladrón o elegir al rival no transfiere cartas automáticamente.

Solo se muestra la cantidad de cartas de recursos y sus reversos, sin indicar sus tipos. Las posiciones se barajan al realizar el robo y todas tienen la misma probabilidad de contener cada carta. Las cartas de desarrollo están excluidas. Si nadie es elegible, aparece una explicación y el turno continúa. Este mismo flujo se aplica a los caballeros, conservando la fase de dados cuando se juegan antes de lanzar. Si recargas durante un robo pendiente, la selección vuelve a abrirse.

## Intercambios con la IA

En tu turno, abre **Comerciar → Entre jugadores**, selecciona un rival automático y elige los recursos que entregas y pides. La IA responde según sus recursos disponibles, las construcciones que puede preparar, la producción de sus parcelas y los puntos públicos del rival. Puede rechazar un trato aunque disponga de las cartas solicitadas; el motivo aparece en el aviso y en la bitácora.

Durante su turno, la IA también propone intercambios antes de recurrir al banco. Puedes aceptar o rechazar sus ofertas; la partida espera tu respuesta. Cada rival automático propone como máximo un trato a cada participante por turno, para evitar repeticiones. La IA negocia entre sí de forma automática y genera sus propuestas usando su propia mano, el tablero y las cantidades públicas de cartas, sin consultar los tipos de recursos ocultos de otros participantes.

Las cartas cambian de mano únicamente tras aceptar, y se comprueba que ambas partes pueden pagar. Si no tienes los recursos solicitados, puedes rechazar la propuesta. Las ofertas pendientes se guardan y se recuperan al recargar o importar una partida; también se pueden seguir usando las partidas anteriores a esta actualización.

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
