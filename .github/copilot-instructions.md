# GitHub Copilot Instructions - Museum Floor Plan Editor

## 🏗️ Architecture & Principes Fondamentaux

Ce projet suit une **architecture en couches strictement centralisée** pour garantir la maintenabilité, la réutilisabilité et éviter toute duplication de code.

### Principe D'OR : **DRY (Don't Repeat Yourself)**
> **Avant d'écrire TOUTE nouvelle fonction, constante ou type :**
> 1. ✅ **VÉRIFIER** si elle existe dans `core/`
> 2. ✅ **RÉUTILISER** si elle existe
> 3. ✅ **CRÉER dans core/** si elle n'existe pas
> 4. ❌ **JAMAIS dupliquer** du code

---

## 📁 Structure Hiérarchique (Bottom-Up)

```
core/                          # FONDATION - Code réutilisable partout
├── entities/                  # Types TypeScript SEULEMENT
├── constants/                 # TOUTES les constantes (grille, couleurs, contraintes)
├── services/                  # TOUTE la logique métier (calculs, validation, géométrie)
└── utils/                     # Utilitaires transversaux

shared/                        # COMPOSANTS RÉUTILISABLES
├── hooks/                     # Hooks React génériques (debounce, throttle)
├── components/                # Composants UI génériques
└── utils/                     # Utilitaires UI

features/                      # FONCTIONNALITÉS SPÉCIFIQUES
├── canvas/                    # Fonctionnalité Canvas
│   ├── hooks/                 # Hooks Canvas (interaction uniquement)
│   ├── utils/                 # Renderers (dessin SEULEMENT)
│   ├── components/            # Composants UI Canvas
│   └── Canvas.tsx             # Orchestration
│
└── editor/                    # Fonctionnalité Éditeur
    ├── components/            # Toolbar, Panel, etc.
    └── MuseumEditor.tsx       # Orchestration
```

---

## 🎯 Règles de Codage STRICTES

### 1. **Types & Interfaces** → `core/entities/`

❌ **INTERDIT** :
```typescript
// Dans un composant
interface Point { x: number, y: number }
interface Room { id: string, polygon: Point[] }
```

✅ **OBLIGATOIRE** :
```typescript
import type { Point, Room } from '@/core/entities'
```

**Emplacement** : `core/entities/geometry.types.ts`, `museum.types.ts`, etc.

---

### 2. **Constantes** → `core/constants/`

❌ **INTERDIT** :
```typescript
const GRID_SIZE = 40
const SNAP_THRESHOLD = 0.8
const MIN_AREA = 5
```

✅ **OBLIGATOIRE** :
```typescript
import { GRID_SIZE, SNAP_THRESHOLD } from '@/core/constants'
import { CONSTRAINTS } from '@/core/constants'
```

**Organisation** :
- `grid.constants.ts` → Grille, snap
- `colors.constants.ts` → Couleurs
- `constraints.constants.ts` → Min/max (surfaces, distances)
- `feedback.constants.ts` → Feedback visuel
- `interaction.constants.ts` → Hit detection, radius
- `zoom.constants.ts` → Zoom/pan
- `misc.constants.ts` → Géométrie, polices

---

### 3. **Calculs & Logique Métier** → `core/services/`

❌ **INTERDIT** (logique dans composant) :
```typescript
function MyComponent() {
  const snapped = { 
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize 
  }
  const area = calculateArea(polygon)
  const valid = area > 5 && area < 1000
}
```

✅ **OBLIGATOIRE** (service centralisé) :
```typescript
import { snapToGrid, calculatePolygonAreaInMeters } from '@/core/services'
import { validateRoomGeometry } from '@/core/services'

function MyComponent() {
  const snapped = snapToGrid(point, GRID_SIZE)
  const validation = validateRoomGeometry(room, { floor })
}
```

**Services disponibles** :
- `geometry.service.ts` → Snap, distance, polygones, formes, calculs
- `validation.service.ts` → Validation rooms, walls, artworks
- `walls.service.ts` → Logique murs (attachement, détection)
- `snap.service.ts` → Snap intelligent (vertices, edges, grid)

---

### 4. **Renderers** → `features/canvas/utils/*.renderer.ts`

**Règle** : Renderers = **DESSIN UNIQUEMENT**, PAS de calculs

❌ **INTERDIT** :
```typescript
export function drawRoom(ctx, room, zoom, pan) {
  const area = calculateArea(room.polygon)  // ❌ Calcul
  const isValid = checkOverlap(room)        // ❌ Validation
  
  ctx.fillStyle = isValid ? 'green' : 'red'
  ctx.fill()
}
```

✅ **OBLIGATOIRE** :
```typescript
export function drawRoom(
  ctx: CanvasRenderingContext2D,
  room: Room,
  zoom: number,
  pan: Point,
  isSelected: boolean,
  isHovered: boolean
) {
  // UNIQUEMENT du code Canvas
  ctx.fillStyle = COLORS.room.fill
  ctx.strokeStyle = isSelected ? COLORS.selected : COLORS.room.stroke
  ctx.fill()
  ctx.stroke()
}
```

**Renderers disponibles** :
- `grid.renderer.ts`
- `room.renderer.ts`
- `wall.renderer.ts`
- `door.renderer.ts`
- `artwork.renderer.ts`
- `shape-preview.renderer.ts` (preview création)
- `measurement.renderer.ts`

---

### 5. **Imports Centralisés** → Utiliser `index.ts`

❌ **INTERDIT** (import direct) :
```typescript
import { snapToGrid } from '@/core/services/geometry.service'
import { GRID_SIZE } from '@/core/constants/grid.constants'
import { drawRoom } from '@/features/canvas/utils/room.renderer'
```

✅ **OBLIGATOIRE** (via index) :
```typescript
import { snapToGrid } from '@/core/services'
import { GRID_SIZE } from '@/core/constants'
import { drawRoom } from '@/features/canvas/utils'
```

---

### 6. **Hooks** → Par Niveau de Réutilisabilité

#### A. Hooks Génériques → `shared/hooks/`
```typescript
export * from './useDebounce'
export * from './useThrottle'
export * from './useRenderOptimization'
```

#### B. Hooks Canvas → `features/canvas/hooks/`
```typescript
export * from './useZoomPan'           // Zoom & Pan
export * from './useCanvasSelection'   // Sélection éléments
export * from './useShapeCreation'     // Création formes
```

**Règle** : Hook = **Logique d'interaction**, PAS de logique métier

❌ **INTERDIT** :
```typescript
function useMyHook() {
  const area = calculateArea(polygon)  // ❌ Calcul métier
  const isValid = area > 5             // ❌ Validation métier
}
```

✅ **OBLIGATOIRE** :
```typescript
function useShapeCreation({ tool, currentFloor, onComplete }) {
  // Appeler les services pour calculs/validation
  const validation = validateRoomGeometry(tempRoom, { floor: currentFloor })
  
  // Gérer l'interaction uniquement
  const startCreation = useCallback((point) => { ... })
  return { state, startCreation, updateCreation }
}
```

---

## 🔍 Workflow Avant d'Écrire du Code

### Checklist OBLIGATOIRE :

```bash
# 1. Le type existe-t-il ?
→ Chercher dans core/entities/

# 2. La constante existe-t-elle ?
→ Chercher dans core/constants/

# 3. La fonction existe-t-elle ?
→ Chercher dans core/services/

# 4. Le renderer existe-t-il ?
→ Chercher dans features/canvas/utils/

# 5. Le hook existe-t-il ?
→ Chercher dans features/*/hooks/ et shared/hooks/

