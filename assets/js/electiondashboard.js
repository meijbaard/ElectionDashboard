// Wacht tot de volledige HTML-structuur is geladen voordat we beginnen.
document.addEventListener('DOMContentLoaded', function() {
    
    // Check of we op de juiste pagina zijn, om fouten op andere pagina's te voorkomen
    if (!document.getElementById('election-select')) {
        return;
    }
    
    // --- Globale Variabelen ---
    const ELECTION_DATA_URL = 'https://raw.githubusercontent.com/meijbaard/ElectionDashboard/main/totaal_stemuitslagen.csv';
    const GEOJSON_URL = 'https://raw.githubusercontent.com/meijbaard/LocalDashboard/main/baarn_buurten.geojson';
    const STEMBUREAU_DATA_URL = 'https://raw.githubusercontent.com/meijbaard/ElectionDashboard/main/stembureau.json';

    // Element-referenties
    const electionSelect = document.getElementById('election-select');
    const analysisElectionSelect = document.getElementById('analysis-election-select');
    const partySelect = document.getElementById('party-select');
    const partyFilterContainer = document.getElementById('party-filter-container');
    const mainFilterContainer = document.getElementById('main-filter-container');
    const analysisFilterContainer = document.getElementById('analysis-filter-container');
    
    // Data-opslag en state
    let electionData, geojsonData;
    let map = null;
    let geojsonLayer, info, overviewChart;
    let activeTab = 'kaart';
    let averageLocalVoteShare = 0;

    // Constanten
    const PURELY_LOCAL_PARTIES = ['VoorBaarn', 'Baarnse Onafhankelijke Partij (BOP)', 'LTS (Lijst Tinus Snyders)'];
    const NATIONAL_PARTIES_WITH_LOCAL_EQUIVALENT = ['VVD', 'D66', 'CDA', 'GroenLinks', 'PvdA', 'ChristenUnie', '50PLUS', 'ChristenUnie-SGP'];
    const partyColors = {
        'VVD': '#004D9F', 'D66': '#00B140', 'VoorBaarn': '#FDB913', 'CDA': '#008037',
        'GroenLinks': '#66CC00', 'PvdA': '#E30613', 'ChristenUnie': '#00AEEF',
        'ChristenUnie-SGP': '#00AEEF', '50PLUS': '#9B3C88', 'PVV (Partij voor de Vrijheid)': '#003366',
        'SP (Socialistische Partij)': '#EC0000', 'Forum voor Democratie': '#800000', 'Partij voor de Dieren': '#006633',
        'DENK': '#00C1D5', 'Nieuw Sociaal Contract': '#00788A', 'BBB': '#92C83E', 'Volt': '#5A2A84',
        'GROENLINKS / Partij van de Arbeid (PvdA)': '#DA127D', 'Baarnse Onafhankelijke Partij (BOP)': '#FF6600',
        'LTS (Lijst Tinus Snyders)': '#4B0082', 'Fictieve Lokale Partij': '#64748b', 'Default': '#94a3b8'
    };

    // --- HOOFDFUNCTIE: Start het Dashboard ---
    async function initializeDashboard() {
        try {
            const [csvText, geojson, stembureauData] = await Promise.all([
                fetch(ELECTION_DATA_URL).then(res => res.text()),
                fetch(GEOJSON_URL).then(res => res.json()),
                fetch(STEMBUREAU_DATA_URL).then(res => res.json())
            ]);

            electionData = convertCsvToElectionData(csvText, stembureauData);
            geojsonData = geojson;
            
            calculateAverageLocalVoteShare();
            populateElectionFilter();
            populateAnalysisFilter();
            
            setupTabs();
            addEventListeners();
            
            switchTab(activeTab);

        } catch (error) {
            console.error("Fout tijdens initialisatie:", error);
            document.querySelector(".container").innerHTML = `<div class="text-center p-8 text-red-600"><h1>Fout</h1><p>Kon de data niet laden. Controleer de console.</p><p><b>Details:</b> ${error}</p></div>`;
        }
    }

    function setupTabs() {
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => switchTab(button.dataset.tab));
        });
    }

    function switchTab(tabId) {
        activeTab = tabId;
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === tabId));

        const isAnalysisTab = tabId === 'analyse';
        const isMapOrOverviewTab = tabId === 'kaart' || tabId === 'overzicht';
        partyFilterContainer.classList.toggle('hidden', !isMapOrOverviewTab);
        mainFilterContainer.classList.toggle('hidden', isAnalysisTab);
        analysisFilterContainer.classList.toggle('hidden', !isAnalysisTab);

        updateDashboardContent();
    }

    function updateDashboardContent() {
        if (!electionData) return;
        
        switch (activeTab) {
            case 'kaart':
                if (!map) setupMap();
                updateMap();
                break;
            case 'overzicht':
                updateOverviewChart();
                break;
            case 'zetels':
                updateZetelverdeling();
                break;
            case 'analyse':
                updateAnalysisTab();
                break;
        }
        if (activeTab !== 'analyse') updatePartyFilter();
    }

    function setupMap() {
        const mapContainer = document.getElementById('kaart');
        mapContainer.innerHTML = `
            <div class="text-center mb-6">
                <h2 class="text-2xl font-semibold text-slate-900">Geografische Uitslagen</h2>
                <p class="text-slate-600 mt-1">Verken de stemresultaten per buurt.</p>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 bg-white p-4 rounded-lg shadow-md">
                    <div id="map-inner-container" style="height: 60vh; min-height: 400px; border-radius: 0.5rem;"></div>
                </div>
                <div id="info-panel" class="bg-white p-6 rounded-lg shadow-md">
                    <h3 id="info-title" class="text-xl font-semibold mb-4 text-slate-900">Selecteer een buurt</h3>
                    <div id="info-content" class="text-slate-700"><p>Klik op een buurt op de kaart voor details.</p></div>
                </div>
            </div>`;
        
        map = L.map('map-inner-container').setView([52.21, 5.29], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(map);

        info = L.control();
        info.onAdd = function (map) { this._div = L.DomUtil.create('div', 'p-2 bg-white bg-opacity-80 rounded-md shadow'); this.update(); return this._div; };
        info.update = function (props) { this._div.innerHTML = '<h4>Uitslag</h4>' + (props ? `<b>${props.buurtnaam}</b><br/>Winnaar: ${props.winner || 'N.v.t.'}` : 'Beweeg over een buurt'); };
        info.addTo(map);
    }
    
    function addEventListeners() {
        electionSelect.addEventListener('change', updateDashboardContent);
        analysisElectionSelect.addEventListener('change', updateDashboardContent);
        partySelect.addEventListener('change', updateDashboardContent);
    }
    
    function getColor(partyName) {
         if (!partyName) return partyColors['Default'];
         const matchedKey = Object.keys(partyColors).find(key => partyName.includes(key));
         return partyColors[matchedKey] || partyColors['Default'];
    }
    
    function hexToRgb(hex) {
         let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
         return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    }

    function rgbToHex(r, g, b) {
         return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    function getPercentageColor(baseColorHex, percentage) {
         const startColor = { r: 255, g: 255, b: 255 };
         const endColor = hexToRgb(baseColorHex);
         if (!endColor) return baseColorHex; 
         const p = Math.sqrt(Math.max(0, Math.min(1, percentage)));
         const r = Math.round(startColor.r + (endColor.r - startColor.r) * p);
         const g = Math.round(startColor.g + (endColor.g - startColor.g) * p);
         const b = Math.round(startColor.b + (endColor.b - startColor.b) * p);
         return rgbToHex(r, g, b);
    }

    function convertCsvToElectionData(csvText, stembureauData) {
         const lines = csvText.trim().split('\n');
         const header = lines[0].split(',').map(h => h.trim());
         const partyHeaders = header.slice(10); 
         const data = {};
         const zipToBuurtMap = {};
         stembureauData.forEach(s => {
             if (!zipToBuurtMap[s.postcode]) {
                 zipToBuurtMap[s.postcode] = new Set();
             }
             zipToBuurtMap[s.postcode].add(s.buurt);
         });
         
         const partyNameMapping = {
             'GROENLINKS': 'GroenLinks', 'Partij van de Arbeid (P.v.d.A.)': 'PvdA', 'Democraten 66 (D66)': 'D66'
         };
         for (let i = 1; i < lines.length; i++) {
             const values = lines[i].split(',');
             const row = header.reduce((obj, key, index) => {
                 obj[key] = values[index] ? values[index].trim() : '';
                 return obj;
             }, {});
             const zip = row.bureau_zip.replace(/\s/g, '');
             if (!zip) continue;
             if (!data[zip]) {
                 data[zip] = {
                     stembureaus: new Set(),
                     buurten: zipToBuurtMap[zip] ? Array.from(zipToBuurtMap[zip]) : [],
                     verkiezingen: []
                 };
             }
             data[zip].stembureaus.add(row.bureau_label);
             const electionParts = row.verkiezing.split('_');
             if (electionParts.length < 2) continue;
             const year = parseInt(electionParts[0]);
             const type = electionParts[1].toUpperCase();
             let election = data[zip].verkiezingen.find(v => v.jaar === year && v.type === type);
             if (!election) {
                 election = { jaar: year, type: type, resultaten: {} };
                 data[zip].verkiezingen.push(election);
             }
             partyHeaders.forEach(party => {
                 const votes = parseInt(row[party]);
                 if (votes > 0) {
                     const standardName = partyNameMapping[party] || party;
                     election.resultaten[standardName] = (election.resultaten[standardName] || 0) + votes;
                 }
             });
         }
         for (const zip in data) {
             data[zip].stembureaus = Array.from(data[zip].stembureaus);
         }
         return data;
    }

    function populateElectionFilter() {
         const uniqueElections = new Set();
         Object.values(electionData).forEach(loc => loc.verkiezingen.forEach(v => uniqueElections.add(`${v.type} ${v.jaar}`)));
         const sortedElections = Array.from(uniqueElections).sort((a, b) => {
             const [typeA, yearA] = a.split(' ');
             const [typeB, yearB] = b.split(' ');
             return yearB - yearA || typeA.localeCompare(typeB);
         });
         sortedElections.forEach(e => {
             const option = document.createElement('option');
             option.value = e;
             option.textContent = e;
             electionSelect.appendChild(option);
         });
    }

    function populateAnalysisFilter() {
         const grElections = new Set();
         Object.values(electionData).forEach(loc => loc.verkiezingen.forEach(v => {
             if (v.type === 'GR') grElections.add(`GR ${v.jaar}`);
         }));
         const sortedGrElections = Array.from(grElections).sort((a, b) => b.split(' ')[1] - a.split(' ')[1]);
         analysisElectionSelect.innerHTML = '';
         sortedGrElections.forEach(e => {
             const option = document.createElement('option');
             option.value = e;
             option.textContent = `Historische Analyse ${e}`;
             analysisElectionSelect.appendChild(option);
         });
         const predictionOption = document.createElement('option');
         predictionOption.value = 'GR 2026';
         predictionOption.textContent = 'Voorspelling GR 2026';
         analysisElectionSelect.appendChild(predictionOption);
    }
    
    function updatePartyFilter() {
         const selectedElection = electionSelect.value;
         const [type, year] = selectedElection.split(' ');
         const parties = new Set();
         Object.values(electionData).forEach(loc => {
             const election = loc.verkiezingen.find(v => v.type === type && v.jaar == year);
             if (election) Object.keys(election.resultaten).forEach(p => parties.add(p));
         });
         partySelect.innerHTML = '<option value="overall">Toon winnaar per buurt</option>';
         Array.from(parties).sort().forEach(p => {
             const option = document.createElement('option');
             option.value = p;
             option.textContent = p;
             partySelect.appendChild(option);
         });
    }
    
    function getResultsForSelection(electionString, groupBy = 'gemeente') {
         const [type, year] = electionString.split(' ');
         const results = {};
         if (groupBy === 'buurt') {
             geojsonData.features.forEach(f => {
                 results[f.properties.buurtnaam] = { total: 0, parties: {} };
             });
         } else {
             results['gemeente'] = { total: 0, parties: {} };
         }
         Object.values(electionData).forEach(location => {
             const election = location.verkiezingen.find(v => v.type === type && v.jaar == year);
             if (election) {
                 const keys = (groupBy === 'buurt') ? location.buurten : ['gemeente'];
                 keys.forEach(key => {
                     if (results[key]) {
                         Object.entries(election.resultaten).forEach(([party, votes]) => {
                             results[key].parties[party] = (results[key].parties[party] || 0) + votes;
                             results[key].total += votes;
                         });
                     }
                 });
             }
         });
         return (groupBy === 'buurt') ? results : results['gemeente'];
    }
    
    function updateMap() {
        if (!map) return;
        const results = getResultsForSelection(electionSelect.value, 'buurt');
        const selectedParty = partySelect.value;
        if (geojsonLayer) map.removeLayer(geojsonLayer);
        geojsonLayer = L.geoJson(geojsonData, {
            style: (feature) => {
                const buurtnaam = feature.properties.buurtnaam;
                const buurtResult = results[buurtnaam];
                let fillColor = '#FFFFFF', fillOpacity = 0.75;
                if (buurtResult && buurtResult.total > 0) {
                    if (selectedParty === 'overall') {
                        const winner = Object.keys(buurtResult.parties).reduce((a, b) => buurtResult.parties[a] > buurtResult.parties[b] ? a : b, null);
                        fillColor = winner ? getColor(winner) : partyColors.Default;
                    } else {
                        const partyVotes = buurtResult.parties[selectedParty] || 0;
                        const percentage = buurtResult.total > 0 ? (partyVotes / buurtResult.total) : 0;
                        fillColor = getPercentageColor(getColor(selectedParty), percentage);
                    }
                } else {
                    fillOpacity = 0.1;
                }
                return { fillColor, weight: 2, opacity: 1, color: 'white', dashArray: '3', fillOpacity };
            },
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: e => {
                        const layer = e.target;
                        layer.setStyle({ weight: 4, color: '#4f46e5', dashArray: '' });
                        if (!L.Browser.ie) layer.bringToFront();
                        const buurtResult = results[feature.properties.buurtnaam];
                        const winner = buurtResult && buurtResult.total > 0 ? Object.keys(buurtResult.parties).reduce((a, b) => buurtResult.parties[a] > buurtResult.parties[b] ? a : b) : 'Geen data';
                        info.update({buurtnaam: feature.properties.buurtnaam, winner: winner});
                    },
                    mouseout: e => { geojsonLayer.resetStyle(e.target); info.update(); },
                    click: e => { 
                        const infoPanel = document.getElementById('info-panel');
                        map.fitBounds(e.target.getBounds()); 
                        updateInfoPanel(feature.properties.buurtnaam, results[feature.properties.buurtnaam]); 
                    }
                });
            }
        }).addTo(map);
    }
    
    function updateInfoPanel(buurtnaam, results) {
        const infoTitle = document.getElementById('info-title');
        const infoContent = document.getElementById('info-content');
        if (!infoTitle || !infoContent) return;

         infoTitle.textContent = buurtnaam;
         if (!results || results.total === 0) {
             infoContent.innerHTML = '<p>Geen uitslagen beschikbaar voor deze buurt.</p>';
             return;
         }
         const sortedParties = Object.entries(results.parties).sort(([, a], [, b]) => b - a);
         let html = `<p class="font-semibold mb-2">Totaal stemmen: ${results.total}</p><ul class="space-y-2">`;
         sortedParties.forEach(([party, votes]) => {
             const percentage = ((votes / results.total) * 100).toFixed(1);
             const color = getColor(party);
             html += `<li><div class="flex items-center justify-between"><span class="text-sm">${party}</span><div class="flex items-center"><span class="text-sm font-medium mr-2">${percentage}%</span><span class="text-xs text-slate-500">(${votes})</span></div></div><div class="w-full bg-slate-200 rounded-full h-2"><div class="h-2 rounded-full" style="width: ${percentage}%; background-color: ${color};"></div></div></li>`;
         });
         infoContent.innerHTML = html + '</ul>';
    }
    
    function updateOverviewChart() {
        const container = document.getElementById('overzicht');
        container.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-md">
                <div class="text-center mb-6">
                    <h2 class="text-2xl font-semibold text-slate-900">Overzicht van de Uitslag</h2>
                    <p class="text-slate-600 mt-1">Hieronder ziet u de totale stemmenverdeling.</p>
                </div>
                <div class="chart-container" style="position: relative; width: 100%; max-width: 500px; height: 50vh; max-height: 450px; margin: auto;">
                    <canvas id="overview-chart-canvas"></canvas>
                </div>
            </div>`;

         const results = getResultsForSelection(electionSelect.value);
         const partyVotes = results.parties;
         const sortedParties = Object.entries(partyVotes).sort(([, a], [, b]) => b - a);
         const labels = sortedParties.map(p => p[0]);
         const data = sortedParties.map(p => p[1]);
         const backgroundColors = sortedParties.map(p => getColor(p[0]));
         const ctx = document.getElementById('overview-chart-canvas').getContext('2d');
         
         if (overviewChart) {
             overviewChart.destroy();
         }
         overviewChart = new Chart(ctx, {
             type: 'doughnut',
             data: {
                 labels: labels,
                 datasets: [{
                     label: 'Stemmen',
                     data: data,
                     backgroundColor: backgroundColors,
                     borderColor: '#f8fafc',
                     borderWidth: 2,
                     hoverOffset: 4
                 }]
             },
             options: {
                 responsive: true,
                 maintainAspectRatio: false,
                 plugins: {
                     legend: {
                         position: 'right',
                         labels: {
                             boxWidth: 20,
                             padding: 15,
                             font: {
                                 family: "'Inter', sans-serif"
                             }
                         }
                     },
                     tooltip: {
                         callbacks: {
                             label: function(context) {
                                 let label = context.label || '';
                                 if (label) { label += ': '; }
                                 if (context.parsed !== null) {
                                     const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                     const percentage = ((context.parsed / total) * 100).toFixed(1);
                                     label += `${context.raw} stemmen (${percentage}%)`;
                                 }
                                 return label;
                             }
                         }
                     }
                 }
             }
         });
    }

    function calculateAverageLocalVoteShare() {
         const localShares = [];
         const grYears = new Set();
         Object.values(electionData).forEach(loc => loc.verkiezingen.forEach(v => {
             if (v.type === 'GR') grYears.add(v.jaar);
         }));
         grYears.forEach(year => {
             let totalVotes = 0;
             let localVotes = 0;
             Object.values(electionData).forEach(loc => {
                 const election = loc.verkiezingen.find(v => v.type === 'GR' && v.jaar === year);
                 if (election) {
                     Object.entries(election.resultaten).forEach(([party, votes]) => {
                         totalVotes += votes;
                         if (PURELY_LOCAL_PARTIES.some(lp => party.includes(lp))) localVotes += votes;
                     });
                 }
             });
             if (totalVotes > 0) localShares.push(localVotes / totalVotes);
         });
         if (localShares.length > 0) averageLocalVoteShare = localShares.reduce((a, b) => a + b, 0) / localShares.length;
    }
    
    function calculateSeats(partyVotes, totalSeats) {
         const seats = {};
         Object.keys(partyVotes).forEach(p => { seats[p] = 0; });
         for (let i = 0; i < totalSeats; i++) {
             let maxQuotient = -1;
             let winningParty = null;
             for (const party in partyVotes) {
                 if (partyVotes[party] > 0) {
                     const quotient = partyVotes[party] / ((seats[party] || 0) + 1);
                     if (quotient > maxQuotient) {
                         maxQuotient = quotient;
                         winningParty = party;
                     }
                 }
             }
             if (winningParty) {
                 seats[winningParty]++;
             } else {
                 break;
             }
         }
         return seats;
    }

    function updateZetelverdeling() {
        const container = document.getElementById('zetels');
        if (!container) return;
         const selectedElection = electionSelect.value;
         const [type, year] = selectedElection.split(' ');
         const isGRElection = type === 'GR';
         const totalSeats = (year >= 2026) ? 21 : 19;
         let titleText = `Zetelverdeling Gemeenteraad ${year}`;
         let description = `Berekend met de D'Hondt-methode op basis van de officiële uitslag en ${totalSeats} zetels.`;
         const results = getResultsForSelection(selectedElection);
         let partyVotes = results.parties;
         const totalVotesInElection = results.total;
         if (!isGRElection && totalVotesInElection > 0) {
             titleText = `Voorspelling Zetelverdeling GR o.b.v. ${type} ${year}`;
             description = `Een voorspelling voor ${totalSeats} zetels, gebaseerd op de ${type}-verkiezing. Een 'Fictieve Lokale Partij' is toegevoegd op basis van het historisch gemiddelde aandeel lokale stemmen (${(averageLocalVoteShare * 100).toFixed(1)}%). De overige niet-lokale stemmen zijn proportioneel herverdeeld.`;
             const nationalEquivalentVotes = {};
             let nonLocalRestVotes = 0;
             let nationalEquivalentTotal = 0;
             Object.entries(partyVotes).forEach(([party, votes]) => {
                 const isNationalEquivalent = NATIONAL_PARTIES_WITH_LOCAL_EQUIVALENT.some(lp => party.includes(lp));
                 if (isNationalEquivalent) {
                     nationalEquivalentVotes[party] = votes;
                     nationalEquivalentTotal += votes;
                 } else {
                     nonLocalRestVotes += votes;
                 }
             });
             const fictionalLocalPartyVotes = Math.round(totalVotesInElection * averageLocalVoteShare);
             nonLocalRestVotes -= fictionalLocalPartyVotes;
             const adjustedVotes = { ...nationalEquivalentVotes };
             adjustedVotes['Fictieve Lokale Partij'] = fictionalLocalPartyVotes;
             if (nationalEquivalentTotal > 0 && nonLocalRestVotes > 0) {
                 for (const party in nationalEquivalentVotes) {
                     const proportion = nationalEquivalentVotes[party] / nationalEquivalentTotal;
                     adjustedVotes[party] += Math.round(proportion * nonLocalRestVotes);
                 }
             }
             partyVotes = adjustedVotes;
         }
         const totalVotesForCalc = Object.values(partyVotes).reduce((a, b) => a + b, 0);
         if (totalVotesForCalc === 0) {
             container.innerHTML = '<p>Geen data voor deze verkiezing.</p>';
             return;
         }
         let html = `<div class="bg-white p-6 rounded-lg shadow-md max-w-4xl mx-auto"><div class="text-center mb-6"><h2 class="text-2xl font-semibold text-slate-900">${titleText}</h2></div>`;
         html += `<p class="text-sm text-slate-600 mb-6 text-center max-w-2xl mx-auto">${description}</p>`;
         html += '<div class="space-y-4">';
         const seats = calculateSeats(partyVotes, totalSeats);
         const sortedSeats = Object.entries(seats).filter(([, s]) => s > 0).sort(([, a], [, b]) => b - a);
         sortedSeats.forEach(([party, numSeats]) => {
             const color = getColor(party);
             html += `<div class="grid grid-cols-4 gap-4 items-center"><span class="col-span-1 text-sm font-medium">${party}</span><div class="col-span-3 flex items-center"><div class="w-full bg-slate-200 rounded-full h-6"><div class="h-6 rounded-full text-white text-sm font-bold flex items-center justify-center" style="width: ${Math.max(8, (numSeats / totalSeats) * 100)}%; background-color: ${color};"><span>${numSeats}</span></div></div></div></div>`;
         });
         html += '</div></div>';
         container.innerHTML = html;
    }

    function updateAnalysisTab() {
         const selectedScenario = analysisElectionSelect.value;
         if (selectedScenario === 'GR 2026') renderPrediction2026();
         else renderHistoricalAnalysis(selectedScenario);
    }
    
    function renderHistoricalAnalysis(electionString) {
        const container = document.getElementById('analyse');
         const [type, year] = electionString.split(' ');
         let html = `<div class="bg-white p-6 rounded-lg shadow-md"><div class="text-center mb-6"><h2 class="text-2xl font-semibold text-slate-900">Analyse Samenwerking GroenLinks / PvdA (GR ${year})</h2></div>`;
         const totalSeats = 19;
         const results = getResultsForSelection(electionString);
         const originalVotes = results.parties;
         if (results.total === 0) {
             container.innerHTML += '<p>Geen data voor deze verkiezing.</p></div>'; return;
         }
         const seatsApart = calculateSeats(originalVotes, totalSeats);
         const glSeatsApart = seatsApart['GroenLinks'] || 0;
         const pvdaSeatsApart = seatsApart['PvdA'] || 0;
         const totalApart = glSeatsApart + pvdaSeatsApart;
         const combinedVotes = { ...originalVotes };
         const glVotesToCombine = combinedVotes['GroenLinks'] || 0;
         const pvdaVotesToCombine = combinedVotes['PvdA'] || 0;
         delete combinedVotes['GroenLinks'];
         delete combinedVotes['PvdA'];
         combinedVotes['GROENLINKS / Partij van de Arbeid (PvdA)'] = glVotesToCombine + pvdaVotesToCombine;
         const seatsCombined = calculateSeats(combinedVotes, totalSeats);
         const totalCombined = seatsCombined['GROENLINKS / Partij van de Arbeid (PvdA)'] || 0;
         html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-8">';
         html += '<div><h3 class="font-semibold text-lg mb-2">Scenario A: Aparte Lijsten</h3><p class="text-sm text-slate-600 mb-4">De daadwerkelijke zetelverdeling.</p><table class="w-full text-sm text-left"><tbody>';
         Object.entries(seatsApart).filter(([,s])=>s>0).sort(([,a],[,b])=>b-a).forEach(([p,s]) => { html += `<tr class="border-b"><th class="py-2 px-4 font-medium">${p}</th><td class="py-2 px-4">${s} zetel(s)</td></tr>`; });
         html += '</tbody></table></div>';
         html += '<div><h3 class="font-semibold text-lg mb-2">Scenario B: Gezamenlijke Lijst</h3><p class="text-sm text-slate-600 mb-4">Een simulatie.</p><table class="w-full text-sm text-left"><tbody>';
         Object.entries(seatsCombined).filter(([,s])=>s>0).sort(([,a],[,b])=>b-a).forEach(([p,s]) => { html += `<tr class="border-b"><th class="py-2 px-4 font-medium">${p}</th><td class="py-2 px-4">${s} zetel(s)</td></tr>`; });
         html += '</tbody></table></div></div>';
         let conclusionText = '';
         let effectClass = 'text-slate-800';
         const difference = totalCombined - totalApart;
         if (difference > 0) { conclusionText = `Winst: ${difference} zetel(s).`; effectClass = 'text-green-600'; }
         else if (difference < 0) { conclusionText = `Verlies: ${Math.abs(difference)} zetel(s).`; effectClass = 'text-red-600'; }
         else { conclusionText = 'Geen verschil in zetels.'; }
         html += `<div class="mt-8 pt-6 border-t text-center"><h3 class="font-semibold text-lg mb-2">Conclusie</h3><p class="mt-4 text-lg font-semibold ${effectClass}">${conclusionText}</p></div>`;
         container.innerHTML = html + '</div>';
    }

    function renderPrediction2026() {
        const container = document.getElementById('analyse');
        let html = `<div class="bg-white p-6 rounded-lg shadow-md"><div class="text-center mb-6"><h2 class="text-2xl font-semibold text-slate-900">Voorspelling Zetelverdeling GR 2026 (21 zetels)</h2></div>`;
         const tk2017Results = getResultsForSelection('TK 2017');
         const tk2023Results = getResultsForSelection('TK 2023');
         const tk2017_gl = tk2017Results.parties['GroenLinks'] || 0;
         const tk2017_pvda = tk2017Results.parties['PvdA'] || 0;
         const tk2017_total = tk2017_gl + tk2017_pvda;
         const tk2023_combined = tk2023Results.parties['GROENLINKS / Partij van de Arbeid (PvdA)'] || 0;
         const synergyFactor = tk2017_total > 0 ? tk2023_combined / tk2017_total : 1;
         const gr2022Results = getResultsForSelection('GR 2022');
         const gr2022Votes = gr2022Results.parties;
         const predictedVotes = {};
         const glVotes = gr2022Votes['GroenLinks'] || 0;
         const pvdaVotes = gr2022Votes['PvdA'] || 0;
         Object.entries(gr2022Votes).forEach(([party, votes]) => {
             if (party !== 'GroenLinks' && party !== 'PvdA') predictedVotes[party] = votes;
         });
         predictedVotes['GROENLINKS / Partij van de Arbeid (PvdA)'] = Math.round((glVotes + pvdaVotes) * synergyFactor);
         const totalSeats = 21;
         const predictedSeats = calculateSeats(predictedVotes, totalSeats);
         const sortedSeats = Object.entries(predictedSeats).filter(([, s]) => s > 0).sort(([, a], [, b]) => b - a);
         html += `<div class="mb-6 p-4 bg-indigo-50 border rounded-lg max-w-3xl mx-auto">
             <h3 class="font-semibold text-lg mb-2 text-indigo-900">Voorspellingsmethode</h3>
             <p class="text-sm text-indigo-800">Deze voorspelling gebruikt de GR2022 uitslag als basis... (en de rest van je uitleg)</p>
             <p class="text-sm mt-2 font-medium text-indigo-900">Synergie-effect: <b>${synergyFactor.toFixed(2)}</b></p>
         </div>`;
         html += '<div class="max-w-2xl mx-auto"><h3 class="font-semibold text-lg mb-4 text-center">Voorspelde Zetelverdeling</h3>';
         html += '<table class="w-full text-sm text-left"><tbody>';
         sortedSeats.forEach(([p,s]) => {
             html += `<tr class="border-b"><th class="py-2 px-4 font-medium">${p}</th><td class="py-2 px-4">${s} zetel(s)</td></tr>`;
         });
         html += '</tbody></table></div>';
         container.innerHTML = html + '</div>';
    }

    // Start het hele proces
    initializeDashboard();
});
