# Sistema de Reservas y Recursos Tecnológicos
### Instituto Universitario de Caldas

Aplicación web institucional **multipágina** para centralizar la solicitud, aprobación y
administración de reservas de espacios físicos y recursos tecnológicos.

> **Estado:** aplicación funcional y verificada. La interfaz reproduce los 16 mockups
> institucionales y la lógica de negocio está implementada tanto en la aplicación como en
> PostgreSQL (RLS + restricción de exclusión anti-solape).

---

## 1. Qué resuelve

El informe institucional identifica que hoy la gestión recae en una sola persona del área de
sistemas: no hay disponibilidad consultable, las solicitudes no quedan registradas y no existe
trazabilidad. Esta plataforma atiende los nueve problemas (P1–P9) con:

- Consulta autónoma de disponibilidad (calendario día / semana / mes).
- Solicitudes con aprobación o rechazo del encargado.
- Control de conflictos de horario **en la base de datos**.
- Inventario de espacios, equipos y elementos de acceso (llaves y controles).
- Entregas y devoluciones con estados propios.
- Historial y auditoría permanentes.
- Dos perfiles exactos: **profesor** y **encargado de sistemas**.

---

## 2. Stack y arquitectura

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite 7 |
| Estructura | **MPA real**: 10 archivos HTML como puntos de entrada |
| Estilos | CSS propio con sistema de diseño (sin framework de utilidades) |
| Iconos | Lucide React |
| Fuentes | Jost + Inter, **servidas localmente** (`public/assets/fonts`) |
| Datos | Supabase (PostgreSQL + Auth) con RLS |
| Operaciones críticas | Funciones SQL `SECURITY DEFINER` atómicas |
| Cuentas | Edge Function `admin-create-user` (service_role solo en servidor) |

### Estructura del proyecto

```text
sistema-reservas/
├── index.html                # Iniciar sesión
├── recuperar.html            # Recuperación de contraseña
├── panel.html                # Panel (profesor / encargado)
├── calendario.html           # Calendario día / semana / mes
├── solicitudes.html          # Solicitudes y reservas
├── nueva-solicitud.html      # Formulario del profesor
├── recursos.html             # Inventario de espacios y recursos
├── entregas.html             # Entregas y devoluciones
├── historial.html            # Historial de operaciones
├── usuarios.html             # Cuentas (solo encargado)
├── public/assets/
│   ├── fonts/                # Jost + Inter (woff2, local)
│   ├── logos/                # Marca institucional (SVG)
│   └── backgrounds/          # Ilustración del edificio (SVG)
├── src/
│   ├── components/           # AppShell, StatusChip, ui (modal, toasts…)
│   ├── css/                  # base.css (design system) + pages.css
│   ├── js/                   # dates.ts, session.ts
│   ├── pages/                # Un entrypoint por HTML
│   ├── services/             # types, rules, api, supabase, supabaseApi, demo, data
│   └── sql/                  # 0001_schema, 0002_security, 0003_seed
├── supabase/functions/admin-create-user/index.ts
├── tests/                    # harness_auth.sql + rls_tests.sql
├── .env.example
└── vite.config.ts
```

---

## 3. Instalación y ejecución local

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env
#    Edita .env con la URL y la anon key de tu proyecto Supabase

# 3. Desarrollo
npm run dev          # http://localhost:3000

# 4. Compilación de producción
npm run build        # verifica tipos y genera dist/ con las 10 páginas
npm run preview      # sirve dist/
```

> **Sin `.env`** la aplicación arranca en **modo demostración** (aviso amarillo visible): los
> datos viven en `localStorage` y se aplican las mismas reglas de negocio. Sirve para revisar la
> interfaz, **no** es el entregable de producción.

### Credenciales del modo demostración

| Perfil | Correo | Contraseña |
|--------|--------|-----------|
| Encargado | `encargado@iuc.edu.co` | `Demo1234` |
| Profesor | `ana.martinez@iuc.edu.co` | `Demo1234` |
| Profesor | `juan.perez@iuc.edu.co` | `Demo1234` |

---

## 4. Configuración de Supabase

### 4.1 Crear el proyecto

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Copia **Project URL** y **anon public key** a tu `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. **Nunca** pongas la `service_role` en el frontend ni con prefijo `VITE_`.

### 4.2 Crear tablas, políticas y datos iniciales

En el **SQL Editor** de Supabase ejecuta, en este orden:

1. `src/sql/0001_schema.sql` — tablas, relaciones, restricciones, índices y la restricción de
   exclusión `reservations_no_overlap`.
2. `src/sql/0002_security.sql` — funciones `SECURITY DEFINER`, triggers de auditoría y **RLS**.
3. `src/sql/0003_seed.sql` — configuración, pisos, categorías y recursos de referencia.

Los tres scripts son idempotentes: se pueden volver a ejecutar sin destruir información.

### 4.3 Crear el primer encargado (procedimiento controlado)