# SI N'EXISTE PAS → Créer au BON endroit selon les règles
```

---

## 📐 Système de Grille & Mesures

### Constantes Fondamentales
```typescript
GRID_SIZE = 40              // pixels par unité grille
GRID_TO_METERS = 0.5        // 1 unité grille = 0.5 mètre
// → 1 petit carré = 0.5m × 0.5m
```

### Snap Obligatoire
```typescript
import { snapToGrid, smartSnap } from '@/core/services'

// Snap simple (grille)
const snapped = snapToGrid(point, GRID_SIZE)

// Snap intelligent (vertices + edges + grille)
const snapResult = smartSnap(worldPos, currentFloor)
// snapResult.snapType: 'vertex' | 'edge' | 'midpoint' | 'grid'
```

---

## 🎨 Validation Géométrique

### Règles de Validation

**Contact vs Chevauchement** :
- ✅ **Contact autorisé** : Pièces peuvent partager des arêtes/points
- ❌ **Chevauchement interdit** : Surfaces internes ne doivent pas se chevaucher

```typescript
import { validateRoomGeometry, polygonsOverlap } from '@/core/services'

// Validation complète d'une pièce
const validation = validateRoomGeometry(room, {
  floor: currentFloor,
  strictMode: true,
  allowWarnings: false
})

