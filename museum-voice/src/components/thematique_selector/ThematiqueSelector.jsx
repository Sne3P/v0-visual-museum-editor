// ThematiqueSelector.jsx - Style GRID avec images
import React, { useState, useEffect } from 'react';
import './ThematiqueSelector.css';
import SelectorGridItem from '../common/SelectorGridItem';

const thematiqueOptions = [
  { id: 'technique_picturale', title: 'Technique Picturale', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'biographie', title: 'Biographie', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'historique', title: 'Contexte Historique', imageUrl: '/assets/images/testmuseum.png' },
];

const ThematiqueSelector = ({ onThematiqueChange }) => {
  const [selectedThematique, setSelectedThematique] = useState('technique_picturale');

  useEffect(() => {
    if (onThematiqueChange) {
      onThematiqueChange(selectedThematique);
    }
  }, [selectedThematique, onThematiqueChange]);

  const handleSelect = (thematiqueId) => {
    setSelectedThematique(thematiqueId);
  };

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