En **Authentication → Users → Add user** crea la cuenta y luego, en el SQL Editor:

```sql
update public.profiles
   set role = 'encargado'
 where email = 'encargado@iuc.edu.co'
   and not exists (select 1 from public.profiles where role = 'encargado');
```

El trigger `guard_profile_role()` impide que cualquier usuario cambie su propio rol desde la
aplicación. Los profesores se crean desde **Cuentas** (Edge Function) y siempre nacen como
`profesor`.

### 4.4 Edge Function para crear cuentas

```bash
supabase functions deploy admin-create-user
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=tu_clave_privada
```

La función verifica el JWT del solicitante y comprueba en `profiles` que sea `encargado` antes
de usar la clave privada.

---

## 5. Despliegue en Vercel

```bash
git init && git add . && git commit -m "Sistema de reservas IUC"
git remote add origin https://github.com/USUARIO/REPO.git
git push -u origin main
```

En Vercel: **Import Project → Framework: Vite → Build: `npm run build` → Output: `dist`**, y
añade las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Añade `vercel.json` si necesitas reescrituras; con HTML reales por página no son necesarias.

---

## 6. Mapa de rutas y funcionalidad

| Página | Perfil | Contenido |
|--------|--------|-----------|
| `/index.html` | público | Inicio de sesión, sesión persistente, redirección por perfil |
| `/recuperar.html` | público | Solicitud de recuperación y definición de nueva contraseña |
| `/panel.html` | ambos | Profesor: próximas reservas, mis solicitudes, disponible ahora. Encargado: 5 indicadores, solicitudes pendientes, agenda del día, accesos rápidos |
| `/calendario.html` | ambos | Vistas día / semana / mes, filtro por recurso, disponibilidad, leyenda. El encargado crea reservas aprobadas |
| `/solicitudes.html` | ambos | Filtros por estado, búsqueda, aprobar / rechazar (con observación obligatoria), cancelar |
| `/nueva-solicitud.html` | profesor | Tipo de recurso, recurso, fecha, horas, propósito, disponibilidad del día y franjas libres |
| `/recursos.html` | ambos (edición) | Tabla con búsqueda, piso, estado, paginación; alta, edición y retiro lógico |
| `/entregas.html` | ambos (edición) | Pestañas por entregar / entregados / vencidas, línea de tiempo, detalle, devolución |
| `/historial.html` | ambos | Trazabilidad con filtros, estado anterior → estado nuevo, exportación CSV |
| `/usuarios.html` | encargado | Cuentas de profesor, creación y activación/desactivación |

### Reglas de negocio implementadas

| # | Regla | Dónde se garantiza |
|---|-------|--------------------|
| 1 | Toda solicitud nace pendiente | RLS `requests_insert` + `INITIAL_REQUEST_STATUS` |
| 2 | Solo el encargado aprueba o rechaza | `is_encargado()` en `decide_request()` |
| 3 | El profesor solo ve y gestiona lo suyo | Políticas RLS por `requester_id = auth.uid()` |
| 4 | Sin solapes del mismo recurso | `decide_request()` + constraint `reservations_no_overlap` (`EXCLUDE USING gist`) |
| 5 | Recursos fuera de servicio no reservables | Validación en `decide_request()` + UI |
| 6 | Canceladas no bloquean disponibilidad | `cancel_request()` marca la reserva como `cancelada` |
| 7 | Cambios de horario revalidan | `decide_request()` recalcula conflicto |
| 8 | Operaciones administrativas registradas | Triggers `requests_audit`, `resources_audit`, `deliveries_audit` |
| 9 | Entregas y devoluciones con estado propio | Tabla `deliveries` + `register_return()` |
| 10 | Información histórica conservada | `audit_log` sin políticas de UPDATE/DELETE; borrado lógico de recursos |

---

## 7. Pruebas ejecutadas (resultados reales)

### 7.1 Verificación contra PostgreSQL 17

El esquema, las políticas RLS y las reglas de negocio se ejecutaron sobre PostgreSQL 17 real
usando `tests/harness_auth.sql` (simulación del esquema `auth` de Supabase).

```bash
createdb iuc_test
psql -d iuc_test -f tests/harness_auth.sql
psql -d iuc_test -f src/sql/0001_schema.sql
psql -d iuc_test -f src/sql/0002_security.sql
psql -d iuc_test -f src/sql/0003_seed.sql
psql -d iuc_test -f tests/rls_tests.sql
```

**Resultado: 29 comprobaciones, todas con el comportamiento esperado.**

