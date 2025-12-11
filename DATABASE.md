# Configuration de la Base de Données PostgreSQL

## Installation et Configuration

### 1. Variables d'environnement
Copiez le fichier `.env.local` et configurez vos paramètres PostgreSQL :

```bash
DB_HOST=localhost          # Adresse du serveur PostgreSQL  
DB_PORT=5432              # Port PostgreSQL (5432 par défaut)
DB_NAME=MuseumVoice         # Nom de votre base de données
DB_USER=postgres          # Nom d'utilisateur PostgreSQL
DB_PASSWORD=Gautier@97421 # Mot de passe PostgreSQL
```

### 2. Création de la base de données
Créez la base de données et les tables en exécutant le script `bdd.sql` :

```bash
# Se connecter à PostgreSQL
psql -U postgres -h localhost

# Créer la base de données
CREATE DATABASE museum_db;

# Se connecter à la nouvelle base
\c museum_db

# Exécuter le script de création des tables
\i bdd.sql
```

### 3. Test de connexion
Une fois configuré, le bouton "💾 Sauvegarder dans PostgreSQL" dans l'éditeur :
- Se connecte automatiquement à votre base PostgreSQL
- Vide et recrée les données du plan en cours
- Affiche un résumé des enregistrements insérés

## Fonctionnement

### Données sauvegardées
- **Plans** : Métadonnées des étages/niveaux
- **Entities** : Salles (ROOM) et œuvres (ARTWORK)  
- **Points** : Coordonnées définissant les polygones/positions
- **Relations** : Connexions entre entités
- **Œuvres** : Informations détaillées des œuvres d'art
- **Chunks** : Fragments de texte associés aux œuvres
- **Criterias** : Critères de classification

### Sécurité
- Toutes les insertions se font dans une **transaction**
- En cas d'erreur, **rollback** automatique
- **Paramétrage sécurisé** contre les injections SQL

## Dépannage

### Erreurs courantes
- **"Connection refused"** : Vérifiez que PostgreSQL est démarré
- **"Authentication failed"** : Vérifiez username/password dans `.env.local`
- **"Database does not exist"** : Créez la base avec `CREATE DATABASE museum_db;`
- **"Table does not exist"** : Exécutez le script `bdd.sql`