# PrintGo Labs

Contenido 100% original de PrintGo: generadores paramétricos locales que crean geometría nueva,
la laminan con el CLI real de Bambu Studio y la publican con tiempos y pesos REALES (no heurísticos).
Reemplaza, categoría por categoría, el material scrapeado cuya licencia no permite el negocio.

## Invariantes (innegociables)

1. **Sin mallas importadas.** Los generadores leen únicamente `labs/data/*.json` (dimensiones
   públicas, parámetros de diseño propios). Ninguna ruta de código importa mallas de la biblioteca
   scrapeada. El corpus descargado sirve para estudiar y comparar, no como insumo geométrico.
2. **Sin propiedad intelectual de terceros.** Iconografía de dominio público (calabazas, fantasmas,
   calaveras estilizadas, animales genéricos, estética de género). Personajes, logos y trade dress
   concretos de terceros: NO. Una reinterpretación de un personaje es obra derivada del personaje.
3. **Licencia Labs restrictiva.** Todo lo publicado con `origin: "printgo-labs"` lleva licencia
   propia: uso personal de impresión permitido, comercialización reservada a PrintGo.
4. **Marca legítima.** "PrintGo" va embutido en la geometría (text3d, fuentes OFL del worker).
   Es geometría nuestra: la marca es nuestra.
5. **printgo-3d-studio no se toca.** Se importan read-only: el venv del geometry-worker
   (`apps/geometry-worker/.venv`), `printgo_geometry.py`, `threemf.js` y `fflate` vendida, y el
   binario parcheado de Bambu Studio (`.calcval/slicing/bsx`). Ningún archivo de ese repo se
   modifica ni se crea.

## Pipeline

```
labs/data/*.json          especificaciones (hechos públicos + parámetros propios)
        │
labs/generators/*.py     geometría paramétrica → 3MF core (write_3mf del worker)
        │                  cada variante = un archivo individual
labs/lib/bambu.mjs        3MF core → proyecto Bambu (read3mf + recolor3mf del studio, vía Node)
        │
labs/slice_qa.mjs         laminado real por lotes de 20 con bsx CLI → print_time_h / weight_g
        │                  reales al manifiesto; pass/fail por archivo
labs/build_*.mjs          manifiestos (origin printgo-labs, licencia restrictiva) + previews
        │
scripts/build_api.mjs → validate → commit → push    (flujo existente, sin cambios de esquema)
```

## Reglas de integridad 3MF (aprendizajes verificados del handoff 2026-09-28)

- Cero geometría bajo la cama (z=0 es la cara apoyada; Bambu recorta lo que baja).
- `wall_generator=arachne` en piezas con texto (trazos 0.5–0.8 mm).
- Conteo de platos conservado; índices de filamento secuenciales; área de cama intacta.
- Altura de capa uniforme (preset `0.20mm Standard @BBL X1C` del proyecto exportado).
- Sin torre de purga sobre piezas; multi-filamento solo cuando aporta (p. ej. tallo verde).

## Estado

- `halloween-2026`: primera línea (urgencia estacional; la categoría scrapeada está 100 % en
  cuarentena por licencia y se retira con `scripts/quarantine.mjs` cuando este lote esté verificado).
- `phone-cases`: funda TPU paramétrica iPhone 11→16, cada variante un archivo.
