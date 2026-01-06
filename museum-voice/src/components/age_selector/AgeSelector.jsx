// AgeSelector.jsx - Style GRID avec images
import React, { useState, useEffect } from 'react';
import './AgeSelector.css';
import SelectorGridItem from '../common/SelectorGridItem';

const ageOptions = [
  { id: 'enfant', title: 'Enfant', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'ado', title: 'Adolescent', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'adulte', title: 'Adulte', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'senior', title: 'Senior', imageUrl: '/assets/images/testmuseum.png' },
];

const AgeSelector = ({ onAgeChange }) => {
  const [selectedAge, setSelectedAge] = useState('adulte');

  useEffect(() => {
    if (onAgeChange) {
      onAgeChange(selectedAge);
    }
  }, [selectedAge, onAgeChange]);

  const handleSelect = (ageId) => {
    setSelectedAge(ageId);
  };

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
