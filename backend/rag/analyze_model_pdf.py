#!/usr/bin/env python3
"""Script pour analyser le modèle de PDF fourni"""

import sys
from pathlib import Path
import PyPDF2

def analyze_pdf_structure(pdf_path):
    """Analyse la structure du PDF modèle"""
    print(f"🔍 Analyse du PDF modèle: {pdf_path}")
    
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            print(f"📄 Nombre de pages: {len(pdf_reader.pages)}")
            
            full_text = ""
            for i, page in enumerate(pdf_reader.pages):
                text = page.extract_text()
                full_text += text + "\n"
                print(f"\n--- PAGE {i+1} ---")
                print(text)
                
            # Analyser la structure
            print("\n" + "="*60)
            print("📋 STRUCTURE DÉTECTÉE:")
            print("="*60)
            
            lines = [line.strip() for line in full_text.split('\n') if line.strip()]
            
            # Chercher les sections typiques
            sections_found = []
            current_section = None
            
            for line in lines:
                line_lower = line.lower()
                
                # Détection des sections
                if any(keyword in line_lower for keyword in ['titre', 'title', 'nom de l\'œuvre']):
                    sections_found.append(('TITRE', line))
                elif any(keyword in line_lower for keyword in ['artiste', 'artist', 'auteur']):
                    sections_found.append(('ARTISTE', line))
                elif any(keyword in line_lower for keyword in ['date', 'année', 'époque']):
                    sections_found.append(('DATE', line))
                elif any(keyword in line_lower for keyword in ['technique', 'matériau', 'support']):
                    sections_found.append(('TECHNIQUE', line))
                elif any(keyword in line_lower for keyword in ['dimensions', 'taille', 'format']):
                    sections_found.append(('DIMENSIONS', line))
                elif any(keyword in line_lower for keyword in ['mouvement', 'style', 'courant']):
                    sections_found.append(('MOUVEMENT', line))
                elif any(keyword in line_lower for keyword in ['localisation', 'salle', 'position']):
                    sections_found.append(('LOCALISATION', line))
                elif any(keyword in line_lower for keyword in ['résumé', 'description', 'présentation']):
                    sections_found.append(('RÉSUMÉ', line))
                elif any(keyword in line_lower for keyword in ['contexte', 'historique', 'histoire']):
                    sections_found.append(('CONTEXTE', line))
                elif any(keyword in line_lower for keyword in ['anecdote', 'curiosité', 'fait']):
                    sections_found.append(('ANECDOTE', line))
                elif any(keyword in line_lower for keyword in ['analyse', 'interprétation', 'symbolisme']):
                    sections_found.append(('ANALYSE', line))
                elif any(keyword in line_lower for keyword in ['influence', 'postérité', 'impact']):
                    sections_found.append(('INFLUENCE', line))
                
            # Afficher les sections trouvées
            for section_type, line in sections_found:
                print(f"🔖 {section_type}: {line}")
            
            return sections_found, full_text
            
    except Exception as e:
        print(f"❌ Erreur lors de l'analyse: {e}")
        return [], ""

if __name__ == "__main__":
    # Chercher le fichier modèle
    possible_paths = [
        "Modele_resume_oeuvre.pdf",
        "c:/Users/gauti/OneDrive/Documents/Cours/M2/Projet_YES/MuseumVoice/Modele_resume_oeuvre.pdf"
    ]
    
    pdf_path = None
    for path in possible_paths:
        if Path(path).exists():
            pdf_path = path
            break
    
    if pdf_path:
        sections, text = analyze_pdf_structure(pdf_path)
    else:
        print("❌ Fichier modèle PDF non trouvé")