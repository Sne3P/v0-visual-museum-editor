import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

try:
    from db import init_db, add_document
except ImportError:
    def init_db(*args, **kwargs): pass
    def add_document(*args, **kwargs): return 1


def extract_text_from_pdf(file_path: str) -> str:
    """Extrait le texte d'un fichier PDF. Requiert PyPDF2."""
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        raise RuntimeError("PyPDF2 non installé. Exécutez: pip install PyPDF2")

    reader = PdfReader(file_path)
    parts = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        parts.append(text)

    return "\n\n".join(parts).strip()


@dataclass
class TextSummary:
    """Structure pour stocker les informations d'un résumé de texte"""
    title: str
    summary: str
    anecdotes: List[str]
    metadata: Dict[str, str]
    artist: Optional[str] = None
    artist: Optional[str] = None


class SummaryProcessor:
    """Processeur de documents pour les résumés de texte"""
    
    def __init__(self):
        self.title_patterns = [
            r"(?:titre|œuvre|livre|roman|pièce)\s*:\s*([^\n]+)",
            r"^([A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ][^\n]{5,50})\s*$",
            r"\"([^\"]+)\"",
        ]
        
        self.section_markers = {
            'summary': ['résumé', 'synopsis', 'histoire', 'intrigue'],
            'anecdote': ['anecdote', 'fait', 'curiosité', 'info']
        }
    
    def extract_title(self, text: str) -> Optional[str]:
        """Extrait le nom de l'œuvre du texte"""
        for pattern in self.title_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                return match.group(1).strip()
        return None
    
    def extract_summary(self, text: str) -> str:
        """Extrait le résumé principal du texte"""
        # Chercher des marqueurs de section explicites (début de ligne ou après ponctuation)
        for marker in self.section_markers['summary']:
            pattern = rf"(?:^|\n|[.!?]\s+){marker}\s*:([^§\n]*(?:\n(?!(?:{'|'.join(self.section_markers['anecdote'])})).*)*)"
            match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if match:
                return self._clean_text(match.group(1))

        # Si pas de marqueur explicite, retourner tout le texte nettoyé (meilleur que juste le plus long paragraphe)
        return self._clean_text(text)
    
    def extract_artist(self, text: str) -> Optional[str]:
        """Extrait le nom de l'artiste du texte"""
        artist_patterns = [
            # Format explicite "Artiste: Nom" (le plus fiable)
            r"(?:artiste|auteur|créateur|sculpteur|peintre)\s*:?\s*([^\n]+)",
            # Format "Nom –" (début de ligne)
            r"^([A-Z][a-zéèàçù]+(?:\s+[A-Z][a-zéèàçù-]+)*)\s*–",
            # Noms d'artistes célèbres spécifiques (patterns exacts)
            r"\b(artiste|peintre|sculpteur|créateur)\b",
            # Format "par/de Nom" (noms propres seulement)
            r"(?:par|de)\s+([A-Z][a-zéèàçù]+(?:\s+[A-Z][a-zéèàçù-]+)*)",
            # Format "tableau de Nom" (très spécifique)
            r"(?:tableau|peinture)\s+de\s+([A-Z][a-zéèàçù]+(?:\s+de\s+[A-Z][a-zéèàçù]+)?)\b"
        ]
        
        for pattern in artist_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                artist = self._clean_text(match.group(1))
                # Filtrer les résultats invalides
                if (len(artist) > 2 and len(artist) < 50 and 
                    not any(word in artist.lower() for word in ['voir', 'plus', 'info', 'suite', 'cette', 'année', 'tableau', 'peinture'])):
                    return artist
        return None
    
    def extract_anecdotes(self, text: str) -> List[str]:
        """Extrait les anecdotes du texte"""
        anecdotes = []
        
        for marker in self.section_markers['anecdote']:
            pattern = rf"{marker}s?\s*:?\s*([^§\n]*(?:\n(?!(?:résumé|titre)).*)*)"
            matches = re.finditer(pattern, text, re.IGNORECASE | re.DOTALL)
            
            for match in matches:
                anecdote = self._clean_text(match.group(1))
                if anecdote and len(anecdote) > 10:
                    anecdotes.append(anecdote)
        
        return anecdotes
    
    def _clean_text(self, text: str) -> str:
        """Nettoie et formate le texte"""
        cleaned = re.sub(r'\s+', ' ', text)
        cleaned = re.sub(r'\n\s*\n', '\n', cleaned)
        return cleaned.strip()
    
    def process_document(self, text: str) -> TextSummary:
        """Traite un document et extrait toutes les informations"""
        title = self.extract_title(text)
        summary = self.extract_summary(text)
        anecdotes = self.extract_anecdotes(text)
        artist = self.extract_artist(text)
        
        metadata = {
            'word_count': str(len(text.split())),
            'has_title': str(bool(title)),
            'anecdote_count': str(len(anecdotes)),
            'has_artist': str(bool(artist))
        }
        
        return TextSummary(
            title=title or "Titre non trouvé",
            summary=summary,
            anecdotes=anecdotes,
            metadata=metadata,
            artist=artist
        )


def process_pdf_file(file_path: str) -> TextSummary:
    """Traite un fichier PDF : extraction texte, parsing, stockage en BDD."""
    text = extract_text_from_pdf(file_path)
    processor = SummaryProcessor()
    summary = processor.process_document(text)

    # Sauvegarde en BDD
    try:
        from db import init_db, add_oeuvre
        init_db()
        # Créer le pdf_link pour tous les fichiers dans pdfs
        pdf_link = f"/uploads/pdfs/{Path(file_path).name}"
        
        oeuvre_id = add_oeuvre(
            file_name=Path(file_path).name,
            file_path=file_path,
            title=summary.title,
            description=summary.summary,
            word_count=int(summary.metadata.get('word_count', 0)),
            artist=summary.artist,
            pdf_link=pdf_link
        )
        
        # Les anecdotes sont maintenant incluses dans les chunks
            
        # Ajouter métadonnées automatiques
        update_artwork_metadata(oeuvre_id, summary.title)
            
    except Exception as e:
        print(f"Erreur sauvegarde BDD: {e}")

    return summary


def update_artwork_metadata(oeuvre_id: int, title: str, db_path: Optional[str] = None):
    """Met à jour les métadonnées d'une œuvre selon son titre"""
    # Cette fonction peut être étendue pour gérer les métadonnées des œuvres
    pass


if __name__ == "__main__":
    pass