| Prueba | Esperado | Obtenido |
|--------|----------|----------|
| T01 Perfiles creados por trigger | primer usuario = encargado | ✅ encargado |
| T02 Segundo `bootstrap_admin` | no escala privilegios | ✅ profesor |
| T03 Profesor crea su solicitud | funciona | ✅ insertado |
| T04 Profesor crea a nombre de otro | falla | ✅ RLS |
| T05 Profesor inserta `aprobada` | falla | ✅ RLS |
| T06 Profesor se autoasciende | falla | ✅ trigger |
| T07 Profesor aprueba | falla | ✅ `42501` |
| T08 Profesor crea recursos | falla | ✅ RLS |
| T09 Profesor ve solo lo suyo | 1 | ✅ 1 |
| T10b Profesor inserta solicitud ajena | falla | ✅ RLS |
| T12 Encargado aprueba | funciona | ✅ aprobada |
| T13 Aprobar solapada | falla | ✅ conflicto |
| T14 Insertar reserva solapada | falla | ✅ `reservations_no_overlap` |
| T15 Rechazo sin observación | falla | ✅ |
| T16 Rechazo con observación | funciona | ✅ rechazada |
| T17 Aprobar recurso en mantenimiento | falla | ✅ |
| T18 Franja contigua 11:00–13:00 | permitida | ✅ aprobada |
| T19–T20 Entrega y devolución con daños | funciona, recurso → mantenimiento | ✅ devuelto / mantenimiento |
| T21 Doble devolución | falla | ✅ |
| T22 Profesor cancela lo suyo | funciona | ✅ cancelada |
| T23 Profesor cancela lo ajeno | falla por permisos | ✅ `42501` |
| T24 Franja liberada reutilizable | funciona | ✅ aprobada |
| T25 Entrega visible por profesor | solo la propia | ✅ 1 |
| T26 Profesor registra devolución | falla | ✅ |
| T27 Historial automático | 17 eventos coherentes | ✅ |
| T28 Historial del profesor | solo el propio | ✅ 2 |
| T29 Historial del encargado | completo | ✅ 17 |

### 7.2 Verificación de la aplicación

- `npm run build` con `tsc --noEmit`: **sin errores de tipos**, 10 HTML generados.
- Las 10 páginas cargan y navegan en el navegador (Chromium headless) sin errores de consola
  relevantes, en escritorio (1440 px) y móvil (390 px).
- Todos los assets se sirven localmente: `/assets/fonts/*.woff2`, `/assets/logos/*.svg`,
  `/assets/backgrounds/*.svg`. Sin dependencias de CDN ni referencias 404.

---

## 8. Decisiones de diseño relevantes

- **MPA real, no SPA**: cada pantalla es un HTML independiente que comparte componentes,
  estilos y servicios, tal como pidió el informe.
- **La seguridad no depende de la interfaz**: ocultar botones es solo usabilidad; las políticas
  RLS y las funciones `SECURITY DEFINER` son la frontera real.
- **Anti-solape en dos capas**: validación en `decide_request()` (mensaje claro) y
  `EXCLUDE USING gist` (garantía última, incluso ante escrituras concurrentes).
- **Sin borrado físico**: los recursos se retiran lógicamente y el historial nunca se pierde.
- **Diseño fiel a los mockups**: vino `#582242`, crema `#F5EEE0`, verde `#96B395`,
  malva `#B57C9F`; tipografía Jost + Inter; chips `Chip: Operativo`, línea de tiempo de
  entregas, tarjetas de estadísticas y navegación inferior en móvil.

---

## 9. Configuraciones institucionales pendientes de validación

Estos datos **no fueron suministrados** y el sistema los deja configurables; no se inventaron:

1. **Cantidad real de salas, televisores, llaves y controles.** La semilla usa 9 recursos de
   referencia marcados como «pendiente de validación institucional». El encargado los edita
   desde **Recursos**.
2. **Capacidades y ubicaciones exactas** por piso y edificio.
3. **Horario institucional oficial.** `schedules` y `settings` usan 06:00–18:00 como referencia.
4. **Política de anticipación mínima / máxima** para solicitar reservas.
5. **Política de recuperación de contraseña** (el texto en `settings.password_reset_note` es
   provisional).
6. **Procedimiento de continuidad del encargado único** (custodia de credenciales y respaldo).
7. **Autoría, docente, asignatura y fecha** del informe institucional.
8. **Alojamiento definitivo y conectividad** (red institucional o internet).

---

## 10. Seguridad

- Autenticación real de Supabase Auth, sesión persistente y protección de todas las páginas.
- RLS habilitado en las 10 tablas; ninguna tabla expuesta sin política.
- Rol almacenado solo en `profiles.role`, protegido por trigger; imposible de autoasignar.
- `service_role` únicamente en la Edge Function, nunca en el bundle del navegador.
- Variables de entorno en `.env` (excluido por `.gitignore`); en Vercel, en el panel del
  proyecto.
- Errores de base de datos traducidos a mensajes legibles sin filtrar detalles internos.

---

## 11. Scripts disponibles

```bash
npm run dev         # servidor de desarrollo (puerto 3000)
npm run build       # tsc --noEmit + vite build
npm run typecheck   # solo verificación de tipos
npm run preview     # sirve dist/
```