// Résultat :
// validation.valid: boolean
// validation.severity: 'error' | 'warning' | 'info'
// validation.message: string
// validation.visualFeedback: { color, opacity, strokeWidth }
```

---

## 🎭 Feedback Visuel (Création de Formes)

### Couleurs selon État
```typescript
import { VISUAL_FEEDBACK } from '@/core/constants'

VISUAL_FEEDBACK.colors.valid      // '#22c55e' (vert)
VISUAL_FEEDBACK.colors.invalid    // '#dc2626' (rouge)
VISUAL_FEEDBACK.colors.warning    // '#f59e0b' (orange)
VISUAL_FEEDBACK.colors.creating   // '#3b82f6' (bleu)
VISUAL_FEEDBACK.colors.neutral    // '#6b7280' (gris)
```

### Preview Professionnelle
```typescript
import { drawShapePreview } from '@/features/canvas/utils'

drawShapePreview(ctx, {
  polygon: previewPolygon,
  isValid: validation.valid,
  validationSeverity: validation.severity,
  zoom,
  pan,
  showVertices: true,
  animationPhase: Date.now() / 50  // Pointillés animés
})
```

---

## 🧩 Création de Formes Géométriques

### Formes Disponibles
```typescript
import { 
  createCirclePolygon,
  createTrianglePolygon,
  createArcPolygon 
} from '@/core/services'

// Cercle
const polygon = createCirclePolygon(center, radius, GRID_SIZE)

// Triangle
const polygon = createTrianglePolygon(p1, p2, GRID_SIZE)

// Arc
const polygon = createArcPolygon(start, middle, end, GRID_SIZE)
```

**Important** : Toujours snapper chaque point après création
```typescript
const polygon = createCirclePolygon(center, radius, GRID_SIZE)
const snappedPolygon = polygon.map(p => snapToGrid(p, GRID_SIZE))
```

---

## 🚫 Anti-Patterns INTERDITS

### 1. Duplication de Code
```typescript
// ❌ MAUVAIS - Même logique en double
function snapPoint1(p) { return { x: Math.round(p.x/40)*40, y: Math.round(p.y/40)*40 }}
function snapPoint2(p) { return { x: Math.round(p.x/40)*40, y: Math.round(p.y/40)*40 }}

// ✅ BON - Service centralisé
import { snapToGrid, GRID_SIZE } from '@/core'
const snapped = snapToGrid(point, GRID_SIZE)
```

### 2. Logique Métier dans Composants
```typescript
// ❌ MAUVAIS
function Canvas() {
  const area = Math.abs(polygon.reduce(...))  // Calcul inline
  const valid = area > 5 && area < 1000       // Validation inline
}

// ✅ BON
import { validateRoomGeometry } from '@/core/services'
function Canvas() {
  const validation = validateRoomGeometry(room, { floor })
}
```

### 3. Constantes en Dur
```typescript
// ❌ MAUVAIS
const gridSize = 40
const minArea = 5

// ✅ BON
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'
```

### 4. Imports Directs (Non-index)
```typescript
// ❌ MAUVAIS
import { snapToGrid } from '@/core/services/geometry.service'

// ✅ BON
import { snapToGrid } from '@/core/services'
```

---

## 📝 Conventions de Nommage

### Fichiers
- **Composants** : `PascalCase.tsx` (ex: `MuseumEditor.tsx`)
- **Hooks** : `camelCase.ts` préfixe `use` (ex: `useZoomPan.ts`)
- **Services** : `camelCase.service.ts` (ex: `geometry.service.ts`)
- **Renderers** : `kebab-case.renderer.ts` (ex: `room.renderer.ts`)
- **Utils** : `kebab-case.utils.ts` (ex: `coordinates.utils.ts`)
- **Constants** : `kebab-case.constants.ts` (ex: `grid.constants.ts`)
- **Types** : `kebab-case.types.ts` (ex: `geometry.types.ts`)

### Variables & Fonctions
```typescript
// Constantes globales
export const GRID_SIZE = 40                    // SCREAMING_SNAKE_CASE
export const SNAP_THRESHOLD = 0.8

