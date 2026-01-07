// ThematiqueSelector.jsx - Style GRID avec images (DYNAMIQUE)
import React, { useState, useEffect } from 'react';
import './ThematiqueSelector.css';
import SelectorGridItem from '../common/SelectorGridItem';

const ThematiqueSelector = ({ onThematiqueChange }) => {
  const [thematiqueOptions, setThematiqueOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedThematique, setSelectedThematique] = useState('');

  // Charger les options depuis l'API
  useEffect(() => {
    const fetchThematiqueOptions = async () => {
      try {
        const response = await fetch('/api/criterias?type=thematique');
        const data = await response.json();
        
        if (data.success && data.criterias) {
          const options = data.criterias.map(c => ({
            id: c.name,
            title: c.label,
            imageUrl: c.image_link || '/assets/images/testmuseum.png'
          }));
          setThematiqueOptions(options);
          // Sélectionner par défaut le premier ou 'technique_picturale' si disponible
          const defaultThematique = options.find(o => o.id === 'technique_picturale') || options[0];
          if (defaultThematique) setSelectedThematique(defaultThematique.id);
        }
      } catch (error) {
        console.error('Erreur chargement thematiques:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchThematiqueOptions();
  }, []);

  useEffect(() => {
    if (selectedThematique && onThematiqueChange) {
      onThematiqueChange(selectedThematique);
    }
  }, [selectedThematique, onThematiqueChange]);

  const handleSelect = (thematiqueId) => {
    setSelectedThematique(thematiqueId);
  };

  if (loading) {
    return (
      <div className="thematique-selector-container">
        <div className="thematique-selector-header">
          🎯 Quelle thématique vous intéresse ?
        </div>
        <div className="text-center py-4">
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="thematique-selector-container">
      <div className="thematique-selector-header">
        🎯 Quelle thématique vous intéresse ?
      </div>
      <div className="thematique-selector-grid">
        {thematiqueOptions.map((thematique) => (
          <SelectorGridItem
            key={thematique.id}
            id={thematique.id}
            title={thematique.title}
            imageUrl={thematique.imageUrl}
            isSelected={selectedThematique === thematique.id}
            onClick={() => handleSelect(thematique.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default ThematiqueSelector;
