# Isla Universal

Juego de estrategia de mesa con tablero 3D isométrico, interfaz en español y una identidad visual propia. Adaptación independiente de las mecánicas del juego base de CATAN, sin utilizar sus ilustraciones, modelos ni otros recursos oficiales.

## Jugar

La partida inicial te enfrenta a dos rivales automáticos. Pulsa **Nueva partida** para elegir tu nombre, 3 o 4 participantes y jugar contra la IA o con personas compartiendo el dispositivo.

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
- Ladrón, descarte obligatorio con un 7 y robo aleatorio a un rival adyacente.
- Nueve puertos, comercio bancario 4:1, general 3:1 y especializado 2:1. Ofertas entre personas e IA con aceptación explícita.
- Mazo estándar de 25 cartas: 14 caballeros, 5 puntos de victoria, 2 de carreteras, 2 de monopolio y 2 de abundancia. Restricciones de antigüedad y una carta jugada por turno.
- Carretera más larga calculada como recorrido sin reutilizar aristas, interrupción por edificios rivales y conservación del titular en caso de empate. Mayor ejército y puntos secretos de desarrollo.
- Rivales automáticos con colocación por probabilidad, construcción, mejoras, cartas, comercio bancario, negociación con otros participantes y decisiones de ladrón.
- Escena procedural de Three.js: bosques, ovejas, montañas, campos, arcilla, poblados, ciudades, muelles, ladrón y océano animado. Todos los modelos se generan en código.

El juego base utiliza **carreteras** terrestres. Los barcos, puentes y otras reglas de expansiones no están incluidos. Esta versión permite partidas completas locales; no incluye salas online, cuentas, servidor multijugador ni sincronización entre dispositivos. La IA es heurística, no un jugador experto. No hay comercio antes de lanzar los dados.

## Intercambios con la IA

En tu turno, abre **Comerciar → Entre jugadores**, selecciona un rival automático y elige los recursos que entregas y pides. La IA responde según sus recursos disponibles, las construcciones que puede preparar, la producción de sus parcelas y los puntos públicos del rival. Puede rechazar un trato aunque disponga de las cartas solicitadas; el motivo aparece en el aviso y en la bitácora.

Durante su turno, la IA también propone intercambios antes de recurrir al banco. Puedes aceptar o rechazar sus ofertas; la partida espera tu respuesta. Cada rival automático propone como máximo un trato a cada participante por turno, para evitar repeticiones. La IA negocia entre sí de forma automática y genera sus propuestas usando su propia mano, el tablero y las cantidades públicas de cartas, sin consultar los tipos de recursos ocultos de otros participantes.

Las cartas cambian de mano únicamente tras aceptar, y se comprueba que ambas partes pueden pagar. Si no tienes los recursos solicitados, puedes rechazar la propuesta. Las ofertas pendientes se guardan y se recuperan al recargar o importar una partida; también se pueden seguir usando las partidas anteriores a esta actualización.

## Desarrollo

Requisitos: Node.js 24 recomendado y npm. No necesitas base de datos ni claves para ejecutar el juego.

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

`vercel.json` configura el proyecto con Vite, `npm ci`, `npm run build` y salida `dist`. La aplicación es estática y no necesita secretos de ejecución.

Opciones de publicación:

1. Conecta el repositorio que contenga estos archivos a tu cuenta de Vercel, importa el proyecto y acepta el framework Vite. Vercel ejecutará la compilación y emitirá la URL de producción.
2. Desde una máquina autenticada en Vercel, ejecuta `npx vercel --prod` en la raíz del proyecto y selecciona tu cuenta/proyecto.

Para que Codex publique desde este entorno, hace falta acceso autorizado a tu cuenta. Se ha declarado `VERCEL_TOKEN` como requisito de despliegue en los ajustes seguros del entorno, con destino `api.vercel.com`. No escribas tokens en el chat, archivos del repositorio ni comandos que los impriman. Los dominios `api.vercel.com` y `*.vercel.app` se han añadido al borrador de red para publicación y verificación. Revisa y guarda los cambios del entorno y publícalo cuando corresponda; guardar el borrador no aplica ni publica por sí solo la configuración.

**Publicación:** el juego está disponible en https://isla-universal.vercel.app/ mediante un despliegue estático de producción en Vercel. El código fuente se conserva en https://github.com/Rapidfiend34/CatanUniversal. Las futuras actualizaciones requieren un nuevo despliegue; el despliegue actual no está conectado a Git.

La carpeta `dist/` puede alojarse también en cualquier servidor web estático con HTTPS. No necesita redirecciones de rutas porque la aplicación no usa un router de servidor.

## Estructura

| Archivo | Responsabilidad |
| --- | --- |
| `src/engine.ts` | Estado serializable y comandos con validación; no depende del navegador ni de Three.js. |
| `src/bot.ts` | Decisiones de los participantes automáticos. |
| `src/trading.ts` | Valoración de ofertas y generación de propuestas de la IA, sin inspeccionar las manos ocultas de sus rivales. |
| `src/board.ts` | Modelos 3D, cámara, iluminación, selección y visualización de ubicaciones legales. |
| `src/main.ts` | Interfaz, modales, guardado, importación/exportación y turnos. |
| `src/style.css` | Diseño adaptable de escritorio y móvil. |
| `tests/engine.test.ts` | Reglas, conservación de recursos y simulaciones completas. |
| `tests/game.spec.ts` | Pruebas reales de navegador con Playwright. |

El motor usa actualizaciones inmutables mediante `execute(estado, comando)`; una operación ilegal lanza `RuleError` sin modificar el estado anterior. La aleatoriedad se puede inyectar para pruebas reproducibles. La escena recibe el estado final y no decide las reglas del juego.
