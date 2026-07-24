# ElectroMap — Buscador de Cargadores Eléctricos

Aplicación web para encontrar estaciones de carga para autos eléctricos en México. Construida con HTML, CSS y JavaScript vanilla, sin frameworks.

🌐 **Sitio en vivo:** [electromap.josue.work](https://electromap.josue.work)

---

## Funcionalidades

### Mapa
- **2,046 estaciones CFE** cargadas desde datos oficiales del gobierno mexicano
- Marcadores con colores por tipo de carga (DC Rápida / Nivel 2 / Nivel 1)
- Clustering de marcadores cuando hay muchos en una zona
- Tema oscuro/claro con persistencia
- Ubicación actual del usuario
- Buscador de direcciones con Google Places API
- Navegación con indicaciones paso a paso (OSRM)

### Comunidad (requiere sesión)
- **Favoritos** — guardar/quitar estaciones
- **Reseñas y calificaciones** — comentar y calificar estrellas (1-5)
- **Fotos** — subir fotos de estaciones con lightbox
- **Nueva estación** — reportar estaciones de carga nuevas con mapa interactivo
- **Reportar problema** — reportar estaciones dañadas o con info incorrecta

### Perfil de usuario
- Registro e inicio de sesión con email/contraseña (Supabase Auth)
- Recuperación de contraseña
- Foto de perfil
- Historial de favoritos, reseñas y fotos

### Panel de Administración
- **Resumen** — estadísticas de usuarios, reportes, reseñas, fotos
- **Usuarios** — gestionar roles (admin/usuario)
- **Reportes** — aprobar/rechazar estaciones nuevas, resolver problemas
- **Estaciones** — crear, editar y eliminar estaciones desde el dashboard
- **Reseñas** — moderar y eliminar reseñas
- **Fotos** — moderar y eliminar fotos

### Datos
- Datos de estaciones CFE desde el [repositorio oficial del gobierno mexicano](https://repodatos.atdt.gob.mx)
- Coordenadas, conectores, potencia, costo, operador por estación
- Estaciones aprobadas por la comunidad se muestran junto con las de CFE
- Edición de estaciones CFE desde el mapa (admin)

---

## Tecnologías

| Componente | Tecnología |
|------------|-----------|
| Frontend | HTML5, CSS3, JavaScript vanilla |
| Mapa | [Leaflet.js](https://leafletjs.com/) + CARTO tiles |
| Clustering | [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) |
| Base de datos | [Supabase](https://supabase.com/) (PostgreSQL + Auth + RLS) |
| Búsqueda de direcciones | [Google Places API](https://developers.google.com/maps/documentation/places) |
| Navegación | [OSRM](http://project-osrm.org/) (direcciones) + Web Speech API (voz) |
| Despliegue | [Vercel](https://vercel.com/) (serverless functions + hosting) |

---

## Estructura

```
electromap/
├── index.html              # Página principal
├── css/
│   └── style.css           # Estilos con temas oscuro/claro
├── assets/
│   ├── data.js             # Carga y filtrado de datos CFE
│   ├── supabase.js         # Operaciones CRUD con Supabase
│   ├── map.js              # Gestión del mapa Leaflet
│   └── main.js             # Lógica de la aplicación
├── api/
│   ├── config.js           # Serverless: API keys seguras
│   └── places.js           # Proxy de Google Places API
├── cfe-data.json           # Datos de 2,046 estaciones CFE
└── convert-cfe.js          # Conversor CSV → JSON
```

---

## Seguridad

- **API keys** — servidas desde Vercel serverless functions (`api/config.js`), nunca expuestas al cliente
- **Google Places** — proxy server-side (`api/places.js`) para evitar CORS y proteger la key
- **Supabase RLS** — Row Level Security protege los datos; la `anon key` es pública por diseño
- **Roles** — campo `role` en `user_profiles` con políticas RLS específicas para admins

---

## Variables de Entorno (Vercel)

| Variable | Descripción |
|----------|------------|
| `GOOGLE_MAPS_KEY` | API key de Google Maps |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_KEY` | Anon key de Supabase |

---

## Base de Datos (Supabase)

| Tabla | Propósito |
|-------|-----------|
| `user_profiles` | Perfiles de usuario (nombre, email, avatar, rol) |
| `favorites` | Estaciones favoritas por usuario |
| `comments` | Reseñas y calificaciones por cargador |
| `photos` | Fotos subidas por usuarios |
| `reports` | Reportes de problemas y estaciones nuevas |
| `visit_history` | Historial de visitas |
| `approved_stations` | Estaciones aprobadas por admin (aparecen en el mapa) |

---

## Desarrollo Local

```bash
# Clonar el repositorio
git clone https://github.com/rzbrnl/electromap.git
cd electromap

# Abrir en navegador
open index.html

# Los datos de CFE ya están en cfe-data.json
# Las API keys se sirven desde api/config.js
```

---

## Despliegue

El sitio se despliega automáticamente en Vercel al hacer push al branch `main`.

```bash
git push origin main
```

---

## Licencia

Proyecto abierto para uso personal y educativo.
