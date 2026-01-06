// LangSelector.jsx
import React from 'react';
import './LangSelector.css'; // Assurez-vous que ce fichier CSS existe

/**
 * Composant permettant de sélectionner une langue.
 * * @param {object} props
 * @param {string} props.currentLang - La langue actuellement sélectionnée (ex: 'EN').
 * @param {function} props.onSelectLang - Fonction de rappel appelée lors de la sélection.
 */
const LangSelector = ({ currentLang, onSelectLang }) => {
    // Liste des langues disponibles
    const languages = ['FR', 'EN', 'NL'];

    const handleSelect = (lang) => {
        // Appelle la fonction passée par le parent, uniquement si la langue est différente
        if (lang !== currentLang) {
            onSelectLang(lang);
        }
    };

    return (
        <div className="lang-selector">
            {languages.map((lang) => (
                <span
                    key={lang}
                    className={`lang-option ${lang === currentLang ? 'active' : ''}`}
                    onClick={() => handleSelect(lang)}
                    // Rend l'élément focusable et cliquable au clavier
                    tabIndex={0} 
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            handleSelect(lang);
                        }
                    }}
                    role="button" // Indique qu'il est interactif
                    aria-pressed={lang === currentLang} // Indique l'état de sélection
                >
                    {lang}
                </span>
            ))}
        </div>
    );
};

export default LangSelector;