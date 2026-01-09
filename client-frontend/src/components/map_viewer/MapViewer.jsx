import React, { useEffect, useState, useRef } from 'react';
import './MapViewer.css';

const MapViewer = ({ parcours, currentIndex }) => {
    const [floorPlanData, setFloorPlanData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentFloor, setCurrentFloor] = useState(0);
    const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1000, height: 800 });
    const svgRef = useRef(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [touchStartDist, setTouchStartDist] = useState(0);

    useEffect(() => {
        if (!parcours || !parcours.artworks) return;

        // Récupérer le plan du musée via le proxy Next.js
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000'
        fetch(`${backendUrl}/api/museum/floor-plan`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setFloorPlanData(data);
                    
                    // Calculer le viewBox optimal pour tous les points
                    const allPoints = [];
                    data.rooms.forEach(room => {
                        room.polygon_points.forEach(p => allPoints.push(p));
                    });

                    if (allPoints.length > 0) {
                        const xs = allPoints.map(p => p.x);
                        const ys = allPoints.map(p => p.y);
                        const minX = Math.min(...xs) - 50;
                        const minY = Math.min(...ys) - 50;
                        const maxX = Math.max(...xs) + 50;
                        const maxY = Math.max(...ys) + 50;
                        
                        setViewBox({
                            x: minX,
                            y: minY,
                            width: maxX - minX,
                            height: maxY - minY
                        });
                    }

                    // Définir l'étage de l'œuvre actuelle
                    if (currentIndex >= 0 && currentIndex < parcours.artworks.length) {
                        setCurrentFloor(parcours.artworks[currentIndex].position.floor);
                    }
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Erreur chargement plan:', err);
                setLoading(false);
            });
    }, [parcours]);

    // Mettre à jour l'étage affiché selon l'œuvre actuelle
    useEffect(() => {
        if (parcours && currentIndex >= 0 && currentIndex < parcours.artworks.length) {
            const floor = parcours.artworks[currentIndex].position?.floor;
            if (floor !== undefined && floor !== null) {
                setCurrentFloor(floor);
            }
        }
    }, [currentIndex, parcours]);

    // Gestion du zoom avec molette (desktop)
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const handleWheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1.1 : 0.9;
            setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
        };

        svg.addEventListener('wheel', handleWheel, { passive: false });
        
        return () => {
            svg.removeEventListener('wheel', handleWheel);
        };
    }, []);

    // Gestion du pan (déplacement)
    const handleMouseDown = (e) => {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e) => {
        if (!isPanning) return;
        
        const dx = (e.clientX - panStart.x) * (viewBox.width / 800) / scale;
        const dy = (e.clientY - panStart.y) * (viewBox.height / 600) / scale;
        
        setViewBox(prev => ({
            ...prev,
            x: prev.x - dx,
            y: prev.y - dy
        }));
        
        setPanStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    // Gestion zoom pinch (mobile)
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dist = getTouchDistance(e.touches[0], e.touches[1]);
            setTouchStartDist(dist);
        } else if (e.touches.length === 1) {
            setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
            setIsPanning(true);
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && touchStartDist > 0) {
            e.preventDefault();
            const dist = getTouchDistance(e.touches[0], e.touches[1]);
            const delta = dist / touchStartDist;
            setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
            setTouchStartDist(dist);
        } else if (e.touches.length === 1 && isPanning) {
            const dx = (e.touches[0].clientX - panStart.x) * (viewBox.width / 800) / scale;
            const dy = (e.touches[0].clientY - panStart.y) * (viewBox.height / 600) / scale;
            
            setViewBox(prev => ({
                ...prev,
                x: prev.x - dx,
                y: prev.y - dy
            }));
            
            setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        }
    };

    const handleTouchEnd = () => {
        setIsPanning(false);
        setTouchStartDist(0);
    };

    const getTouchDistance = (touch1, touch2) => {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    if (loading) {
        return <div className="map-viewer-loading">Chargement du plan...</div>;
    }

    if (!floorPlanData || !parcours) {
        return <div className="map-viewer-error">Plan non disponible</div>;
    }

    const currentArtwork = parcours.artworks[currentIndex];
    const floors = parcours.metadata?.floors_list || [0];
    const hasMultipleFloors = floors.length > 1;

    // Filtrer les salles de l'étage actuel
    const roomsOnFloor = floorPlanData.rooms.filter(r => r.floor === currentFloor);

    // Filtrer artworks de l'étage actuel
    const artworksOnFloor = parcours.artworks.filter(a => a.position.floor === currentFloor);
    
    // Filtrer segments : SEULEMENT ceux où from ET to sont sur le même étage (currentFloor)
    // Les segments inter-étages (escaliers) ne doivent pas s'afficher
    const segmentsOnFloor = (parcours.path_segments || []).filter(s => 
        s.from.floor === currentFloor && s.to.floor === currentFloor
    );
    
    // Déterminer quels segments sont "en cours" (entre œuvre actuelle et suivante)
    // IMPORTANT : Le segment bleu s'affiche sur TOUS les étages où il y a des segments
    // avec segment_index === currentIndex (pas seulement l'étage de l'œuvre actuelle)
    // Exemple : Œuvre 4 (étage 0) → Œuvre 5 (étage 1)
    //   - Segments avec segment_index=3 à l'étage 0 (vers escalier) → BLEU
    //   - Segments avec segment_index=3 à l'étage 1 (depuis escalier) → BLEU
    const currentSegmentIndexes = [];
    if (currentIndex < parcours.artworks.length - 1) {
        currentSegmentIndexes.push(currentIndex);
    }
    
    // Nom de l'étage pour l'affichage (utiliser floor_name du parcours)
    const currentFloorArtwork = parcours.artworks.find(a => a.position.floor === currentFloor);
    const floorName = currentFloorArtwork?.position?.floor_name || 
                      (currentFloor === 0 ? 'RDC' : 
                       currentFloor > 0 ? `Étage ${currentFloor}` : 
                       `Sous-sol ${Math.abs(currentFloor)}`);

    return (
        <div className="map-viewer-container">
            <div className="map-viewer-header">
                <h3>Plan du musée{hasMultipleFloors ? ` - ${floorName}` : ''}</h3>
                <div className="map-controls">
                    <button onClick={() => setScale(prev => Math.min(3, prev * 1.2))}>+</button>
                    <button onClick={() => setScale(prev => Math.max(0.5, prev * 0.8))}>-</button>
                    <button onClick={() => setScale(1)}>Reset</button>
                </div>
            </div>

            {hasMultipleFloors && (
                <div className="floor-selector">
                    {floors.map(floor => {
                        // Chercher le nom de l'étage depuis le parcours (floor_name)
                        const artwork = parcours.artworks.find(a => a.position.floor === floor);
                        const floorLabel = artwork?.position?.floor_name || 
                                         (floor === 0 ? 'RDC' : 
                                          floor > 0 ? `Étage ${floor}` : 
                                          `SS ${Math.abs(floor)}`);
                        return (
                            <button
                                key={floor}
                                className={`floor-button ${floor === currentFloor ? 'active' : ''}`}
                                onClick={() => setCurrentFloor(floor)}
                            >
                                {floorLabel}
                            </button>
                        );
                    })}
                </div>
            )}
            
            <svg
                ref={svgRef}
                className={`map-viewer-svg ${isPanning ? 'panning' : ''}`}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width / scale} ${viewBox.height / scale}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Dessiner les salles */}
                {roomsOnFloor.map(room => (
                    <g key={room.entity_id}>
                        <polygon
                            points={room.polygon_points.map(p => `${p.x},${p.y}`).join(' ')}
                            className="room-polygon"
                            fill="#f0f0f0"
                            stroke="#333"
                            strokeWidth="2"
                        />
                        {room.polygon_points.length > 0 && (
                            <text
                                x={room.polygon_points.reduce((sum, p) => sum + p.x, 0) / room.polygon_points.length}
                                y={room.polygon_points.reduce((sum, p) => sum + p.y, 0) / room.polygon_points.length}
                                className="room-label"
                                textAnchor="middle"
                                fill="#666"
                                fontSize="14"
                            >
                                {room.name}
                            </text>
                        )}
                    </g>
                ))}

                {/* Dessiner UNIQUEMENT le segment actuel (prochain chemin en BLEU) */}
                {segmentsOnFloor.map((segment, idx) => {
                    // Afficher uniquement le segment actuel en bleu
                    const isCurrentSegment = currentSegmentIndexes.includes(segment.segment_index);
                    
                    if (!isCurrentSegment) return null; // Ignorer les autres segments
                    
                    return (
                        <line
                            key={`segment-${idx}`}
                            x1={segment.from.x}
                            y1={segment.from.y}
                            x2={segment.to.x}
                            y2={segment.to.y}
                            stroke="#5dace2"
                            strokeWidth="4"
                            opacity={1}
                        />
                    );
                })}

                {/* Dessiner les waypoints (points verts AGRANDIS) */}
                {segmentsOnFloor.map((segment, idx) => {
                    // Si le 'from' ou 'to' est un waypoint, le dessiner
                    const waypoints = [];
                    
                    if (segment.from.type === 'waypoint') {
                        waypoints.push({
                            x: segment.from.x,
                            y: segment.from.y,
                            type: 'door'
                        });
                    }
                    
                    if (segment.to.type === 'waypoint') {
                        waypoints.push({
                            x: segment.to.x,
                            y: segment.to.y,
                            type: 'door'
                        });
                    }
                    
                    return waypoints.map((waypoint, wpIdx) => (
                        <circle
                            key={`waypoint-${idx}-${wpIdx}`}
                            cx={waypoint.x}
                            cy={waypoint.y}
                            r="8"
                            fill="#4caf50"
                            stroke="#fff"
                            strokeWidth="2"
                        />
                    ));
                })}

                {/* Dessiner les escaliers/ascenseurs (points orange) */}
                {(() => {
                    // Collecter tous les escaliers/ascenseurs de cet étage (éviter les doublons)
                    const stairsMap = new Map();
                    
                    segmentsOnFloor.forEach(segment => {
                        // Vérifier 'from'
                        if (segment.from.type === 'stairs' || segment.from.type === 'elevator') {
                            const key = `${segment.from.x}-${segment.from.y}`;
                            if (!stairsMap.has(key)) {
                                stairsMap.set(key, {
                                    x: segment.from.x,
                                    y: segment.from.y,
                                    type: segment.from.type
                                });
                            }
                        }
                        
                        // Vérifier 'to'
                        if (segment.to.type === 'stairs' || segment.to.type === 'elevator') {
                            const key = `${segment.to.x}-${segment.to.y}`;
                            if (!stairsMap.has(key)) {
                                stairsMap.set(key, {
                                    x: segment.to.x,
                                    y: segment.to.y,
                                    type: segment.to.type
                                });
                            }
                        }
                    });
                    
                    // Afficher tous les escaliers/ascenseurs
                    return Array.from(stairsMap.values()).map((stair, idx) => (
                        <g key={`stair-${idx}`}>
                            {/* Cercle orange pour l'escalier */}
                            <circle
                                cx={stair.x}
                                cy={stair.y}
                                r="10"
                                fill="#ff9800"
                                stroke="#fff"
                                strokeWidth="2"
                            />
                            {/* Icône escalier (lignes diagonales) */}
                            <line
                                x1={stair.x - 6}
                                y1={stair.y + 4}
                                x2={stair.x + 6}
                                y2={stair.y - 4}
                                stroke="#fff"
                                strokeWidth="2"
                            />
                            <line
                                x1={stair.x - 3}
                                y1={stair.y + 4}
                                x2={stair.x + 3}
                                y2={stair.y - 4}
                                stroke="#fff"
                                strokeWidth="2"
                            />
                        </g>
                    ));
                })()}

                {/* Dessiner les œuvres (cercles AGRANDIS) */}
                {artworksOnFloor.map((artwork, idx) => {
                    const isCurrent = artwork.oeuvre_id === currentArtwork?.oeuvre_id;
                    const isPast = artwork.order < (currentArtwork?.order || 0);
                    const globalIdx = parcours.artworks.findIndex(a => a.oeuvre_id === artwork.oeuvre_id);
                    
                    return (
                        <g key={artwork.oeuvre_id}>
                            {/* Point de l'œuvre - AGRANDI */}
                            <circle
                                cx={artwork.position.x}
                                cy={artwork.position.y}
                                r={isCurrent ? 16 : 12}
                                className={`artwork-point ${isCurrent ? 'current' : ''} ${isPast ? 'visited' : ''}`}
                                fill={isCurrent ? '#ff0000' : isPast ? '#888' : '#5dace2'}
                                stroke="#fff"
                                strokeWidth="3"
                            />
                            
                            {/* Numéro de l'ordre - AGRANDI */}
                            <text
                                x={artwork.position.x}
                                y={artwork.position.y}
                                className="artwork-order"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#fff"
                                fontSize="14"
                                fontWeight="bold"
                            >
                                {artwork.order}
                            </text>
                            
                            {/* Label avec titre (seulement pour l'œuvre actuelle) */}
                            {isCurrent && (
                                <g>
                                    <rect
                                        x={artwork.position.x + 15}
                                        y={artwork.position.y - 12}
                                        width={Math.min(artwork.title.length * 6 + 10, 200)}
                                        height="24"
                                        fill="#ff0000"
                                        stroke="#fff"
                                        strokeWidth="1"
                                        rx="3"
                                    />
                                    <text
                                        x={artwork.position.x + 20}
                                        y={artwork.position.y + 3}
                                        className="artwork-label"
                                        fill="#fff"
                                        fontSize="12"
                                        fontWeight="bold"
                                    >
                                        {artwork.title.length > 30 ? artwork.title.substring(0, 30) + '...' : artwork.title}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>

            <div className="map-viewer-legend">
                <div className="legend-item">
                    <div className="legend-color" style={{backgroundColor: '#ff0000'}}></div>
                    <span>Œuvre actuelle</span>
                </div>
                <div className="legend-item">
                    <div className="legend-color" style={{backgroundColor: '#5dace2'}}></div>
                    <span>Œuvre à venir</span>
                </div>
                <div className="legend-item">
                    <div className="legend-color" style={{backgroundColor: '#888'}}></div>
                    <span>Œuvre visitée</span>
                </div>
                <div className="legend-item">
                    <div className="legend-color" style={{backgroundColor: '#4caf50'}}></div>
                    <span>Porte</span>
                </div>
                {hasMultipleFloors && (
                    <div className="legend-item">
                        <div className="legend-color" style={{backgroundColor: '#ff9800'}}></div>
                        <span>Escalier</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MapViewer;
