// StyleTexteSelector.jsx - Style GRID avec images (DYNAMIQUE)
import React, { useState, useEffect } from 'react';
import './StyleTexteSelector.css';
import SelectorGridItem from '../common/SelectorGridItem';

const StyleTexteSelector = ({ onStyleChange }) => {
  const [styleTexteOptions, setStyleTexteOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStyle, setSelectedStyle] = useState('');

  // Charger les options depuis l'API
  useEffect(() => {
    const fetchStyleOptions = async () => {
      try {
        const response = await fetch('/api/criterias?type=style_texte');
        const data = await response.json();
        
        if (data.success && data.criterias) {
          const options = data.criterias.map(c => ({
            id: c.name,
            title: c.label,
            imageUrl: c.image_link || '/assets/images/testmuseum.png'
          }));
          setStyleTexteOptions(options);
          // Sélectionner par défaut le premier ou 'analyse' si disponible
          const defaultStyle = options.find(o => o.id === 'analyse') || options[0];
          if (defaultStyle) setSelectedStyle(defaultStyle.id);
        }
      } catch (error) {
        console.error('Erreur chargement styles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStyleOptions();
  }, []);

  useEffect(() => {
    if (selectedStyle && onStyleChange) {
      onStyleChange(selectedStyle);
    }
  }, [selectedStyle, onStyleChange]);

  const handleSelect = (styleId) => {
    setSelectedStyle(styleId);
  };

  if (loading) {
    return (
      <div className="style-texte-selector-container">
        <div className="style-texte-selector-header">
          ✍️ Quel style de narration préférez-vous ?
        </div>
        <div className="text-center py-4">
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

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
