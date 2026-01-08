import React, { useState, useEffect } from 'react'; // 👈 Importez useState et useEffect
import Header from '../../components/header/Header';
import WelcomeMsg from '../../components/welcome_msg/WelcomeMsg';
import LangSelector from '../../components/lang-selector/LangSelector';
import WelcomeBgImg from '../../components/welcome_bg_img/WelcomeBgImg';
import StartMsg from '../../components/start_msg/StartMsg';
import GenParcours from '../../components/gen_parcours/GenParcours';
import { useNavigate } from 'react-router-dom';


const Accueil = () => {
  // 1. Initialiser l'état de la langue. Par défaut à 'FR' par exemple.
  const [selectedLanguage, setSelectedLanguage] = useState('FR');
  const [museumImageUrl, setMuseumImageUrl] = useState('/placeholder.svg');

  // Charger l'image du musée depuis l'API
  useEffect(() => {
    const fetchMuseumImage = async () => {
      try {
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/api/museum-settings?setting_key=museum_image_url`);
        const data = await response.json();
        
        if (data && data.setting_value) {
          // Si l'URL est relative, ajouter le backendUrl
          const imageUrl = data.setting_value.startsWith('http') 
            ? data.setting_value 
            : `${backendUrl}${data.setting_value}`;
          setMuseumImageUrl(imageUrl);
        }
      } catch (error) {
        console.error('Erreur chargement image musée:', error);
        // Garder le placeholder par défaut en cas d'erreur
      }
    };

    fetchMuseumImage();
  }, []);

  // [Inference] Optionnel : Utiliser useEffect pour sauvegarder ou charger la langue
  useEffect(() => {
    console.log(`La langue actuelle est maintenant : ${selectedLanguage}`);
    // Ici, vous pourriez implémenter la logique pour changer la langue
    // de toute l'application (par exemple, charger un fichier de traduction).
  }, [selectedLanguage]);
  
  // Fonction de gestion du changement de langue
  const handleLanguageChange = (newLang) => {
    setSelectedLanguage(newLang);
  };
  
  const navigate = useNavigate();
  const goToMesChoix = () => {
    // [Inference] Vous pourriez passer la langue sélectionnée au composant suivant si nécessaire
    // navigate('/mes-choix', { state: { lang: selectedLanguage } });
    navigate('/mes-choix');
  }
  
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header />
      <WelcomeMsg />
      
      {/* 2. Intégrer le LangSelector avec l'état et le gestionnaire */}
      <LangSelector 
        currentLang={selectedLanguage}
        onSelectLang={handleLanguageChange}
      />

      <div style={{ flex: 1 }}>
        <WelcomeBgImg
          imageUrl={museumImageUrl}
          altText="Museum Welcome Background"
        />
      </div>
      <StartMsg />
      <GenParcours onClick={goToMesChoix } />
    </div>
  );
};

export default Accueil;