// StyleTexteSelector.jsx - Style GRID avec images
import React, { useState, useEffect } from 'react';
import './StyleTexteSelector.css';
import SelectorGridItem from '../common/SelectorGridItem';

const styleTexteOptions = [
  { id: 'analyse', title: 'Analyse', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'decouverte', title: 'Découverte', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'anecdote', title: 'Anecdote', imageUrl: '/assets/images/testmuseum.png' },
];

const StyleTexteSelector = ({ onStyleChange }) => {
  const [selectedStyle, setSelectedStyle] = useState('analyse');

  useEffect(() => {
    if (onStyleChange) {
      onStyleChange(selectedStyle);
    }
  }, [selectedStyle, onStyleChange]);

  const handleSelect = (styleId) => {
    setSelectedStyle(styleId);
  };

  return (
    <div className="style-texte-selector-container">
      <div className="style-texte-selector-header">
        ✍️ Quel style de narration préférez-vous ?
      </div>
      <div className="style-texte-selector-grid">
        {styleTexteOptions.map((style) => (
          <SelectorGridItem
            key={style.id}
            id={style.id}
            title={style.title}
            imageUrl={style.imageUrl}
            isSelected={selectedStyle === style.id}
            onClick={() => handleSelect(style.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default StyleTexteSelector;
