# Iconos de recursos aportados por el usuario

Imágenes del ZIP facilitado para el tema Mundo de bloques. Madera y paja tienen una versión con el fondo y la sombra exterior eliminados, con transparencia alfa. Oveja, ladrillo y hierro conservan los PNG originales renombrados. Los originales de madera y paja se conservan en el historial de Git.

| Recurso | Archivo original | Archivo del juego |
| --- | --- | --- |
| Madera | `d9c6e4cc-3d2b-4868-acd3-3c42aa7c3aa0.png` | `wood.png` |
| Paja | `a2d0e231-bc1d-4745-a858-fe977587cac1.png` | `wheat.png` |
| Oveja | `755b7320-d652-4c0a-a107-ac09ed4fce87.png` | `sheep.png` |
| Ladrillo | `b313149f-944c-49cf-9997-2c5bd2f664b3.png` | `brick.png` |
| Hierro | `88059abd-3604-438e-9249-2144ea0d39e7.png` | `ore.png` |

`src/voxel-icons.ts` importa las imágenes para inventario, costes, ofertas y cartas. Vite genera sus URLs con hash; la compilación PWA incluye los cinco archivos en la precarga offline. Madera y paja se muestran con transparencia real; para las otras imágenes, la mezcla CSS integra el fondo claro sobre los paneles.
