import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ResumeProgressBar from "../../components/resume_progress_bar/ResumeProgressBar";
import ResumeArtWorkCard from "../../components/resume_art_work_card/ResumeArtWorkCard";
import ResumeArt from "../../components/resume_art/ResumeArt";
import MapModal from "../../components/map_modal/MapModal";
import "./Resume.css";

const Resume = () => {
    const navigate = useNavigate();
    const [parcours, setParcours] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isMapOpen, setIsMapOpen] = useState(false);

    useEffect(() => {
        // Charger le parcours depuis localStorage
        const storedParcours = localStorage.getItem('generatedParcours');
        
        if (!storedParcours) {
            console.error("Aucun parcours trouvé dans localStorage");
            navigate('/mes-choix');
            return;
        }

        try {
            const parsedParcours = JSON.parse(storedParcours);
            setParcours(parsedParcours);
            setLoading(false);
        } catch (error) {
            console.error("Erreur parsing parcours:", error);
            navigate('/mes-choix');
        }
    }, [navigate]);

    if (loading || !parcours) {
        return <div className="loading">Chargement du parcours...</div>;
    }

    const currentArtwork = parcours.artworks[currentIndex];
    const metadata = parcours.metadata;

    // Calculer le temps total du parcours (somme de tous les distance_to_next)
    const totalMinutes = parcours.artworks.reduce((sum, artwork) => sum + (artwork.distance_to_next || 0), 0);
    
    // Calculer le temps déjà effectué (somme des distance_to_next des œuvres déjà visitées)
    const elapsedMinutes = parcours.artworks.slice(0, currentIndex).reduce((sum, artwork) => sum + (artwork.distance_to_next || 0), 0);
    
    // Temps restant = temps total - temps écoulé
    const remainingMinutes = Math.max(0, totalMinutes - elapsedMinutes);
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = Math.floor(remainingMinutes % 60);
    const timeLeft = `${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}`;

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleNext = () => {
        if (currentIndex < parcours.artworks.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    return (
        <>
            <ResumeProgressBar 
                completed={currentIndex + 1} 
                total={metadata.total_artworks} 
                timeLeft={timeLeft}
            />
            
            <ResumeArt artwork={currentArtwork} />
            
            {/* Bouton Plan du musée */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '15px 20px',
                background: '#f9f9f9'
            }}>
                <button
                    onClick={() => setIsMapOpen(true)}
                    style={{
                        background: 'white',
                        color: '#16163F',
                        border: '2px solid #5dace2',
                        borderRadius: '6px',
                        padding: '12px 24px',
                        fontSize: '1rem',
                        fontWeight: 600,
                        fontFamily: 'serif',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.background = '#5dace2';
                        e.target.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.background = 'white';
                        e.target.style.color = '#16163F';
                    }}
                >
                    <span style={{ fontSize: '1.2rem' }}>🗺️</span>
                    Plan du musée
                </button>
            </div>
            
            {/* Modal du plan */}
            <MapModal 
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                parcours={parcours}
                currentIndex={currentIndex}
            />
            <ResumeArtWorkCard
                title={currentArtwork.title || "Titre inconnu"}
                artist={currentArtwork.artist || "Artiste inconnu"}
                date={currentArtwork.date || ""}
                movement={currentArtwork.materiaux_technique || ""}
                location={`Salle ${currentArtwork.position?.room || '?'}, Étage ${currentArtwork.position?.floor || '?'}`}
                description={currentArtwork.narration || "Description non disponible"}
            />
            
            <div className="navigation-buttons" style={{
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '20px',
                marginTop: '20px'
            }}>
                <button 
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                        opacity: currentIndex === 0 ? 0.5 : 1
                    }}
                >
                    ← Précédent
                </button>
                
                <span style={{ fontSize: '16px', alignSelf: 'center' }}>
                    {currentIndex + 1} / {metadata.total_artworks}
                </span>
                
                <button 
                    onClick={handleNext}
                    disabled={currentIndex === parcours.artworks.length - 1}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        cursor: currentIndex === parcours.artworks.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: currentIndex === parcours.artworks.length - 1 ? 0.5 : 1
                    }}
                >
                    Suivant →
                </button>
            </div>
        </>
    );
};

export default Resume;
