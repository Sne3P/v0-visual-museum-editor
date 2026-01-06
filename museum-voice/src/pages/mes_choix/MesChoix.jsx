// MesChoix.jsx - ADAPTÉ AUX VRAIS PARAMÈTRES API
import React, { useState, useCallback } from 'react';
import TimeRegulator from '../../components/time_regulator/TimeRegulator';
import AgeSelector from '../../components/age_selector/AgeSelector';
import ThematiqueSelector from '../../components/thematique_selector/ThematiqueSelector';
import StyleTexteSelector from '../../components/style_texte_selector/StyleTexteSelector';
import Header from '../../components/header/Header';
import InterestNotice from '../../components/interest_notice/InterestNotice';
import GenParcours from '../../components/gen_parcours/GenParcours';
import './MesChoix.css';

const MesChoix = () => {
  // États pour les 4 paramètres EXACTS de l'API
  const [timeValue, setTimeValue] = useState(1); // Heures (sera converti en minutes)
  const [ageCible, setAgeCible] = useState('adulte'); // enfant / ado / adulte / senior
  const [thematique, setThematique] = useState('technique_picturale'); // technique_picturale / biographie / historique
  const [styleTexte, setStyleTexte] = useState('analyse'); // analyse / decouverte / anecdote

  // Handlers
  const handleTimeValueChange = useCallback((newValue) => {
    setTimeValue(newValue);
  }, []);

  const handleAgeChange = useCallback((age) => {
    setAgeCible(age);
  }, []);

  const handleThematiqueChange = useCallback((theme) => {
    setThematique(theme);
  }, []);

  const handleStyleChange = useCallback((style) => {
    setStyleTexte(style);
  }, []);

  // Validation avant envoi
  const isFormValid = () => {
    return timeValue > 0 && ageCible && thematique && styleTexte;
  };

  // Envoi à l'API /api/parcours/generate
  const handleSendData = async () => {
    if (!isFormValid()) {
      alert('⚠️ Veuillez remplir tous les choix avant de générer le parcours');
      return;
    }

    // Payload exact de l'API
    const apiPayload = {
      age_cible: ageCible,  // 'enfant', 'ado', 'adulte', 'senior'
      thematique: thematique,  // 'technique_picturale', 'biographie', 'historique'
      style_texte: styleTexte,  // 'analyse', 'decouverte', 'anecdote'
      target_duration_minutes: timeValue * 60  // Convertir heures en minutes
    };

    console.log("📤 Sending to /api/parcours/generate:", apiPayload);

    try {
      // Utiliser une URL relative car nginx fait le proxy vers museum-backend:5000
      const response = await fetch('/api/parcours/generate', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate parcours");
      }

      const data = await response.json();
      console.log("✅ Parcours generated:", data);
      
      if (data.success && data.parcours) {
        // Stocker le parcours généré dans localStorage
        localStorage.setItem('generatedParcours', JSON.stringify(data.parcours));
        
        // Rediriger vers la page de résumé
        window.location.href = '/resume';
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("❌ Error generating parcours:", error);
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  return (
    <div className="mes-choix-container">
      <Header />

      {/* 1. DURÉE - TimeRegulator */}
      <TimeRegulator onValueChange={handleTimeValueChange} />

      {/* 2. ÂGE CIBLE - AgeSelector */}
      <AgeSelector onAgeChange={handleAgeChange} />

      {/* 3. STYLE DE TEXTE - StyleTexteSelector */}
      <StyleTexteSelector onStyleChange={handleStyleChange} />

      {/* 4. THÉMATIQUE - ThematiqueSelector */}
      <ThematiqueSelector onThematiqueChange={handleThematiqueChange} />

      {/* BOUTON DE GÉNÉRATION */}
      <GenParcours onClick={handleSendData} disabled={!isFormValid()} />

      {/* Notice d'information */}
      <InterestNotice />
    </div>
  );
};

export default MesChoix;
