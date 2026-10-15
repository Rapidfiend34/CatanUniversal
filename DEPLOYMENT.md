# Despliegue de producción

- URL pública: https://isla-universal.vercel.app/
- Plataforma: Vercel.
- Proyecto: `isla-universal` (`prj_b8EJkD68SFuQ2qoV1rkzze5MZZQZ`).
- Despliegue: `dpl_54DBiFLb6aQPuCeSuW2aqq3ak8xt`.
- URL inmutable: https://isla-universal-mvo7mlozd-afr-34.vercel.app/
- Fecha: 15 de octubre de 2026.
- Artefacto: contenido de `dist/`, generado con `npm run build` después de `npm ci` y las pruebas del motor.
- Vercel comunicó estado `READY`; la URL de producción respondió HTTP 200 con el HTML y las referencias a los recursos compilados correctos.
- Versión con selección de cartas boca abajo al robar: 26 pruebas del motor y 16 pruebas de navegador aprobadas sobre la compilación de producción antes de publicarla, incluidas las negociaciones de la IA.
- Seis pruebas adicionales sobre la URL pública verifican elección de cartas ocultas con uno o varios rivales, recuperación del robo pendiente, caballeros antes de los dados, rivales sin recursos y controles móviles.

La publicación es estática y no está conectada a GitHub. El token se utilizó únicamente en memoria para este despliegue y no está guardado en los archivos del proyecto. Las actualizaciones futuras requieren acceso autorizado a Vercel y volver a desplegar la compilación. El archivo `vercel.json` prepara un futuro despliegue desde el código fuente con Vite.
