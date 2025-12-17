"""
Générateur de parcours personnalisés intelligents
Approche hybride : prégénérations + LLM pour cohérence narrative
"""

import random
import sqlite3
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from db import _connect_structured, get_artwork


@dataclass
class ParcoursConfig:
    """Configuration pour la génération d'un parcours personnalisé"""
    age_cible: str  # enfant, adolescent, adulte, senior
    thematique: str  # technique_picturale, contexte_historique, thematique_generale, biographie
    style_texte: str  # analyse, exploration, contemplation, decouverte, anecdote
    types_oeuvres: List[str]  # peinture, sculpture, architecture, etc.
    nombre_oeuvres: int = 5
    duree_souhaitee: Optional[int] = None  # en minutes
    niveau_detail: str = "standard"  # minimal, standard, detaille


@dataclass
class OeuvreSelection:
    """Œuvre sélectionnée pour un parcours avec son contenu prégenéré"""
    oeuvre_id: int
    titre: str
    artiste: str
    type_oeuvre: str
    contenu_pregenere: str
    metadata: Dict[str, Any]


class ParcoursPersonalise:
    """Générateur de parcours personnalisés hybride"""
    
    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.db_path = db_path
        else:
            import os
            # Chemin relatif depuis le dossier backend/rag vers database
            current_dir = os.path.dirname(os.path.abspath(__file__))
            self.db_path = os.path.join(os.path.dirname(os.path.dirname(current_dir)), 'database', 'museum_v1.db')
    
    def generer_parcours_complet(self, config: ParcoursConfig) -> Dict[str, Any]:
        """
        Génère un parcours personnalisé complet avec cohérence narrative
        
        Returns:
            Dict contenant le parcours structuré avec introduction, œuvres et conclusion
        """
        print(f"🎯 Génération parcours: {config.age_cible} | {config.thematique} | {config.style_texte}")
        
        # 1. Sélection intelligente des œuvres
        oeuvres_selectionnees = self._selectionner_oeuvres(config)
        
        if not oeuvres_selectionnees:
            return {"error": "Aucune œuvre trouvée pour ces critères"}
        
        # 2. Récupération du contenu prégenéré
        contenu_oeuvres = self._recuperer_contenus_pregeneres(oeuvres_selectionnees, config)
        
        # 3. Génération de la structure narrative
        parcours_structure = self._generer_structure_narrative(contenu_oeuvres, config)
        
        # 4. Assemblage final
        parcours_final = self._assembler_parcours_final(parcours_structure, config)
        
        return parcours_final
    
    def _selectionner_oeuvres(self, config: ParcoursConfig) -> List[Dict[str, Any]]:
        """Sélection intelligente d'œuvres selon les critères"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Construction de la requête avec filtres
        query = """
        SELECT DISTINCT o.oeuvre_id, o.titre, o.artiste_nom, o.materiaux_technique, 
               o.periode_mouvement, o.date_oeuvre, o.description
        FROM oeuvres o
        JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
        WHERE p.age_cible = ? AND p.thematique = ? AND p.style_texte = ?
        """
        
        params = [config.age_cible, config.thematique, config.style_texte]
        
        # Filtre par types d'œuvres via matériaux/technique si spécifié
        if config.types_oeuvres:
            conditions = []
            for type_oeuvre in config.types_oeuvres:
                conditions.append("o.materiaux_technique LIKE ?")
                params.append(f"%{type_oeuvre}%")
            if conditions:
                query += f" AND ({' OR '.join(conditions)})"
        
        query += " ORDER BY RANDOM() LIMIT ?"
        params.append(config.nombre_oeuvres)
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        conn.close()
        
        # Conversion en dictionnaires
        oeuvres = []
        for row in results:
            oeuvres.append({
                'oeuvre_id': row[0],
                'titre': row[1], 
                'artiste_nom': row[2],
                'materiaux_technique': row[3],
                'periode_mouvement': row[4],
                'date_oeuvre': row[5],
                'description': row[6]
            })
        
        print(f"📚 {len(oeuvres)} œuvres sélectionnées")
        return oeuvres
    
    def _recuperer_contenus_pregeneres(self, oeuvres: List[Dict], config: ParcoursConfig) -> List[OeuvreSelection]:
        """Récupère les contenus prégénérés pour les œuvres sélectionnées"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        selections = []
        
        for oeuvre in oeuvres:
            cursor.execute("""
                SELECT pregeneration_text FROM pregenerations 
                WHERE oeuvre_id = ? AND age_cible = ? AND thematique = ? AND style_texte = ?
            """, (oeuvre['oeuvre_id'], config.age_cible, config.thematique, config.style_texte))
            
            result = cursor.fetchone()
            if result:
                selection = OeuvreSelection(
                    oeuvre_id=oeuvre['oeuvre_id'],
                    titre=oeuvre['titre'],
                    artiste=oeuvre['artiste_nom'],
                    type_oeuvre=oeuvre['materiaux_technique'],  # Utiliser matériaux comme type
                    contenu_pregenere=result[0],
                    metadata=oeuvre
                )
                selections.append(selection)
        
        conn.close()
        print(f"✅ Contenus récupérés pour {len(selections)} œuvres")
        return selections
    
    def _generer_structure_narrative(self, selections: List[OeuvreSelection], config: ParcoursConfig) -> Dict[str, Any]:
        """Génère la structure narrative avec transitions intelligentes"""
        
        # Templates selon l'âge et le style
        templates = self._get_narrative_templates(config)
        
        # Introduction personnalisée
        introduction = self._generer_introduction(selections, config, templates)
        
        # Œuvres avec transitions
        oeuvres_avec_transitions = []
        for i, selection in enumerate(selections):
            
            # Transition (sauf pour la première œuvre)
            transition = ""
            if i > 0:
                transition = self._generer_transition(
                    selections[i-1], selection, config, templates
                )
            
            oeuvre_complete = {
                'transition': transition,
                'titre': selection.titre,
                'artiste': selection.artiste,
                'contenu': selection.contenu_pregenere,
                'metadata': selection.metadata
            }
            oeuvres_avec_transitions.append(oeuvre_complete)
        
        # Conclusion
        conclusion = self._generer_conclusion(selections, config, templates)
        
        return {
            'introduction': introduction,
            'oeuvres': oeuvres_avec_transitions,
            'conclusion': conclusion,
            'metadata': {
                'nombre_oeuvres': len(selections),
                'duree_estimee': self._estimer_duree(selections, config),
                'config': config.__dict__
            }
        }
    
    def _get_narrative_templates(self, config: ParcoursConfig) -> Dict[str, Dict[str, str]]:
        """Templates narratifs selon l'âge et le style"""
        return {
            'enfant': {
                'intro_start': "Bienvenue dans cette aventure artistique ! Nous allons découvrir ensemble",
                'transition_words': ["Maintenant, regardons", "Ensuite, découvrons", "Voici une autre œuvre incroyable"],
                'conclusion_start': "Bravo ! Tu as découvert des œuvres magnifiques"
            },
            'adolescent': {
                'intro_start': "Prêt pour un voyage artistique ? Ce parcours te fera découvrir",
                'transition_words': ["Passons maintenant à", "Direction", "Découvrons ensemble"],
                'conclusion_start': "Ce parcours t'a fait voyager à travers"
            },
            'adulte': {
                'intro_start': "Ce parcours thématique vous invite à explorer",
                'transition_words': ["Poursuivons avec", "Notre parcours nous mène vers", "Observons maintenant"],
                'conclusion_start': "Cette exploration nous a menés à travers"
            },
            'senior': {
                'intro_start': "Permettez-moi de vous guider dans cette découverte enrichissante de",
                'transition_words': ["Continuons notre réflexion avec", "Approfondissons avec", "Contemplons maintenant"],
                'conclusion_start': "Cette promenade artistique nous a offert"
            }
        }
    
    def _generer_introduction(self, selections: List[OeuvreSelection], 
                            config: ParcoursConfig, templates: Dict) -> str:
        """Génère une introduction personnalisée pour le parcours"""
        template = templates.get(config.age_cible, templates['adulte'])
        
        # Analyse des œuvres pour créer l'accroche
        periodes = [s.metadata.get('periode_mouvement', '') for s in selections if s.metadata.get('periode_mouvement')]
        types = list(set([s.type_oeuvre for s in selections]))
        
        intro = f"{template['intro_start']} "
        
        if config.thematique == 'technique_picturale':
            intro += f"les secrets techniques de {len(selections)} œuvres fascinantes"
        elif config.thematique == 'contexte_historique':
            intro += f"l'histoire captivante derrière {len(selections)} chefs-d'œuvre"
        elif config.thematique == 'biographie':
            intro += f"la vie des grands maîtres à travers {len(selections)} œuvres emblématiques"
        else:
            intro += f"{len(selections)} œuvres remarquables"
        
        if types:
            types_clean = [t for t in types if t and len(t) < 50]  # Nettoyer les techniques longues
            if types_clean:
                types_str = ", ".join(types_clean[:3])  # Max 3 techniques
                intro += f" utilisant diverses techniques comme {types_str}"
        
        if periodes:
            periodes_uniques = list(set([p for p in periodes if p]))[:3]
            if periodes_uniques:
                intro += f", traversant les mouvements {', '.join(periodes_uniques)}"
        
        intro += f". Ce parcours {config.style_texte} vous permettra d'approfondir votre compréhension artistique."
        
        return intro
    
    def _generer_transition(self, oeuvre_precedente: OeuvreSelection, 
                          oeuvre_suivante: OeuvreSelection,
                          config: ParcoursConfig, templates: Dict) -> str:
        """Génère une transition intelligente entre deux œuvres"""
        template = templates.get(config.age_cible, templates['adulte'])
        
        transition_words = random.choice(template['transition_words'])
        
        # Analyse des liens entre œuvres
        liens = []
        
        # Même artiste
        if oeuvre_precedente.artiste == oeuvre_suivante.artiste:
            liens.append(f"une autre œuvre du même artiste")
        
        # Même période
        if (oeuvre_precedente.metadata.get('periode_mouvement') == 
            oeuvre_suivante.metadata.get('periode_mouvement')):
            liens.append(f"une œuvre de la même époque")
        
        # Contraste
        if oeuvre_precedente.type_oeuvre != oeuvre_suivante.type_oeuvre:
            liens.append(f"un contraste saisissant avec cette technique différente")
        
        if liens:
            transition = f"{transition_words} {oeuvre_suivante.titre}, {random.choice(liens)}."
        else:
            transition = f"{transition_words} {oeuvre_suivante.titre}."
        
        return transition
    
    def _generer_conclusion(self, selections: List[OeuvreSelection],
                          config: ParcoursConfig, templates: Dict) -> str:
        """Génère une conclusion personnalisée"""
        template = templates.get(config.age_cible, templates['adulte'])
        
        conclusion = f"{template['conclusion_start']} "
        
        # Synthèse thématique
        if config.thematique == 'technique_picturale':
            conclusion += "une diversité de techniques artistiques remarquables"
        elif config.thematique == 'contexte_historique':
            conclusion += "différentes époques de l'art et leur contexte"
        elif config.thematique == 'biographie':
            conclusion += "la richesse créative de grands artistes"
        else:
            conclusion += "un panorama artistique varié"
        
        # Message d'encouragement selon l'âge
        if config.age_cible == 'enfant':
            conclusion += ". Continue à observer l'art autour de toi !"
        elif config.age_cible == 'adolescent':
            conclusion += ". L'art n'a plus de secrets pour toi !"
        elif config.age_cible == 'adulte':
            conclusion += ". Ces découvertes enrichissent votre regard artistique."
        else:  # senior
            conclusion += ". Une belle réflexion sur la richesse de notre patrimoine."
        
        return conclusion
    
    def _estimer_duree(self, selections: List[OeuvreSelection], config: ParcoursConfig) -> int:
        """Estime la durée du parcours en minutes"""
        # Base : 3-5 minutes par œuvre selon le niveau de détail
        duree_par_oeuvre = {
            'minimal': 3,
            'standard': 4,
            'detaille': 6
        }
        
        duree_base = len(selections) * duree_par_oeuvre.get(config.niveau_detail, 4)
        
        # Ajustement selon l'âge (enfants plus rapides)
        if config.age_cible == 'enfant':
            duree_base *= 0.8
        elif config.age_cible == 'senior':
            duree_base *= 1.2
        
        return int(duree_base)
    
    def _assembler_parcours_final(self, structure: Dict, config: ParcoursConfig) -> Dict[str, Any]:
        """Assemble le parcours final avec formatage"""
        
        parcours_text = ""
        
        # Introduction
        parcours_text += f"🎨 PARCOURS PERSONNALISÉ\n"
        parcours_text += f"{'='*50}\n\n"
        parcours_text += f"{structure['introduction']}\n\n"
        
        # Œuvres avec transitions
        for i, oeuvre in enumerate(structure['oeuvres'], 1):
            if oeuvre['transition']:
                parcours_text += f"{oeuvre['transition']}\n\n"
            
            parcours_text += f"🎭 ŒUVRE {i} : {oeuvre['titre']}\n"
            parcours_text += f"👨‍🎨 Artiste : {oeuvre['artiste']}\n"
            parcours_text += f"{'-'*40}\n"
            parcours_text += f"{oeuvre['contenu']}\n\n"
        
        # Conclusion
        parcours_text += f"🎯 CONCLUSION\n"
        parcours_text += f"{'-'*30}\n"
        parcours_text += f"{structure['conclusion']}\n\n"
        
        # Métadonnées
        metadata = structure['metadata']
        parcours_text += f"📊 INFORMATIONS DU PARCOURS\n"
        parcours_text += f"⏱️  Durée estimée : {metadata['duree_estimee']} minutes\n"
        parcours_text += f"🎨 Nombre d'œuvres : {metadata['nombre_oeuvres']}\n"
        parcours_text += f"👥 Public cible : {config.age_cible}\n"
        parcours_text += f"🎭 Thématique : {config.thematique}\n"
        parcours_text += f"📝 Style : {config.style_texte}\n"
        
        return {
            'parcours_complet': parcours_text,
            'structure': structure,
            'config': config.__dict__,
            'stats': {
                'longueur_totale': len(parcours_text),
                'nombre_oeuvres': len(structure['oeuvres']),
                'duree_estimee': metadata['duree_estimee']
            }
        }


# Fonctions utilitaires pour l'interface
def generer_parcours_rapide(age_cible: str, thematique: str, style_texte: str,
                           types_oeuvres: List[str] = None, nombre_oeuvres: int = 5) -> Dict[str, Any]:
    """Interface rapide pour générer un parcours"""
    config = ParcoursConfig(
        age_cible=age_cible,
        thematique=thematique, 
        style_texte=style_texte,
        types_oeuvres=types_oeuvres or [],
        nombre_oeuvres=nombre_oeuvres
    )
    
    generator = ParcoursPersonalise()
    return generator.generer_parcours_complet(config)


if __name__ == "__main__":
    # Test du système
    print("🎯 Test du générateur de parcours personnalisés\n")
    
    # Exemple de parcours pour adulte
    result = generer_parcours_rapide(
        age_cible="adulte",
        thematique="technique_picturale",
        style_texte="analyse",
        nombre_oeuvres=3
    )
    
    if 'parcours_complet' in result:
        print(result['parcours_complet'])
        print(f"\n📊 Stats: {result['stats']}")
    else:
        print(f"❌ Erreur: {result}")