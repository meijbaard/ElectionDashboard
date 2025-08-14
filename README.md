# Verkiezingsdashboard Gemeente Baarn

Dit project bevat een interactief dashboard voor het analyseren van verkiezingsuitslagen in de gemeente Baarn. Het dashboard visualiseert de uitslagen per buurt op een kaart, berekent de mogelijke zetelverdelingen en biedt analyses over de samenwerking tussen politieke partijen.

_[Bekijk hier het live dashboard](https://www.markeijbaard.nl/electiondashboard/)_

---
## 📊 Functionaliteiten

Het dashboard bestaat uit drie hoofdonderdelen:

* **Interactieve Kaart**:
    * Toont de winnende partij per buurt voor een geselecteerde verkiezing.
    * Biedt de mogelijkheid om de stempercentages van een specifieke partij per buurt te visualiseren.
    * Door op een buurt te klikken, verschijnen gedetailleerde uitslagen voor die buurt.

* **Zetelverdeling**:
    * Berekent de zetelverdeling voor de gemeenteraadsverkiezingen op basis van de officiële uitslagen.
    * Genereert een voorspelling voor de gemeenteraadszetels op basis van de uitslagen van landelijke of provinciale verkiezingen.

* **Analyse GL/PvdA**:
    * Analyseert het effect van een samenwerking tussen GroenLinks en de PvdA op de zetelverdeling in historische gemeenteraadsverkiezingen.
    * Biedt een voorspelling voor de gecombineerde lijst voor de gemeenteraadsverkiezingen van 2026, gebaseerd op een synergie-effect dat is afgeleid uit landelijke verkiezingen.

---
## ⚙️ Technische Opzet

Het dashboard is gebouwd als een enkele HTML-pagina (`election_dashboard.md`) en maakt gebruik van de volgende technologieën:

* **Tailwind CSS**: Voor een moderne en responsieve opmaak.
* **Leaflet.js**: Voor de interactieve kaartvisualisaties.
* **JavaScript**: Voor het ophalen en verwerken van de verkiezingsdata en het dynamisch maken van de pagina.

De verkiezingsuitslagen worden ingeladen vanuit een CSV-bestand, terwijl de geografische data voor de buurten wordt ingeladen uit een GeoJSON-bestand.

---
## 🗂️ Data

Het project maakt gebruik van de volgende databronnen:

* **`totaal_stemuitslagen.csv`**: Een CSV-bestand met de gedetailleerde stemuitslagen per stembureau voor verschillende verkiezingen (gemeenteraad, Provinciale Staten en Tweede Kamer).
* **`baarn_buurten.geojson`**: Een GeoJSON-bestand met de geografische grenzen van de buurten in Baarn.
* **`stembureau.json`**: Een JSON-bestand dat stembureaus koppelt aan postcodes en buurten.