// Fonctions
export function snapToGrid(point: Point) {}    // camelCase

// Composants React
export function MuseumEditor() {}              // PascalCase

// Hooks
export function useZoomPan() {}                // camelCase + "use" prefix
```

---

## 🔧 Exemples de Code Conformes

### Composant avec Services
```typescript
import { useCallback } from 'react'
import type { EditorState, Point, Room } from '@/core/entities'
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'
import { 
  snapToGrid, 
  validateRoomGeometry, 
  createCirclePolygon 
} from '@/core/services'
import { useShapeCreation } from '@/features/canvas/hooks'
import { drawRoom, drawGrid } from '@/features/canvas/utils'

export function Canvas({ state, updateState }: CanvasProps) {
  const shapeCreation = useShapeCreation({
    tool: state.selectedTool,
    currentFloor,
    onComplete: (polygon) => {
      const room: Room = { id: uuidv4(), polygon }
      const validation = validateRoomGeometry(room, { floor: currentFloor })
      
      if (validation.valid) {
        updateState({ /* ... */ }, true, 'Create room')
      }
    }
  })
  
  return <canvas ref={canvasRef} />
}
```

### Service avec Types
```typescript
import type { Point, Room, ValidationResult } from '@/core/entities'
import { GRID_SIZE, CONSTRAINTS } from '@/core/constants'

export function validateRoomGeometry(
  room: Room, 
  context?: ValidationContext
): ValidationResult {
  const area = calculatePolygonAreaInMeters(room.polygon)
  
  if (area < CONSTRAINTS.room.minArea) {
    return {
      valid: false,
      severity: 'error',
      message: `Surface trop petite (${area}m² < ${CONSTRAINTS.room.minArea}m²)`,
      visualFeedback: {
        color: VISUAL_FEEDBACK.colors.invalid,
        opacity: 0.5
      }
    }
  }
  
  return { valid: true, severity: 'info', message: 'Pièce valide' }
}
```

---

## 📊 Hiérarchie des Dépendances

```
app/                    → Dépend de features/
  └── editor/page.tsx

features/               → Dépend de core/ + shared/
  ├── canvas/
  └── editor/

shared/                 → Dépend de core/
  ├── hooks/
  └── components/

core/                   → Ne dépend de RIEN (fondation)
  ├── entities/
  ├── constants/
  ├── services/
  └── utils/

legacy/                 → À IGNORER (code ancien)
```

**Règle** : Les dépendances vont **TOUJOURS** vers le bas (bottom-up)

---

## ✅ Checklist Avant Commit

- [ ] **Imports** uniquement depuis `index.ts` (`@/core/services`, `@/core/constants`)
- [ ] **Types** importés depuis `@/core/entities`
- [ ] **Constantes** depuis `@/core/constants` (aucune en dur)
- [ ] **Logique métier** UNIQUEMENT dans `core/services/`
- [ ] **Renderers** contiennent UNIQUEMENT du code Canvas
- [ ] **Hooks** gèrent interaction, PAS logique métier
- [ ] **Aucune duplication** de code (vérifier avant de créer)
- [ ] **Nommage** conforme (camelCase, PascalCase, kebab-case)
- [ ] **TypeScript strict** : Pas de `any` sauf justification explicite

---

## 🚀 En Résumé

### Les 3 Commandements

1. **TOUJOURS vérifier si ça existe dans `core/`**
2. **JAMAIS dupliquer** de code ou constantes
3. **TOUJOURS séparer** : Logique (services) ≠ UI (composants) ≠ Rendu (renderers)

### En Cas de Doute

> **Si tu hésites sur où mettre du code :**
> - C'est un calcul/validation ? → `core/services/`
> - C'est une constante ? → `core/constants/`
> - C'est un type ? → `core/entities/`
> - C'est du dessin Canvas ? → `features/canvas/utils/*.renderer.ts`
> - C'est de l'interaction ? → `features/*/hooks/`

**Zero tolerance pour la duplication !** 🎯
