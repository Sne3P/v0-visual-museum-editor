#!/usr/bin/env python3
"""
Générateur de contenu intelligent pour les prégénérations avec critères multiples
Génère des résumés complets basés sur le contenu PDF réel des œuvres
"""

import re
from typing import Dict, List, Any, Optional
from pregeneration_db_optimized import add_pregeneration, get_pregeneration_stats
from model_db import get_artwork_by_id, get_anecdotes_for_artwork
from rag_engine import StructuredRAGEngine

class IntelligentContentGenerator:
    """Générateur de contenu adapté selon l'âge, la thématique et le style
    Génère des résumés complets basés sur le contenu PDF réel des œuvres"""
    
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        self.rag_engine = StructuredRAGEngine()
        
        self.age_profiles = {
            'enfant': {
                'vocabulary': 'simple',
                'sentence_length': 'court',
                'tone': 'ludique',
                'focus': 'visuel et concret'
            },
            'ado': {
                'vocabulary': 'accessible',
                'sentence_length': 'moyen', 
                'tone': 'engageant',
                'focus': 'contexte et curiosités'
            },
            'adulte': {
                'vocabulary': 'standard',
                'sentence_length': 'normal',
                'tone': 'informatif',
                'focus': 'analyse et culture'
            },
            'senior': {
                'vocabulary': 'enrichi',
                'sentence_length': 'développé',
                'tone': 'respectueux',
                'focus': 'contexte historique'
            }
        }
    
    def generate_content_for_artwork(self, oeuvre_id: int, age_cible: str, 
                                   thematique: str, style_texte: str,
                                   db_path: Optional[str] = None) -> str:
        """Génère un résumé complet adapté pour une œuvre selon les critères"""
        
        # Récupérer les données de l'œuvre
        artwork = get_artwork_by_id(oeuvre_id, db_path or self.db_path)
        if not artwork:
            raise ValueError(f"Œuvre ID {oeuvre_id} non trouvée")
        
        # Récupérer le contenu PDF complet de l'œuvre via RAG
        pdf_content = self._get_artwork_pdf_content(artwork)
        
        # Récupérer les anecdotes
        anecdotes = get_anecdotes_for_artwork(oeuvre_id, db_path or self.db_path)
        
        # Générer le résumé complet selon les critères
        summary = self._generate_comprehensive_summary(
            artwork, pdf_content, anecdotes, age_cible, thematique, style_texte
        )
        
        return summary

    def _get_artwork_pdf_content(self, artwork: Dict[str, Any]) -> str:
        """Récupère le contenu PDF complet d'une œuvre via le système RAG"""
        
        titre = artwork.get('titre', 'Œuvre inconnue')
        artiste = artwork.get('artiste_nom', 'Artiste inconnu')
        
        # Construire une requête pour récupérer tout le contenu de l'œuvre
        query = f"Tout sur {titre} par {artiste} œuvre complète analyse technique biographie contexte historique"
        
        try:
            # Utiliser le RAG pour récupérer le contenu complet
            results = self.rag_engine.search_similar_content(
                query=query,
                top_k=10,  # Récupérer plusieurs chunks pour avoir le contenu complet
                threshold=0.1  # Seuil bas pour récupérer plus de contenu
            )
            
            # Combiner tous les résultats en un texte complet
            full_content = ""
            seen_content = set()
            
            for result in results:
                chunk_content = result.get('content', '').strip()
                # Éviter les doublons
                if chunk_content and chunk_content not in seen_content:
                    full_content += chunk_content + "\n\n"
                    seen_content.add(chunk_content)
            
            return full_content.strip() if full_content else self._fallback_content(artwork)
            
        except Exception as e:
            print(f"⚠️  Erreur récupération PDF pour {titre}: {e}")
            return self._fallback_content(artwork)
    
    def _fallback_content(self, artwork: Dict[str, Any]) -> str:
        """Contenu de fallback basé sur les métadonnées de l'œuvre"""
        return f"""
        Titre: {artwork.get('titre', 'Non renseigné')}
        Artiste: {artwork.get('artiste_nom', 'Non renseigné')}
        Date: {artwork.get('date_oeuvre', 'Non renseignée')}
        Technique: {artwork.get('materiaux_technique', 'Non renseignée')}
        Mouvement: {artwork.get('periode_mouvement', 'Non renseigné')}
        Description: {artwork.get('description', 'Aucune description disponible')}
        Contexte: {artwork.get('contexte_commande', 'Contexte non renseigné')}
        Analyse technique: {artwork.get('analyse_materielle_technique', '')}
        Iconographie: {artwork.get('iconographie_symbolique', '')}
        Réception: {artwork.get('reception_circulation_posterite', '')}
        """

    def _generate_comprehensive_summary(self, artwork: Dict, pdf_content: str, 
                                      anecdotes: List, age_cible: str, 
                                      thematique: str, style_texte: str) -> str:
        """Génère un résumé complet et adapté selon tous les critères"""
        
        # Extraire les informations selon la thématique
        thematic_content = self._extract_thematic_content(pdf_content, artwork, thematique)
        
        # Adapter selon le style de texte
        styled_content = self._apply_text_style(thematic_content, style_texte, anecdotes, artwork)
        
        # Adapter selon l'âge cible
        final_content = self._adapt_for_age(styled_content, age_cible, artwork)
        
        return final_content

    def _extract_thematic_content(self, pdf_content: str, artwork: Dict, thematique: str) -> str:
        """Extrait le contenu pertinent selon la thématique"""
        
        if thematique == 'technique_picturale':
            return self._extract_technical_info(pdf_content, artwork)
        elif thematique == 'biographie': 
            return self._extract_biographical_info(pdf_content, artwork)
        elif thematique == 'historique':
            return self._extract_historical_info(pdf_content, artwork)
        else:
            return pdf_content  # Fallback sur tout le contenu

    def _extract_technical_info(self, content: str, artwork: Dict) -> str:
        """Extrait les informations techniques de l'œuvre"""
        
        # Mots-clés pour identifier le contenu technique
        technical_keywords = [
            'technique', 'matériau', 'peinture', 'huile', 'toile', 'couleur', 
            'composition', 'lumière', 'ombre', 'perspective', 'pinceau',
            'palette', 'pigment', 'vernis', 'support', 'dimension', 'format',
            'style', 'facture', 'texture', 'glacis', 'empâtement'
        ]
        
        # Extraire les sections contenant des informations techniques
        technical_sections = []
        paragraphs = content.split('\n\n')
        
        for paragraph in paragraphs:
            if any(keyword.lower() in paragraph.lower() for keyword in technical_keywords):
                technical_sections.append(paragraph.strip())
        
        # Combiner avec les métadonnées techniques
        metadata_tech = f"""
        Technique et matériaux : {artwork.get('materiaux_technique', 'Non renseigné')}
        Dimensions : {artwork.get('dimensions', 'Non renseignées')}
        
        {artwork.get('analyse_materielle_technique', '')}
        """
        
        result = metadata_tech + "\n\n" + "\n\n".join(technical_sections[:3])  # Limiter à 3 sections
        return result.strip() if result.strip() else content[:1000]  # Fallback limité

    def _extract_biographical_info(self, content: str, artwork: Dict) -> str:
        """Extrait les informations biographiques de l'artiste"""
        
        # Mots-clés pour identifier le contenu biographique
        bio_keywords = [
            'né', 'naissance', 'famille', 'formation', 'études', 'apprentissage',
            'carrière', 'vie', 'personnalité', 'influences', 'style', 'évolution',
            'rencontres', 'voyages', 'période', 'œuvres principales', 'reconnaissance',
            'artiste', 'peintre', 'sculpteur', 'maître'
        ]
        
        # Extraire les sections biographiques
        bio_sections = []
        paragraphs = content.split('\n\n')
        
        for paragraph in paragraphs:
            if any(keyword.lower() in paragraph.lower() for keyword in bio_keywords):
                bio_sections.append(paragraph.strip())
        
        # Ajouter les métadonnées de l'artiste
        artiste_info = f"""
        Artiste : {artwork.get('artiste_nom', 'Artiste inconnu')}
        Mouvement artistique : {artwork.get('periode_mouvement', 'Non renseigné')}
        
        Informations biographiques et contexte artistique :
        """
        
        result = artiste_info + "\n\n" + "\n\n".join(bio_sections[:3])  # Limiter à 3 sections
        return result.strip() if result.strip() else content[:1000]  # Fallback limité

    def _extract_historical_info(self, content: str, artwork: Dict) -> str:
        """Extrait les informations historiques et contextuelles"""
        
        # Mots-clés pour le contexte historique
        hist_keywords = [
            'époque', 'siècle', 'contexte', 'histoire', 'société', 'politique',
            'révolution', 'guerre', 'culture', 'commande', 'mécénat', 'exposition',
            'réception', 'critique', 'influence', 'postérité', 'conservation',
            'historique', 'période', 'temps', 'moment'
        ]
        
        # Extraire les sections historiques
        hist_sections = []
        paragraphs = content.split('\n\n')
        
        for paragraph in paragraphs:
            if any(keyword.lower() in paragraph.lower() for keyword in hist_keywords):
                hist_sections.append(paragraph.strip())
        
        # Ajouter le contexte de commande et la réception
        historical_context = f"""
        Date de création : {artwork.get('date_oeuvre', 'Non renseignée')}
        Contexte de commande : {artwork.get('contexte_commande', 'Non renseigné')}
        
        {artwork.get('reception_circulation_posterite', '')}
        
        Contexte historique et culturel :
        """
        
        result = historical_context + "\n\n" + "\n\n".join(hist_sections[:3])  # Limiter à 3 sections
        return result.strip() if result.strip() else content[:1000]  # Fallback limité

    def _apply_text_style(self, content: str, style_texte: str, anecdotes: List, artwork: Dict) -> str:
        """Applique le style de texte au contenu"""
        
        if style_texte == 'analyse':
            return self._create_analytical_summary(content, artwork)
        elif style_texte == 'decouverte':
            return self._create_discovery_summary(content, artwork)
        elif style_texte == 'anecdote':
            return self._create_anecdotal_summary(content, anecdotes, artwork)
        else:
            return content

    def _create_analytical_summary(self, content: str, artwork: Dict) -> str:
        """Crée un résumé analytique structuré"""
        
        titre = artwork.get('titre', 'Cette œuvre')
        
        # Structure analytique avec des sections claires
        summary = f"""ANALYSE DE L'ŒUVRE : {titre}

PRÉSENTATION GÉNÉRALE :
{self._extract_main_description(content)}

ANALYSE DÉTAILLÉE :
{self._structure_analytical_content(content)}

ÉLÉMENTS REMARQUABLES :
{self._highlight_key_elements(content, artwork)}

CONTEXTE ET SIGNIFICATION :
{self._explain_significance(content, artwork)}
"""
        return self._clean_and_limit_text(summary)

    def _create_discovery_summary(self, content: str, artwork: Dict) -> str:
        """Crée un résumé de découverte engageant"""
        
        titre = artwork.get('titre', 'Cette œuvre')
        
        # Style découverte avec questionnement et exploration
        summary = f"""À LA DÉCOUVERTE DE : {titre}

QUE VOYONS-NOUS ?
{self._create_visual_description(content)}

QUE NOUS APPREND CETTE ŒUVRE ?
{self._extract_learning_points(content)}

EXPLORONS PLUS EN DÉTAIL :
{self._create_exploration_content(content, artwork)}

POURQUOI EST-CE IMPORTANT ?
{self._explain_importance(content, artwork)}
"""
        return self._clean_and_limit_text(summary)

    def _create_anecdotal_summary(self, content: str, anecdotes: List, artwork: Dict) -> str:
        """Crée un résumé basé sur les anecdotes et histoires"""
        
        titre = artwork.get('titre', 'Cette œuvre')
        
        # Intégrer les anecdotes existantes
        anecdote_text = ""
        if anecdotes:
            anecdote_text = "\n\nANECDOTES ET HISTOIRES :\n"
            for i, anecdote in enumerate(anecdotes[:2], 1):  # Limiter à 2 anecdotes
                anecdote_text += f"{i}. {anecdote.get('contenu', '')}\n\n"
        
        # Style anecdotique avec histoires et curiosités
        summary = f"""HISTOIRES ET SECRETS DE : {titre}

L'HISTOIRE DERRIÈRE L'ŒUVRE :
{self._extract_stories(content)}

CURIOSITÉS ET DÉTAILS FASCINANTS :
{self._find_interesting_details(content, artwork)}
{anecdote_text}
LE PARCOURS DE L'ŒUVRE :
{self._trace_artwork_journey(content, artwork)}
"""
        return self._clean_and_limit_text(summary)

    # Méthodes utilitaires pour l'extraction et le formatage
    
    def _extract_main_description(self, content: str) -> str:
        """Extrait la description principale"""
        lines = content.split('\n')
        main_desc = []
        for line in lines[:10]:  # Premiers éléments
            if line.strip() and len(line) > 20:
                main_desc.append(line.strip())
        return " ".join(main_desc[:3]) if main_desc else "Description détaillée de l'œuvre."

    def _structure_analytical_content(self, content: str) -> str:
        """Structure le contenu pour une analyse"""
        sentences = [s.strip() for s in content.split('.') if len(s.strip()) > 30]
        return ". ".join(sentences[:4]) + "." if sentences else "Analyse approfondie des éléments constitutifs."

    def _highlight_key_elements(self, content: str, artwork: Dict) -> str:
        """Met en valeur les éléments clés"""
        technique = artwork.get('materiaux_technique', '')
        if technique:
            return f"Technique {technique}. " + self._extract_notable_features(content)
        return self._extract_notable_features(content)

    def _extract_notable_features(self, content: str) -> str:
        """Extrait les caractéristiques notables"""
        lines = [line for line in content.split('\n') if 20 < len(line) < 200]
        return " ".join(lines[:2]) if lines else "Caractéristiques artistiques remarquables."

    def _explain_significance(self, content: str, artwork: Dict) -> str:
        """Explique la signification de l'œuvre"""
        return "Cette œuvre occupe une place importante dans l'histoire de l'art par ses innovations et son impact culturel."

    def _create_visual_description(self, content: str) -> str:
        """Crée une description visuelle engageante"""
        return self._extract_main_description(content) + " L'observation révèle de nombreux détails fascinants."

    def _extract_learning_points(self, content: str) -> str:
        """Extrait les points d'apprentissage"""
        return self._structure_analytical_content(content)

    def _create_exploration_content(self, content: str, artwork: Dict) -> str:
        """Crée du contenu d'exploration"""
        return "En explorant cette œuvre, nous découvrons les techniques et le contexte qui ont façonné sa création."

    def _explain_importance(self, content: str, artwork: Dict) -> str:
        """Explique l'importance de l'œuvre"""
        return "Cette œuvre nous aide à comprendre l'évolution artistique et culturelle de son époque."

    def _extract_stories(self, content: str) -> str:
        """Extrait les histoires du contenu"""
        return self._extract_main_description(content)

    def _find_interesting_details(self, content: str, artwork: Dict) -> str:
        """Trouve des détails intéressants"""
        return "De nombreux détails cachés révèlent les secrets de la création artistique."

    def _trace_artwork_journey(self, content: str, artwork: Dict) -> str:
        """Trace le parcours de l'œuvre"""
        provenance = artwork.get('provenance', '')
        conservation = artwork.get('parcours_conservation_doc', '')
        return f"Provenance : {provenance}. Conservation : {conservation}" if provenance or conservation else "Le parcours de cette œuvre à travers les siècles témoigne de son importance."

    def _adapt_for_age(self, content: str, age_cible: str, artwork: Dict) -> str:
        """Adapte le contenu selon l'âge cible"""
        
        profile = self.age_profiles.get(age_cible, self.age_profiles['adulte'])
        
        if age_cible == 'enfant':
            return self._simplify_for_children(content, artwork)
        elif age_cible == 'ado':
            return self._engage_for_teens(content, artwork)
        elif age_cible == 'adulte':
            return self._inform_for_adults(content, artwork)
        elif age_cible == 'senior':
            return self._enrich_for_seniors(content, artwork)
        else:
            return content

    def _simplify_for_children(self, content: str, artwork: Dict) -> str:
        """Simplifie pour les enfants"""
        
        titre = artwork.get('titre', 'Cette œuvre')
        
        # Simplification du vocabulaire et raccourcissement
        simplified = content.replace('analyse', 'regardons')
        simplified = simplified.replace('technique', 'façon de faire')
        simplified = simplified.replace('composition', 'organisation')
        
        intro = f"Découvrons ensemble {titre} ! C'est une œuvre très spéciale. "
        
        # Limiter et simplifier
        sentences = [s.strip() for s in simplified.split('.') if len(s.strip()) > 10]
        simple_sentences = []
        
        for sentence in sentences[:6]:  # Max 6 phrases
            if len(sentence) < 100:  # Phrases courtes
                simple_sentences.append(sentence)
        
        result = intro + ". ".join(simple_sentences) + "."
        return self._clean_and_limit_text(result, 500)  # Limite pour enfants

    def _engage_for_teens(self, content: str, artwork: Dict) -> str:
        """Rend engageant pour les ados"""
        
        titre = artwork.get('titre', 'Cette œuvre')
        
        # Ton plus dynamique
        engaging_intro = f"Plongeons dans l'univers de {titre} ! Cette œuvre cache des secrets fascinants. "
        
        # Garder le contenu mais avec des transitions engageantes
        sentences = [s.strip() for s in content.split('.') if len(s.strip()) > 15]
        
        result = engaging_intro + ". ".join(sentences[:8]) + "."
        result = result.replace('Cette œuvre', 'Cette création incroyable')
        result = result.replace('nous voyons', 'on découvre')
        
        return self._clean_and_limit_text(result, 800)  # Limite pour ados

    def _inform_for_adults(self, content: str, artwork: Dict) -> str:
        """Contenu informatif pour adultes"""
        
        # Garder le contenu complet avec un style informatif
        return self._clean_and_limit_text(content, 1200)  # Limite générale

    def _enrich_for_seniors(self, content: str, artwork: Dict) -> str:
        """Enrichit pour les seniors"""
        
        titre = artwork.get('titre', 'Cette œuvre')
        artiste = artwork.get('artiste_nom', 'l\'artiste')
        
        # Ajouter du contexte historique et culturel
        enriched_intro = f"{titre} de {artiste} s'inscrit dans une riche tradition artistique. "
        
        # Vocabulaire plus soutenu
        enriched = content.replace('fait', 'réalise')
        enriched = enriched.replace('montre', 'révèle')
        enriched = enriched.replace('important', 'significatif')
        
        result = enriched_intro + enriched
        return self._clean_and_limit_text(result, 1500)  # Limite étendue pour seniors

    def _clean_and_limit_text(self, text: str, max_length: int = 1000) -> str:
        """Nettoie et limite la longueur du texte"""
        
        # Nettoyer les espaces multiples
        cleaned = re.sub(r'\s+', ' ', text)
        cleaned = re.sub(r'\n\s*\n', '\n\n', cleaned)
        
        # Limiter la longueur
        if len(cleaned) > max_length:
            # Couper à la dernière phrase complète avant la limite
            truncated = cleaned[:max_length]
            last_period = truncated.rfind('.')
            if last_period > max_length * 0.8:  # Si on trouve un point vers la fin
                cleaned = truncated[:last_period + 1]
            else:
                cleaned = truncated + "..."
        
        return cleaned.strip()