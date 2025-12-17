import sqlite3
from pathlib import Path
import PyPDF2
import re
from typing import Dict, List, Optional, Tuple
import json

# Import des fonctions de base de données
from db import (
    add_artwork, add_artist, add_artistic_movement, 
    add_documentary_section, add_anecdote_structured
)


class StructuredPDFProcessor:
    """Processeur PDF intelligent pour extraire et structurer les informations d'œuvres d'art."""
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialise le processeur PDF.
        
        Args:
            db_path: Chemin vers la base de données (optionnel)
        """
        self.db_path = db_path
        
        # Patterns de reconnaissance pour les sections
        self.section_patterns = {
            'description': [
                r'description',
                r'présentation',
                r'À propos',
                r'contexte'
            ],
            'technique': [
                r'technique',
                r'matériaux',
                r'médium',
                r'support'
            ],
            'histoire': [
                r'histoire',
                r'historique',
                r'création',
                r'genèse'
            ],
            'analyse': [
                r'analyse',
                r'interprétation',
                r'signification',
                r'symbolisme'
            ],
            'conservation': [
                r'conservation',
                r'restauration',
                r'état',
                r'préservation'
            ],
            'provenance': [
                r'provenance',
                r'acquisition',
                r'collection',
                r'origine'
            ],
            'exposition': [
                r'exposition',
                r'présentation',
                r'galerie',
                r'musée'
            ]
        }
        
        # Patterns pour les métadonnées
        self.metadata_patterns = {
            'artiste': [
                r'artiste\s*:?\s*(.+)',
                r'auteur\s*:?\s*(.+)',
                r'créateur\s*:?\s*(.+)'
            ],
            'date': [
                r'date\s*:?\s*(\d{4})',
                r'année\s*:?\s*(\d{4})',
                r'créé en\s*(\d{4})',
                r'(\d{4})',
            ],
            'technique': [
                r'technique\s*:?\s*(.+)',
                r'matériaux?\s*:?\s*(.+)',
                r'support\s*:?\s*(.+)'
            ],
            'dimensions': [
                r'dimensions?\s*:?\s*(.+)',
                r'taille\s*:?\s*(.+)',
                r'(\d+\s*×\s*\d+\s*cm)',
                r'(\d+\s*x\s*\d+\s*cm)'
            ]
        }
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """
        Extrait le texte d'un fichier PDF.
        
        Args:
            pdf_path: Chemin vers le fichier PDF
            
        Returns:
            Texte extrait du PDF
        """
        try:
            with open(pdf_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                text = ""
                
                for page in reader.pages:
                    text += page.extract_text() + "\n"
                
                return text.strip()
                
        except Exception as e:
            print(f"❌ Erreur lors de l'extraction PDF {pdf_path}: {e}")
            return ""
    
    def extract_metadata(self, text: str) -> Dict[str, str]:
        """
        Extrait les métadonnées de base du texte.
        
        Args:
            text: Texte à analyser
            
        Returns:
            Dictionnaire contenant les métadonnées extraites
        """
        metadata = {}
        
        # Extraire chaque type de métadonnée
        for key, patterns in self.metadata_patterns.items():
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
                if match:
                    value = match.group(1) if match.groups() else match.group(0)
                    metadata[key] = value.strip()
                    break  # Premier match trouvé
        
        return metadata
    
    def detect_section_type(self, text_chunk: str) -> str:
        """
        Détermine le type de section basé sur le contenu.
        
        Args:
            text_chunk: Portion de texte à analyser
            
        Returns:
            Type de section détecté
        """
        text_lower = text_chunk.lower()
        
        # Compter les matches pour chaque type de section
        section_scores = {}
        
        for section_type, patterns in self.section_patterns.items():
            score = 0
            for pattern in patterns:
                matches = len(re.findall(pattern, text_lower))
                score += matches
            section_scores[section_type] = score
        
        # Retourner le type avec le score le plus élevé
        if section_scores:
            best_section = max(section_scores, key=section_scores.get)
            if section_scores[best_section] > 0:
                return best_section
        
        return 'description'  # Type par défaut
    
    def split_into_sections(self, text: str) -> List[Dict[str, str]]:
        """
        Divise le texte en sections thématiques.
        
        Args:
            text: Texte complet à diviser
            
        Returns:
            Liste de dictionnaires avec type_section et contenu
        """
        sections = []
        
        # Diviser le texte par paragraphes
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        # Regrouper les paragraphes par sections
        current_section_type = None
        current_content = []
        
        for paragraph in paragraphs:
            # Détecter le type de section pour ce paragraphe
            detected_type = self.detect_section_type(paragraph)
            
            # Si c'est un nouveau type de section
            if detected_type != current_section_type and current_content:
                # Sauvegarder la section précédente
                sections.append({
                    'type_section': current_section_type or 'description',
                    'contenu': '\n\n'.join(current_content)
                })
                current_content = []
            
            current_section_type = detected_type
            current_content.append(paragraph)
        
        # Ajouter la dernière section
        if current_content:
            sections.append({
                'type_section': current_section_type or 'description',
                'contenu': '\n\n'.join(current_content)
            })
        
        # Si aucune section n'a été créée, créer une section description
        if not sections and text.strip():
            sections.append({
                'type_section': 'description',
                'contenu': text.strip()
            })
        
        return sections
    
    def extract_anecdotes(self, text: str) -> List[str]:
        """
        Extrait les anecdotes du texte.
        
        Args:
            text: Texte à analyser
            
        Returns:
            Liste des anecdotes trouvées
        """
        anecdotes = []
        
        # Patterns pour reconnaître les anecdotes
        anecdote_patterns = [
            r'anecdote\s*:?\s*(.+?)(?=\n\n|\Z)',
            r'fait curieux\s*:?\s*(.+?)(?=\n\n|\Z)',
            r'histoire drôle\s*:?\s*(.+?)(?=\n\n|\Z)',
            r'petite histoire\s*:?\s*(.+?)(?=\n\n|\Z)'
        ]
        
        for pattern in anecdote_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE | re.DOTALL)
            for match in matches:
                anecdote = match.group(1).strip()
                if len(anecdote) > 20:  # Éviter les anecdotes trop courtes
                    anecdotes.append(anecdote)
        
        # Aussi chercher les phrases avec des mots-clés d'anecdotes
        sentences = re.split(r'[.!?]+', text)
        anecdote_keywords = ['raconte', 'dit-on', 'légende', 'paraît-il', 'curieusement']
        
        for sentence in sentences:
            sentence = sentence.strip()
            if any(keyword in sentence.lower() for keyword in anecdote_keywords):
                if len(sentence) > 30:
                    anecdotes.append(sentence)
        
        return list(set(anecdotes))  # Enlever les doublons
    
    def process_pdf_file(self, pdf_path: str, title: Optional[str] = None) -> Optional[int]:
        """
        Traite un fichier PDF et l'ajoute à la base de données structurée.
        
        Args:
            pdf_path: Chemin vers le fichier PDF
            title: Titre de l'œuvre (optionnel, extrait du nom de fichier sinon)
            
        Returns:
            ID de l'œuvre créée ou None en cas d'erreur
        """
        try:
            print(f"🔍 Traitement du PDF: {pdf_path}")
            
            # Extraire le texte du PDF
            text = self.extract_text_from_pdf(pdf_path)
            if not text:
                print(f"❌ Aucun texte extrait de {pdf_path}")
                return None
            
            # Extraire les métadonnées
            metadata = self.extract_metadata(text)
            print(f"📊 Métadonnées extraites: {metadata}")
            
            # Utiliser le titre fourni ou extraire du nom de fichier
            artwork_title = title or Path(pdf_path).stem
            
            # Gérer l'artiste
            artist_name = metadata.get('artiste')
            id_artiste = None
            if artist_name:
                id_artiste = add_artist(artist_name)
                print(f"👨‍🎨 Artiste ajouté/trouvé: {artist_name} (ID: {id_artiste})")
            
            # Créer l'œuvre d'art
            artwork_id = add_artwork(
                title=artwork_title,
                artist=artist_name,
                id_artiste=id_artiste,
                date_creation=metadata.get('date'),
                technique=metadata.get('technique'),
                pdf_link=str(Path(pdf_path).name),
                file_name=Path(pdf_path).name,
                file_path=pdf_path,
                room="Salle 1",  # Valeur par défaut pour le champ room obligatoire
                db_path=self.db_path
            )
            
            print(f"🎨 Œuvre créée: {artwork_title} (ID: {artwork_id})")
            
            # Diviser en sections et les ajouter
            sections = self.split_into_sections(text)
            for section in sections:
                section_id = add_documentary_section(
                    artwork_id, 
                    section['type_section'], 
                    section['contenu'],
                    self.db_path
                )
                print(f"📋 Section ajoutée: {section['type_section']} (ID: {section_id})")
            
            # Extraire et ajouter les anecdotes
            anecdotes = self.extract_anecdotes(text)
            for anecdote in anecdotes:
                anecdote_id = add_anecdote_structured(
                    artwork_id, 
                    anecdote,
                    db_path=self.db_path
                )
                print(f"💭 Anecdote ajoutée (ID: {anecdote_id})")
            
            print(f"✅ Traitement terminé pour {artwork_title}")
            return artwork_id
            
        except Exception as e:
            print(f"❌ Erreur lors du traitement de {pdf_path}: {e}")
            import traceback
            print(traceback.format_exc())
            return None
    
    def process_pdf_directory(self, directory_path: str) -> List[int]:
        """
        Traite tous les fichiers PDF d'un répertoire.
        
        Args:
            directory_path: Chemin vers le répertoire contenant les PDFs
            
        Returns:
            Liste des IDs des œuvres créées
        """
        directory = Path(directory_path)
        if not directory.exists():
            print(f"❌ Répertoire non trouvé: {directory_path}")
            return []
        
        pdf_files = list(directory.glob("*.pdf"))
        if not pdf_files:
            print(f"❌ Aucun fichier PDF trouvé dans {directory_path}")
            return []
        
        print(f"📁 {len(pdf_files)} fichiers PDF trouvés")
        
        artwork_ids = []
        for pdf_file in pdf_files:
            artwork_id = self.process_pdf_file(str(pdf_file))
            if artwork_id:
                artwork_ids.append(artwork_id)
        
        print(f"✅ {len(artwork_ids)} œuvres traitées avec succès")
        return artwork_ids


# Fonction d'interface simple
def process_structured_pdf_file(pdf_path: str, title: Optional[str] = None, 
                               db_path: Optional[str] = None) -> Optional[int]:
    """
    Interface simple pour traiter un fichier PDF.
    
    Args:
        pdf_path: Chemin vers le fichier PDF
        title: Titre de l'œuvre (optionnel)
        db_path: Chemin vers la base de données (optionnel)
        
    Returns:
        ID de l'œuvre créée ou None
    """
    processor = StructuredPDFProcessor(db_path)
    return processor.process_pdf_file(pdf_path, title)


def process_structured_pdf_directory(directory_path: str, db_path: Optional[str] = None) -> List[int]:
    """
    Interface simple pour traiter un répertoire de PDFs.
    
    Args:
        directory_path: Chemin vers le répertoire
        db_path: Chemin vers la base de données (optionnel)
        
    Returns:
        Liste des IDs des œuvres créées
    """
    processor = StructuredPDFProcessor(db_path)
    return processor.process_pdf_directory(directory_path)


if __name__ == "__main__":
    # Test du processeur
    processor = StructuredPDFProcessor()
    
    # Tester avec un répertoire de PDFs
    pdf_dir = Path(__file__).parent.parent / "public" / "uploads" / "pdfs"
    if pdf_dir.exists():
        print(f"🔍 Test du répertoire: {pdf_dir}")
        artwork_ids = processor.process_pdf_directory(str(pdf_dir))
        print(f"✅ {len(artwork_ids)} œuvres traitées")
    else:
        print(f"❌ Répertoire PDF non trouvé: {pdf_dir}")
        print("Créez des fichiers PDF de test ou modifiez le chemin.")