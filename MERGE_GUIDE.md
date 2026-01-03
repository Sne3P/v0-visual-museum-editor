# GUIDE DE MERGE - Refactor → Main

**Date**: 3 Janvier 2026  
**Objectif**: Merger la branche refactor avec main pour récupérer les changements backend

---

## 🚨 CONFLITS IDENTIFIÉS

### Fichiers en conflit:
1. **`components/export-dialog.tsx`**
   - **Main**: Version complète fonctionnelle (743 lignes)
   - **Refactor**: Placeholder vide temporaire (migration vers features/ prévue)
   - **Action**: Garder version MAIN lors du merge

2. **`components/artwork-pdf-dialog.tsx`**
   - **Main**: Version complète fonctionnelle (175 lignes)
   - **Refactor**: Placeholder vide temporaire (migration vers features/ prévue)
   - **Action**: Garder version MAIN lors du merge

### Fichiers créés pour le merge:
- ✅ `components/export-dialog.tsx` - Placeholder vide
- ✅ `components/artwork-pdf-dialog.tsx` - Placeholder vide

**But**: Éviter les conflits de fichiers absents, permettre git merge

---

## 📋 PROCÉDURE DE MERGE

### 1. **Préparer le merge**

```bash
# Vérifier status actuel
git status
git branch

# S'assurer d'être sur refactor branch
git checkout refactor/architecture

# Fetch derniers changements main
git fetch origin main
```

### 2. **Merger main dans refactor**

```bash
# Merge main
git merge origin/main

# Résoudre conflits automatiquement détectés
```

### 3. **Résolution des conflits**

**Si conflit sur export-dialog.tsx**:
```bash
# Prendre version main (complète)
git checkout --theirs components/export-dialog.tsx
```

**Si conflit sur artwork-pdf-dialog.tsx**:
```bash
# Prendre version main (complète)
git checkout --theirs components/artwork-pdf-dialog.tsx
```

**Autres conflits potentiels**:
- Fichiers de configuration (package.json, tsconfig.json)
- Types (@/lib/types vs @/core/entities)
- Imports dans app/

**Stratégie générale**:
- **Backend (database/, backend/)**: Prendre version MAIN
- **Architecture (core/, features/, shared/)**: Garder version REFACTOR
- **Components legacy**: Prendre version MAIN
- **Configuration Docker**: Garder version REFACTOR

### 4. **Vérification post-merge**

```bash
# Ajouter fichiers résolus
git add .

# Vérifier compilation TypeScript
pnpm build

# Si erreurs d'imports:
# Mettre à jour les imports de @/lib/types vers @/core/entities
```

### 5. **Commit du merge**

```bash
git commit -m "Merge main into refactor: Integrate backend changes + keep new architecture"
```

---

## 🔄 MIGRATION POST-MERGE

Après le merge réussi, migrer les composants vers nouvelle architecture :

### ExportDialog
```bash
# Déplacer vers features/
mkdir -p features/export
mv components/export-dialog.tsx features/export/ExportDialog.tsx

# Mettre à jour imports
# @/lib/types → @/core/entities
```

### ArtworkPdfDialog
```bash
# Déplacer vers features/
mkdir -p features/artwork
mv components/artwork-pdf-dialog.tsx features/artwork/ArtworkPdfDialog.tsx

# Mettre à jour imports
```

### Mettre à jour les références
```bash
# Rechercher imports
grep -r "components/export-dialog" app/
grep -r "components/artwork-pdf-dialog" app/

# Remplacer par nouveaux paths
# @/components/export-dialog → @/features/export/ExportDialog
```

---

## ✅ CHECKLIST POST-MERGE

- [ ] Merge effectué sans erreurs Git
- [ ] `pnpm build` réussit
- [ ] Types TypeScript cohérents
- [ ] Docker dev démarre correctement
- [ ] Backend accessible (API routes)
- [ ] Base de données opérationnelle
- [ ] Tests manuels export/PDF fonctionnels
- [ ] Migration vers features/ effectuée
- [ ] Imports mis à jour
- [ ] Legacy/ nettoyé

---

## 🛠️ COMMANDES UTILES

```bash
# Voir conflits
git diff --name-only --diff-filter=U

# Annuler merge (si problème)
git merge --abort

# Voir différences entre branches
git diff main..refactor/architecture --name-status

# Tester après merge
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

---

## 📊 RÉSUMÉ DES CHANGEMENTS

**Conservés de REFACTOR**:
- ✅ Architecture core/ features/ shared/
- ✅ Services métier (door, geometry, validation)
- ✅ Hooks Canvas modulaires
- ✅ Configuration Docker améliorée

**Récupérés de MAIN**:
- ✅ Backend database/ complet
- ✅ API routes mises à jour
- ✅ Composants export-dialog complet
- ✅ Composants artwork-pdf-dialog complet
- ✅ Dernières corrections backend

**À faire APRÈS merge**:
- ⚠️ Migrer export-dialog vers features/export/
- ⚠️ Migrer artwork-pdf-dialog vers features/artwork/
- ⚠️ Unifier types (@/lib/types → @/core/entities partout)
- ⚠️ Tester intégration complète
