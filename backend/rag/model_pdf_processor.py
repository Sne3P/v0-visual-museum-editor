#!/usr/bin/env python3
"""
Processeur PDF conforme au modèle standardisé (version corrigée)
"""

import re
from pathlib import Path
from typing import Dict, List, Optional, Any
import PyPDF2

from model_db import add_artwork, add_artist, add_movement, add_anecdote, _connect_structured


class ModelCompliantPDFProcessor:
    """Processeur PDF conforme au modèle standardisé"""
    
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        
        # Patterns optimisés basés sur la vraie structure du PDF
        self.patterns = {
            'titre': r'Titre\s*:?\s*(.+?)(?=\nArtiste\s*:|$)',
            'artiste': r'Artiste\s*:?\s*(.+?)(?=\nLieu de naissance|$)',
            'lieu_naissance': r'Lieu de naissance[^:]*:?\s*(.+?)(?=\nDate de l|$)',
            'date_oeuvre': r'Date de l.œuvre[^:]*:?\s*(.+?)(?=\nMatériaux|$)',
            'materiaux': r'Matériaux[^:]*:?\s*(.+?)(?=\nPériode|$)',
            'mouvement': r'Période[^:]*Mouvement[^:]*:?\s*(.+?)(?=\nProvenance|$)',
            'provenance': r'Provenance[^:]*:?\s*(.+?)(?=\nContexte|$)',
            'contexte': r'Contexte[^:]*:?\s*(.+?)(?=\nDescription|$)',
            'description': r'Description[^:]*:?\s*(.+?)(?=\nAnalyse|$)',
            'analyse': r'Analyse[^:]*:?\s*(.+?)(?=\nIconographie|$)',
            'iconographie': r'Iconographie[^:]*:?\s*(.+?)(?=\nRéception|$)',
            'reception': r'Réception[^:]*:?\s*(.+?)(?=\nParcours|$)',
            'parcours': r'Parcours[^:]*:?\s*(.+?)(?=\nAnecdote|$)'
        }
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extrait le texte du PDF"""
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                return text
        except Exception as e:
            print(f"❌ Erreur extraction PDF {pdf_path}: {e}")
            return ""
    
    def extract_field(self, text: str, field_name: str) -> Optional[str]:
        """Extrait un champ du texte avec capture complète par recherche directe"""
        
        # Délimiteurs de sections dans l'ordre du modèle PDF
        field_mappings = {
            'titre': ('Titre :', 'Artiste :'),
            'artiste': ('Artiste :', 'Lieu de naissance'),
            'lieu_naissance': ('Lieu de naissance', 'Date de l'),
            'date_oeuvre': ('Date de l', 'Matériaux'),
            'materiaux': ('Matériaux', 'Période'),
            'mouvement': ('Période', 'Provenance'),
            'provenance': ('Provenance :', 'Contexte'),
            'contexte': ('Contexte', 'Description'),
            'description': ('Description :', 'Analyse'),
            'analyse': ('Analyse', 'Iconographie'),
            'iconographie': ('Iconographie', 'Réception'),
            'reception': ('Réception', 'Parcours'),
            'parcours': ('Parcours', 'Anecdote')
        }
        
        if field_name not in field_mappings:
            return None
            
        start_marker, end_marker = field_mappings[field_name]
        
        # Recherche directe des positions
        start_pos = text.find(start_marker)
        if start_pos == -1:
            return None
            
        # Position après le marqueur de début et les ':'
        content_start = start_pos + len(start_marker)
        
        # Trouver la fin - chercher le marqueur de fin
        end_pos = text.find(end_marker, content_start)
        if end_pos == -1:
            # Si pas de marqueur de fin, prendre jusqu'à la fin
            content = text[content_start:].strip()
        else:
            # Extraire jusqu'au marqueur de fin
            content = text[content_start:end_pos].strip()
        
        if content:
            # Nettoyer le contenu et supprimer les préfixes
            original_content = content
            content = self.clean_extracted_content(content, field_name)
            # Log du nettoyage si nécessaire
            if original_content != content:
                print(f"🧹 Nettoyage {field_name}: '{original_content}' -> '{content}'")
            return content if content and len(content) > 3 else None
        
        return None
    
    def clean_extracted_content(self, content: str, field_name: str) -> str:
        """Nettoie le contenu extrait en supprimant les préfixes spécifiques"""
        # Nettoyer les retours à la ligne et espaces multiples
        content = re.sub(r'\n+', ' ', content)  # Retours à la ligne -> espaces
        content = re.sub(r'\s+', ' ', content)   # Espaces multiples -> un seul
        content = content.strip(' :\n\r\t')
        
        # Supprimer les préfixes spécifiques selon le champ
        # Note: utilise \u2019 pour l'apostrophe typographique et \u0153 pour œ
        prefixes_to_remove = {
            'lieu_naissance': [r"de l[\u2019']artiste\s*:\s*", r"de l[\u2019']artiste\s+", r"Lieu de naissance\s*:\s*"],
            'date_oeuvre': [r"[\u2019']\u0153uvre\s*:\s*", r"[\u2019']œuvre\s*:\s*", r"de l[\u2019']\u0153uvre\s*:\s*", r"Date\s*:\s*"],
            'materiaux': [r"/\s*technique utilisée\s*:\s*", r"Matériaux\s*/\s*technique\s*:\s*", r"technique\s*:\s*"],
            'mouvement': [r"/\s*Mouvement\s*:\s*", r"Période\s*/\s*Mouvement\s*:\s*", r"Mouvement\s*:\s*"],
            'contexte': [r"&\s*commande\s*:\s*", r"Contexte\s*&\s*commande\s*:\s*", r"Contexte\s*:\s*"],
            'reception': [r",\s*circulation\s*&\s*postérité\s*:\s*", r"Réception\s*,?\s*circulation\s*&\s*postérité\s*:\s*"],
            'parcours': [r",\s*conservation\s*&\s*documentation\s*:\s*", r"Parcours\s*,?\s*conservation\s*&\s*documentation\s*:\s*"],
            'analyse': [r"matérielle\s*&\s*technique\s*:\s*", r"Analyse\s*matérielle\s*&\s*technique\s*:\s*"]
        }
        
        if field_name in prefixes_to_remove:
            for prefix_pattern in prefixes_to_remove[field_name]:
                old_content = content
                content = re.sub(prefix_pattern, '', content, flags=re.IGNORECASE)
                if old_content != content:
                    break
        
        # Nettoyage final
        content = content.strip(' :\n\r\t')
        return content
    
    def extract_anecdotes(self, text: str) -> List[str]:
        """Extrait les anecdotes complètes"""
        anecdotes = []
        
        # Pattern pour capturer toutes les anecdotes complètes (multi-lignes)
        # Utilise [\s\S]*? pour capturer tout caractère y compris les retours à la ligne
        pattern = r'Anecdote\s*\d*\s*:\s*([\s\S]*?)(?=\nAnecdote|$)'
        matches = re.findall(pattern, text, re.IGNORECASE)
        
        for match in matches:
            anecdote = match.strip()
            # Nettoyer les retours à la ligne multiples mais conserver la structure
            anecdote = re.sub(r'\n+', ' ', anecdote)  # Remplacer retours à la ligne par espaces
            anecdote = re.sub(r'\s+', ' ', anecdote)   # Nettoyer espaces multiples
            anecdote = anecdote.strip(' :-\n\r\t')
            
            if anecdote and len(anecdote) > 10:  # Filtrer les anecdotes trop courtes
                anecdotes.append(anecdote)
        
        # Si pas d'anecdotes avec le pattern principal, essayer un pattern alternatif
        if not anecdotes:
            # Pattern avec recherche ligne par ligne puis regroupement
            lines = text.split('\n')
            current_anecdote = ""
            in_anecdote = False
            
            for line in lines:
                line = line.strip()
                if re.match(r'Anecdote\s*\d*\s*:', line, re.IGNORECASE):
                    # Sauvegarder l'anecdote précédente si elle existe
                    if current_anecdote and len(current_anecdote) > 10:
                        anecdotes.append(current_anecdote.strip())
                    # Commencer une nouvelle anecdote
                    current_anecdote = re.sub(r'Anecdote\s*\d*\s*:\s*', '', line, flags=re.IGNORECASE)
                    in_anecdote = True
                elif in_anecdote and line:
                    # Continuer l'anecdote courante
                    current_anecdote += " " + line
                elif in_anecdote and not line:
                    # Ligne vide - fin de l'anecdote courante
                    in_anecdote = False
            
            # Sauvegarder la dernière anecdote
            if current_anecdote and len(current_anecdote) > 10:
                anecdotes.append(current_anecdote.strip())
        
        return anecdotes
    
    def process_pdf_file(self, pdf_path: str, title_override: Optional[str] = None) -> Optional[int]:
        """Traite un fichier PDF selon le modèle"""
        
        print(f"🔍 Traitement PDF modèle: {pdf_path}")
        
        # Extraire le texte
        text = self.extract_text_from_pdf(pdf_path)
        if not text:
            return None
        
        # Extraire les champs
        data = {}
        for field in self.patterns.keys():
            value = self.extract_field(text, field)
            if value:
                data[field] = value
        
        print(f"📊 Données extraites: {data}")
        
        # Titre
        titre = title_override or data.get('titre') or Path(pdf_path).stem
        
        # Artiste
        artiste_nom = data.get('artiste')
        artiste_id = None
        if artiste_nom:
            artiste_id = add_artist(
                nom=artiste_nom,
                lieu_naissance=data.get('lieu_naissance'),
                db_path=self.db_path
            )
            print(f"👨‍🎨 Artiste: {artiste_nom} (ID: {artiste_id})")
        
        # Mouvement
        mouvement_nom = data.get('mouvement')
        mouvement_id = None
        if mouvement_nom:
            mouvement_id = add_movement(mouvement_nom, db_path=self.db_path)
            print(f"🎭 Mouvement: {mouvement_nom} (ID: {mouvement_id})")
        
        try:
            # Créer l'œuvre
            artwork_id = add_artwork(
                titre=titre,
                artiste_nom=artiste_nom,
                artiste_id=artiste_id,
                date_oeuvre=data.get('date_oeuvre'),
                materiaux_technique=data.get('materiaux'),
                periode_mouvement=mouvement_nom,
                mouvement_id=mouvement_id,
                provenance=data.get('provenance'),
                contexte_commande=data.get('contexte'),
                description=data.get('description'),
                analyse_materielle_technique=data.get('analyse'),
                iconographie_symbolique=data.get('iconographie'),
                reception_circulation_posterite=data.get('reception'),
                parcours_conservation_doc=data.get('parcours'),
                pdf_link=Path(pdf_path).name,
                file_name=Path(pdf_path).name,
                file_path=pdf_path,
                db_path=self.db_path
            )
            
            print(f"✅ Œuvre créée: {titre} (ID: {artwork_id})")
            
            # Ajouter les anecdotes
            anecdotes = self.extract_anecdotes(text)
            for i, anecdote in enumerate(anecdotes, 1):
                anecdote_id = add_anecdote(
                    oeuvre_id=artwork_id,
                    contenu=anecdote,
                    numero=i,
                    db_path=self.db_path
                )
                print(f"📝 Anecdote {i} ajoutée (ID: {anecdote_id})")
            
            return artwork_id
            
        except Exception as e:
            print(f"❌ Erreur création œuvre: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def process_pdf_directory(self, directory_path: str) -> List[int]:
        """Traite tous les PDFs d'un répertoire"""
        directory = Path(directory_path)
        if not directory.exists():
            print(f"❌ Répertoire {directory_path} non trouvé")
            return []
        
        pdf_files = list(directory.glob("*.pdf"))
        processed_ids = []
        
        for pdf_file in pdf_files:
            print(f"\n🔄 Traitement de {pdf_file.name}...")
            artwork_id = self.process_pdf_file(str(pdf_file))
            if artwork_id:
                processed_ids.append(artwork_id)
        
        return processed_ids


# Fonction de compatibilité
def process_structured_pdf_file(pdf_path: str, title: Optional[str] = None, 
                               db_path: Optional[str] = None) -> Optional[int]:
    processor = ModelCompliantPDFProcessor(db_path)
    return processor.process_pdf_file(pdf_path, title)