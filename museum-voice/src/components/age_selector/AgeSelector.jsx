// AgeSelector.jsx - Style GRID avec images (DYNAMIQUE)
import React, { useState, useEffect } from 'react';
import './AgeSelector.css';
import SelectorGridItem from '../common/SelectorGridItem';

const AgeSelector = ({ onAgeChange }) => {
  const [ageOptions, setAgeOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAge, setSelectedAge] = useState('');

  // Charger les options depuis l'API
  useEffect(() => {
    const fetchAgeOptions = async () => {
      try {
        const response = await fetch('/api/criterias?type=age');
        const data = await response.json();
        
        if (data.success && data.criterias) {
          const options = data.criterias.map(c => ({
            id: c.name,
            title: c.label,
            imageUrl: c.image_link || '/assets/images/testmuseum.png'
          }));
          setAgeOptions(options);
          // Sélectionner par défaut le premier ou 'adulte' si disponible
          const defaultAge = options.find(o => o.id === 'adulte') || options[0];
          if (defaultAge) setSelectedAge(defaultAge.id);
        }
      } catch (error) {
        console.error('Erreur chargement ages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgeOptions();
  }, []);

  useEffect(() => {
    if (selectedAge && onAgeChange) {
      onAgeChange(selectedAge);
    }
  }, [selectedAge, onAgeChange]);

  const handleSelect = (ageId) => {
    setSelectedAge(ageId);
  };

  if (loading) {
    return (
      <div className="age-selector-container">
        <div className="age-selector-header">
          👤 Pour quel âge souhaitez-vous le parcours ?
        </div>
        <div className="text-center py-4">
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="age-selector-container">
      <div className="age-selector-header">
        👤 Pour quel âge souhaitez-vous le parcours ?
      </div>
      <div className="age-selector-grid">
        {ageOptions.map((age) => (
          <SelectorGridItem
            key={age.id}
            id={age.id}
            title={age.title}
            imageUrl={age.imageUrl}
            isSelected={selectedAge === age.id}
            onClick={() => handleSelect(age.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default AgeSelector;
