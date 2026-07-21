# ElectroMap - Buscador de Cargadores Eléctricos

Buscador global de estaciones de carga para autos eléctricos, construido con HTML, CSS y JavaScript vanilla. Usa Leaflet.js para el mapa y Open Charge Map API para los datos.

## Inicio Rápido

### 1. Obtener API Key (Gratis)

1. Ve a [openchargemap.io](https://openchargemap.io)
2. Crea una cuenta gratuita
3. Ve a tu perfil > API Key
4. Copia tu API key

### 2. Configurar la API Key

Abre `assets/data.js` y reemplaza `YOUR_API_KEY_HERE` con tu API key:

```javascript
let API_KEY = 'tu-api-key-aqui';
```

O también puedes guardarla en localStorage desde la consola del navegador:

```javascript
localStorage.setItem('em-api-key', 'tu-api-key-aqui');
```

### 3. Abrir el Sitio

Simplemente abre `index.html` en tu navegador.

## Funcionalidades

- **Mapa interactivo** con marcadores de cargadores
- **Clustering** de marcadores cuando hay muchos en una zona
- **Sidebar de detalles** con información completa del cargador
- **Búsqueda** por nombre, dirección, ciudad u operador
- **Filtros** por tipo de conector, nivel de carga y estado
- **Tema oscuro/claro** con persistencia
- **Ubicación actual** del usuario
- **Navegación** directa a Google Maps

## Tipos de Conector

- **CCS (Combo)** - Corriente continua, alta potencia
- **CHAdeMO** - Corriente continua, alta potencia
- **Type 2 (Mennekes)** - Corriente alterna, nivel 2
- **Tesla** - Supercharger y destination chargers
- **Type 1 (J1772)** - Corriente alterna, nivel 2

## Colores de Marcadores

- **Rojo** - Carga rápida DC (Level 3)
- **Amarillo** - Nivel 2 (AC)
- **Gris** - Nivel 1

## Tecnologías

- HTML5, CSS3, JavaScript (ES6+)
- [Leaflet.js](https://leafletjs.com/) - Mapas
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) - Clustering
- [Open Charge Map API](https://openchargemap.io/) - Datos de cargadores

## Estructura

```
electromap/
├── index.html          # Página principal
├── css/
│   └── style.css       # Estilos con temas
├── assets/
│   ├── data.js         # Capa de datos y API
│   ├── map.js          # Gestión del mapa
│   └── main.js         # Lógica de la aplicación
└── README.md           # Este archivo
```

## Licencia

Proyecto abierto para uso personal y educativo.