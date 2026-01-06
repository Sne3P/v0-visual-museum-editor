import React from "react";

export default function ResumeArtWorkHeader({
  title,
  artist,
  date,
  movement,
  location
}) {
  return (
    <div className="resume-card-header">
      <h2 className="resume-card-title">{title}</h2>
      <p><i>Artiste :</i> {artist}</p>
      <p><i>Date :</i> {date}</p>
      <p><i>Mouvement :</i> {movement}</p>
      <p><i>Localisation actuelle :</i> {location}</p>
      <hr className="resume-card-divider" />
    </div>
  );
}
