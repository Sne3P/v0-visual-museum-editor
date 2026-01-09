// MesChoix.jsx - SYSTÈME 100% DYNAMIQUE
import React, { useState, useCallback, useEffect } from 'react';
import TimeRegulator from '../../components/time_regulator/TimeRegulator';
import CriteriaSelector from '../../components/criteria_selector/CriteriaSelector';
import Header from '../../components/header/Header';
import InterestNotice from '../../components/interest_notice/InterestNotice';
import GenParcours from '../../components/gen_parcours/GenParcours';
import { useNavigate } from 'react-router-dom';
import { checkSession } from '../../utils/session';
import './MesChoix.css';

const MesChoix = () => {
  const navigate = useNavigate();
  
  // Vérifier la session au chargement
  useEffect(() => {
    checkSession().then(({ valid }) => {
      if (!valid) {
        console.warn('⚠️ Session invalide ou expirée');
        alert('⚠️ Votre session a expiré. Veuillez scanner un nouveau QR code.');
        navigate('/');
      }
    });
  }, [navigate]);
  
  // Charger la valeur initiale depuis localStorage ou utiliser 1h par défaut
  const getInitialTimeValue = () => {
    const savedValue = localStorage.getItem("timeSliderValue");
    return savedValue !== null ? parseFloat(savedValue) : 1;
  };

  const [timeValue, setTimeValue] = useState(getInitialTimeValue()); // Heures
  const [criteriaTypes, setCriteriaTypes] = useState([]); // Types de critères chargés depuis l'API
  const [selectedCriterias, setSelectedCriterias] = useState({}); // { age: 'adulte', thematique: 'biographie', ... }
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false); // État de génération du parcours

  // Charger les types de critères depuis l'API
  useEffect(() => {
    const fetchCriteriaTypes = async () => {
      try {
        const response = await fetch('/api/criteria-types');
        const data = await response.json();
        
        if (data.success && data.types) {
          // Trier par ordre
          const sorted = data.types.sort((a, b) => a.ordre - b.ordre);
          setCriteriaTypes(sorted);
        }
      } catch (error) {
        console.error('Erreur chargement types de critères:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCriteriaTypes();
  }, []);

  const handleTimeValueChange = useCallback((newValue) => {
    setTimeValue(newValue);
  }, []);

  const handleCriteriaSelect = useCallback((criteriaData) => {
    setSelectedCriterias(prev => ({
      ...prev,
      [criteriaData.type]: criteriaData.name
    }));
  }, []);

  // Validation : tous les critères requis doivent être sélectionnés
  const isFormValid = () => {
    if (timeValue <= 0) return false;
    
    const requiredTypes = criteriaTypes.filter(t => t.is_required);
    return requiredTypes.every(type => selectedCriterias[type.type_name]);
  };

  const handleSendData = async () => {
    if (!isFormValid()) {
      alert('⚠️ Veuillez remplir tous les choix requis avant de générer le parcours');
      return;
    }

    // Construction du payload API VRAIMENT DYNAMIQUE avec dict de critères
    const criteria = {};
    for (const [type, name] of Object.entries(selectedCriterias)) {
      criteria[type] = name;  // {age: "adulte", thematique: "technique_picturale", ...}
    }

    // Générer un seed unique pour ce parcours (timestamp + random)
    const uniqueSeed = Date.now() + Math.floor(Math.random() * 10000);

    const apiPayload = {
      criteria: criteria,  // Format dict flexible pour N critères
      target_duration_minutes: timeValue * 60,
      variation_seed: uniqueSeed,  // Seed unique pour éviter les collisions
      generate_audio: true
    };

    console.log("📤 Payload envoyé:", apiPayload);
    console.log(`⏱️ Temps sélectionné: ${timeValue}h = ${timeValue * 60} minutes`);

    setGenerating(true); // Activer le loader
    try {
      const response = await fetch('/api/parcours/generate', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate parcours");
      }

      const data = await response.json();
      console.log("✅ Parcours generated:", data);
      
      if (data.success && data.parcours) {
        localStorage.setItem('generatedParcours', JSON.stringify(data.parcours));
        
        // Lier le parcours à la session active (si QR code)
        const sessionToken = localStorage.getItem('museum-session-token');
        if (sessionToken && data.parcours.metadata?.unique_parcours_id) {
          try {
            await fetch('/api/parcours/link-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: sessionToken,
                parcours_id: data.parcours.metadata.unique_parcours_id
              })
            });
            console.log('🔗 Parcours lié à la session');
          } catch (linkError) {
            console.warn('⚠️ Erreur liaison session:', linkError);
          }
        }
        
        // TODO: Désactivé temporairement pour debug - réactiver en prod
        // Déclencher un nettoyage des anciens fichiers (async, non-bloquant)
        // fetch('/api/cleanup/audio', { method: 'POST' })
        //   .catch(err => console.warn('⚠️ Cleanup error:', err));
        
        window.location.href = '/resume';
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("❌ Error generating parcours:", error);
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setGenerating(false); // Désactiver le loader
    }
  };

  if (loading) {
    return (
      <div className="mes-choix-container">
        <Header />
        <div className="text-center py-8">
          <p className="text-gray-500">Chargement des critères...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mes-choix-container">
      {/* Loader de génération */}
      {generating && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Génération de votre parcours personnalisé...</p>
        </div>
      )}

      <Header />

      {/* Durée */}
      <TimeRegulator onValueChange={handleTimeValueChange} />

      {/* Critères dynamiques */}
      {criteriaTypes.map((criteriaType) => (
        <CriteriaSelector
          key={criteriaType.type_name}
          criteriaType={criteriaType.type_name}
          title={criteriaType.label}
          icon={criteriaType.icon || '📋'}
          onSelect={handleCriteriaSelect}
        />
      ))}

      {/* Bouton de génération */}
      <GenParcours onClick={handleSendData} disabled={!isFormValid() || generating} />

      {/* Notice */}
      <InterestNotice />
    </div>
  );
};

export default MesChoix;
