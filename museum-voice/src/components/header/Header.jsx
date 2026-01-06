import React from "react";
import "./Header.css";

export default function Header({ title = "Museum Voice" }) {
    return (
        <header 
            className="header" 
            role="banner" 
            aria-label="Site header"
        >
            <h1 className="header-title">{title}</h1>
        </header>
    );
}