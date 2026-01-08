import os
import time
import itertools
import multiprocessing
from typing import Dict, Any, List, Optional, Tuple

import requests
from rag.core.pregeneration_db import add_pregeneration



class OllamaMediationSystem:
    """
    Système de génération de médiations avec Ollama (inspiré du style de ton script).
    Flux: (optionnel) setup → préparation entrée → génération par combinaisons → stats.
    """

    def __init__(
        self,
        *,
        ollama_url: Optional[str] = None,
        default_model: str = "gemma3:4b",
        timeout_s: int = 15000,
        temperature: float = 0.5,
        num_predict: int = -1,
        verbose: bool = True,
    ) -> None:
        self.ollama_url = (ollama_url or os.getenv("OLLAMA_API_URL", "http://localhost:11434")).rstrip("/")
        self.default_model = default_model
        self.timeout_s = timeout_s
        self.temperature = temperature
        self.num_predict = num_predict
        self.verbose = verbose

        print("🚀 OllamaMediationSystem initialisé")
        print(f"   Ollama URL: {self.ollama_url}")
        print(f"   Modèle défaut: {self.default_model}")

    # ---------------------------------------------------------------------
    # Utils
    # ---------------------------------------------------------------------
    @staticmethod
    def normalize_str(x: Any) -> str:
        return str(x).strip() if x is not None else ""

    @staticmethod
    def truncate(text: str, max_chars: int) -> str:
        text = (text or "").strip()
        if len(text) <= max_chars:
            return text
        cut = text[:max_chars]
        if " " in cut:
            cut = cut.rsplit(" ", 1)[0]
        return cut + "…"

    @staticmethod
    def generate_combinaisons(criteres_dict: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
        keys = criteres_dict.keys()
        values = criteres_dict.values()
        return [dict(zip(keys, combination)) for combination in itertools.product(*values)]

    @staticmethod
    def formater_parametres_criteres(combinaison: Dict[str, Dict[str, Any]]) -> str:
        """
        Transforme le dictionnaire en directives de style impératives.
        """
        instructions = []
        for type_critere, data in combinaison.items():
            nom = data.get("name", "")
            desc = data.get("description", "")
            ai_indication = data.get("ai_indication", "")
            
            # On construit un bloc identitaire fort
            bloc = f"TYPE DE {type_critere.upper()} : {nom}.\n"
            if desc:
                bloc += f"   CONTEXTE : {desc}\n"
            if ai_indication:
                bloc += f"   ORDRE DE STYLE : {ai_indication}\n"
            else:
                bloc += f"   ORDRE DE STYLE : Adopte le vocabulaire, le rythme et les tournures typiques de : {nom}.\n"
                
            instructions.append(bloc)

        return "\n".join(instructions)
    
    @staticmethod
    def _criteria_ids_from_combinaison(combinaison: Dict[str, Any]) -> Dict[str, int]:
        """
        Convertit une combinaison riche (avec name/description/dates) en dict minimal:
        {type_name: criteria_id}
        """
        out: Dict[str, int] = {}
        for type_name, value in (combinaison or {}).items():
            if isinstance(value, int) and not isinstance(value, bool):
                out[type_name] = value
            elif isinstance(value, dict) and "criteria_id" in value:
                out[type_name] = int(value["criteria_id"])
            else:
                raise ValueError(f"Combinaison invalide pour '{type_name}': {value!r}")
        return out

    def _check_existing(self, oeuvre_id: int, combinaison: Dict[str, Any]) -> bool:
        """
        Vérifie si une pregeneration existe déjà pour (oeuvre_id, criteria_combination).
        """
        try:
            import json
            from rag.core.pregeneration_db import _connect_postgres

            criteria_ids = self._criteria_ids_from_combinaison(combinaison)
            criteria_json = json.dumps(criteria_ids, sort_keys=True)

            conn = _connect_postgres()
            cur = conn.cursor()

            cur.execute(
                """
                SELECT 1
                FROM pregenerations
                WHERE oeuvre_id = %s
                  AND criteria_combination = %s::jsonb
                LIMIT 1
                """,
                (oeuvre_id, criteria_json),
            )

            return cur.fetchone() is not None

        except Exception:
            return False
        finally:
            try:
                cur.close()
                conn.close()
            except Exception:
                pass


    # ---------------------------------------------------------------------
    # Ollama
    # ---------------------------------------------------------------------
    def check_ollama_available(self) -> bool:
        """
        Vérifie si l'API Ollama répond (simple ping).
        """
        try:
            r = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    def ollama_chat(
        self,
        *,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        stream: bool = False,
        timeout_s: Optional[int] = None,
    ) -> str:
        url = f"{self.ollama_url}/api/chat"
        
        # Optimisation CPU : utiliser tous les cœurs disponibles (max 16)
        num_threads = min(multiprocessing.cpu_count(), 16)
        
        payload = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": self.temperature if temperature is None else temperature,
                "num_predict": self.num_predict,
<<<<<<< HEAD
                "num_threads": num_threads,  # ⚡ OPTIMISÉ : Utilise tous les CPU cores
=======
                "num_threads": 8,
>>>>>>> ef6d392ababeee71a978571dbf3f8bc135faf0ee
            },
        }
        r = requests.post(url, json=payload, timeout=(timeout_s or self.timeout_s))
        r.raise_for_status()
        data = r.json()
        return data["message"]["content"]

    # ---------------------------------------------------------------------
    # Formatting oeuvre → texte prompt
    # ---------------------------------------------------------------------
    def oeuvre_to_prompt_text(self, payload: Dict[str, Any], *, max_chars: int = 7000) -> str:
        titre = self.normalize_str(payload.get("title") or "Inconnu")
        artiste = self.normalize_str(payload.get("artist") or "Inconnu")
        date = self.normalize_str(payload.get("date_oeuvre") or "Inconnue")
        localisation = self.normalize_str(payload.get("room") or "Non précisée")
        technique = self.normalize_str(payload.get("materiaux_technique") or "")
        provenance = self.normalize_str(payload.get("provenance") or "")

        description = self.truncate(payload.get("description") or "", max_chars)
        analyse = self.truncate(payload.get("analyse_materielle_technique") or "", max_chars)
        iconographie = self.truncate(payload.get("iconographie_symbolique") or "", max_chars)
        contexte = self.truncate(payload.get("contexte_commande") or "", max_chars)

        lines: List[str] = []
        lines.append("ENTRÉE")
        lines.append(f"- Titre : {titre}")
        lines.append(f"- Artiste : {artiste}")
        lines.append(f"- Date : {date}")
        lines.append(f"- Salle / Localisation : {localisation}")
        if technique:
            lines.append(f"- Technique : {technique}")
        if provenance:
            lines.append(f"- Provenance : {provenance}")

        if description:
            lines.append("\nDescription visuelle (à reformuler, ne pas citer mot à mot) :")
            lines.append(description)

        if analyse:
            lines.append("\nAnalyse matérielle et technique (à reformuler) :")
            lines.append(analyse)

        if iconographie:
            lines.append("\nIconographie et interprétation (à reformuler) :")
            lines.append(iconographie)

        if contexte:
            lines.append("\nContexte de création (à reformuler) :")
            lines.append(contexte)

        return "\n".join(lines)

    # ---------------------------------------------------------------------
    # Prompt building
    # ---------------------------------------------------------------------
    def build_single_work_mediation_prompt(
        self,
        work_text: str,
        *,
        combinaison: Dict[str, Dict[str, Any]],
        duree_minutes: int = 3,
    ) -> List[Dict[str, str]]:
        bloc_criteres = self.formater_parametres_criteres(combinaison)
        
        # target_word_count = int(duree_minutes * 130)
        # word_range = f"{target_word_count - 20} à {target_word_count + 20}"

        system = (
            "Tu es un guide de musée expert, un caméléon capable d'adapter radicalement ton discours."
            "Ton objectif est de produire un script d'audioguide destiné à être lu à voix haute."
            "Tu as deux contraintes absolues :"
            "1. VÉRACITÉ : Tu ne dois JAMAIS inventer de faits. Utilise uniquement la source fournie."
            "2. ADAPTATION : Tu dois incarner totalement la 'persona' demandée dans les instructions."
        )

        user = f"""
        PARAMÈTRES
        - Langue : Français
        - Durée cible : {duree_minutes} minute(s)

        SOURCE UNIQUE
        Utilise UNIQUEMENT les informations présentes dans l’entrée d’œuvre ci-dessous.
        N’ajoute aucune information externe. Ne déduis rien.
        Reformule : ne cite jamais mot à mot.
        
        Source de données (source unique)
        {work_text}

        --- RÈGLES D'ÉCRITURE ---
        1. ORALITÉ : Écris pour être lu à voix haute. Fais des phrases courtes. Respire.
        2. GUIDAGE : Utilise des verbes de perception ("Regardez, voyez, observez"). Guide l'œil du visiteur.
        3. VÉRACITÉ : N'utilise QUE les informations fournies ci-dessus. N'invente AUCUNE date ou fait historique.
        4. STRUCTURE :
        - Accroche visuelle immédiate (détail ou impression générale).
        - Description guidée (ce qu'on voit).
        - Contexte/Sens (ce qui est compris à travers le filtre thématique choisi).
        - Conclusion ouverte.
        
        INSTRUCTIONS DE PERSONNALISATION (CRUCIAL)
        Tu dois modifier radicalement ton vocabulaire et ton approche selon ces règles :
        {bloc_criteres}
    

        SORTIE ATTENDUE (TEXTE UNIQUEMENT)
        Écris un texte de MEDIATION AUDIOGUIDE prêt à être lu à voix haute.
        - Description progressive : de loin → de près → matière/lumière/geste → sens (uniquement si présent)
        - Aucun astérisque, aucune didascalie, aucun geste
        - Ton sobre et accessible adapté à un large public
        - Pas d’injonctions émotionnelles (“ressentez”, “imaginez”…)
        - PAS de titres, PAS de listes,  PAS dse Markdown (ni gras, ni italique)
        - Longueur adaptée à {duree_minutes} minute(s) de lecture (approx. 120–160 mots/min)
        """.strip()

        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    # ---------------------------------------------------------------------
    # Génération (une narration)
    # ---------------------------------------------------------------------
    def generate_mediation_for_one_work(
        self,
        *,
        artwork: Dict[str, Any],
        combinaison: Dict[str, Dict[str, Any]],
        duree_minutes: int = 3,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_chars: int = 7000,
    ) -> Dict[str, Any]:
        """
        Génère UNE médiation pour une œuvre + une combinaison de critères.
        Retour: {'success': bool, 'text': str, 'error': str|None}
        """
        try:
            work_text = self.oeuvre_to_prompt_text(artwork, max_chars=max_chars)
            
            messages = self.build_single_work_mediation_prompt(
                work_text,
                combinaison=combinaison,
                duree_minutes=duree_minutes,
            )
            
            print("Prompt messages:")
            for message in messages:
                print(f"{message['role']}: {message['content']}")

            text = self.ollama_chat(
                model=(model or self.default_model),
                messages=messages,
                temperature=temperature,
                stream=False,
            )

            if not text or len(text.strip()) < 30:
                return {"success": False, "error": "Médiation vide ou trop courte", "text": ""}

            return {"success": True, "text": text, "error": None}

        except Exception as e:
            return {"success": False, "error": str(e), "text": ""}

    # ---------------------------------------------------------------------
    # Génération style "pregenerate_artwork" (comme ton script)
    # ---------------------------------------------------------------------
    def pregenerate_artwork(
        self,
        *,
        oeuvre_id: int,
        artwork: Dict[str, Any],
        combinaisons: List[Dict[str, Dict[str, Any]]],
        duree_minutes: int = 3,
        model: Optional[str] = None,
        force_regenerate: bool = False,
    ) -> Dict[str, Any]:
        """
        "Prégénère" une liste de narrations (une par combinaison).
        Ici, pas de BDD: on retourne un dict résultats + stats, mais structure très proche du script.
        """

        start_time = time.time()

        title = artwork.get("title", f"ID {oeuvre_id}")
        
        self.default_model = model

        print(f"\n{'='*80}")
        print(f"🎨 GÉNÉRATION ŒUVRE ID {oeuvre_id}")
        print(f"{'='*80}")
        print(f"📖 Œuvre: {title}")
        
        print(f"Modèle utilisé: {self.default_model}")
        

        # Vérif Ollama
        if not self.check_ollama_available():
            print("⚠️  ATTENTION: Ollama non disponible (vérifie OLLAMA_API_URL / service)")

        print("\n🤖 Génération Ollama (séquentiel)")

        stats = {"generated": 0, "updated": 0, "skipped": 0, "errors": 0}
        results: List[Dict[str, Any]] = []

        total = len(combinaisons)
        for i, combinaison in enumerate(combinaisons, 1):
            label = self._format_combinaison_label(combinaison)
            print(f"   [{i}/{total}] {label}...", end=" ", flush=True)

            # Ici "skip" n'a de sens que si tu branches une BDD/cache.
            # On le garde pour ressembler au script.
            # if not force_regenerate:
            #     stats["skipped"] += 1
            #     print("⏭️  Skip (force_regenerate=False)")
            #     continue
            
            # if not force_regenerate:
                # existing = self._check_existing(oeuvre_id, age, theme, style)
            existing = self._check_existing(oeuvre_id, combinaison)
            if existing:
                stats['skipped'] += 1
                print("⏭️  Skip la génération car elle existe déjà.")
                continue

            res = self.generate_mediation_for_one_work(
                artwork=artwork,
                combinaison=combinaison,
                duree_minutes=duree_minutes,
                model=model,
            )

            if res["success"]:
                stats["generated"] += 1
                print("✅ OK")
                results.append(
                    {
                        "oeuvre_id": oeuvre_id,
                        "title": title,
                        "combinaison": combinaison,
                        "text": res["text"],
                    }
                )
                
                
                print(" combinaison : " + str(combinaison))
                print("texte généré : " + res["text"])
                
                # SAUVEGARDER
                pregen_id = add_pregeneration(
                    oeuvre_id=oeuvre_id,
                    criteria_dict=combinaison,
                    pregeneration_text=res["text"]
                )
                
                
                
                
                if pregen_id:
                    if force_regenerate:
                        stats['updated'] += 1
                        print(f"✅ MAJ (ID: {pregen_id})")
                    else:
                        stats['generated'] += 1
                        print(f"✨ OK (ID: {pregen_id})")
            else:
                stats["errors"] += 1
                print(f"❌ {str(res['error'])[:60]}")
                results.append(
                    {
                        "oeuvre_id": oeuvre_id,
                        "title": title,
                        "combinaison": combinaison,
                        "error": res["error"],
                        "text": "",
                    }
                )

        duration = time.time() - start_time

        print(f"\n{'='*80}")
        print("📊 RÉSUMÉ GÉNÉRATION")
        print(f"{'='*80}")
        print(f"✨ Générées: {stats['generated']}")
        print(f"🔄 Mises à jour: {stats['updated']}")
        print(f"⏭️  Ignorées: {stats['skipped']}")
        print(f"❌ Erreurs: {stats['errors']}")
        print(f"⏱️  Durée: {duration:.1f}s")

        if stats["generated"] > 0 and duration > 0:
            print(f"⚡ Vitesse: {stats['generated']/duration:.2f} narrations/seconde")

        return {    # il manque la section sauvegardr
            "success": True,
            "oeuvre_id": oeuvre_id,
            "title": title,
            "stats": stats,
            "duration": duration,
            "results": results,
        }

    # ---------------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------------
    @staticmethod
    def _format_combinaison_label(combinaison: Dict[str, Dict[str, Any]]) -> str:
        """
        Petit label lisible pour l'affichage console.
        Exemple: "age=Enfant | theme=Technique | style=Découverte"
        """
        parts = []
        for k, v in combinaison.items():
            parts.append(f"{k}={v.get('name', '')}")
        return " | ".join(parts)
