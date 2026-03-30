// ─── ElectionDashboard ────────────────────────────────────────────────────────
// Auteur: Mark Eijbaard
// Beschrijving: Verkiezingsdashboard voor Baarn met historische trend,
//               heatmap (absoluut + relatief), en partijvergelijking.

document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('election-select')) return;

    // ─── Data-URL's ───────────────────────────────────────────────────────────
    const ELECTION_DATA_URL   = 'https://raw.githubusercontent.com/meijbaard/ElectionDashboard/main/totaal_stemuitslagen.csv';
    const GEOJSON_URL         = 'https://raw.githubusercontent.com/meijbaard/LocalDashboard/main/baarn_buurten.geojson';
    const STEMBUREAU_DATA_URL = 'https://raw.githubusercontent.com/meijbaard/ElectionDashboard/main/stembureau.json';

    // ─── Partij-alias mapping ─────────────────────────────────────────────────
    // Canonieke naam: linkerkant. Alle varianten worden hiernaar genormaliseerd.
    // Voeg hier toekomstige namen toe (bv. Progressief Nederland).
    const PARTY_ALIASES = {
        // CDA
        'Christen Democratisch Appèl (CDA)': 'CDA',
        'Christen-Democratisch Appèl (CDA)': 'CDA',
        // D66
        'Democraten 66 (D66)': 'D66',
        // PvdA
        'Partij van de Arbeid (P.v.d.A.)': 'PvdA',
        // GroenLinks
        'GROENLINKS': 'GroenLinks',
        // SP
        'SP (Socialistische Partij)': 'SP',
        // PVV
        'PVV (Partij voor de Vrijheid)': 'PVV',
        // SGP
        'Staatkundig Gereformeerde Partij (SGP)': 'SGP',
        // PvdD
        'Partij voor de Dieren': 'PvdD',
        // FvD
        'Forum voor Democratie': 'FvD',
        // NSC
        'Nieuw Sociaal Contract': 'NSC',
        // BVNL (diverse schrijfwijzen)
        'BVNL / Groep Van Haga': 'BVNL',
        'Belang van Nederland (BVNL)': 'BVNL',
        'Belang Van Nederland (BVNL)': 'BVNL',
        // NSC (met en zonder afkorting)
        'Nieuw Sociaal Contract (NSC)': 'NSC',
        // BOP (lokaal Baarn)
        'Baarnse Onafhankelijke Partij': 'BOP',
        'Baarnse Onafhankelijke Partij (BOP)': 'BOP',
        // LTS (lokaal Baarn)
        'LTS (Lijst Tinus Snyders)': 'LTS',
        'L T S (Lijst Tinus Snyders)': 'LTS',
        // ChristenUnie-SGP (combinatielijst GR2014/2018) → ChristenUnie
        'ChristenUnie-SGP': 'ChristenUnie',
        // GL/PvdA samengevoegd + toekomstige opvolgers
        'GROENLINKS / Partij van de Arbeid (PvdA)': 'GroenLinks-PvdA',
        'GroenLinks / Partij van de Arbeid (PvdA)': 'GroenLinks-PvdA',
        'Progressief Nederland': 'GroenLinks-PvdA',
        'PRO': 'GroenLinks-PvdA',
        // 50PLUS
        '50PLUS': '50PLUS',
        // Historische TK-partijen (klein maar aanwezig in data)
        'Trots op Nederland (TROTS)': 'TROTS',
        'TROTS OP NEDERLAND LIJST RITA VERDONK': 'TROTS',
        'Partij voor de Toekomst (PvdT)': 'PvdT',
        'Liberaal Democratische Partij (LibDem)': 'LibDem',
        'Partij éen': 'Partij één',
        'Partij één': 'Partij één',
    };

    // ─── Partijkleuren ────────────────────────────────────────────────────────
    const PARTY_COLORS = {
        'VVD': '#004D9F',
        'D66': '#00B140',
        'VoorBaarn': '#FDB913',
        'CDA': '#49A942',
        'GroenLinks': '#66CC00',
        'PvdA': '#E30613',
        'GroenLinks-PvdA': '#DA127D',
        'ChristenUnie': '#00AEEF',
        'ChristenUnie-SGP': '#00AEEF',
        '50PLUS': '#9B3C88',
        'PVV': '#003366',
        'SP': '#EC0000',
        'FvD': '#800000',
        'PvdD': '#006633',
        'DENK': '#00C1D5',
        'NSC': '#00788A',
        'BBB': '#92C83E',
        'Volt': '#5A2A84',
        'BOP': '#FF6600',
        'LTS': '#4B0082',
        'SGP': '#F47920',
        'BVNL': '#00468B',
        'JA21': '#1C3F6E',
        'Splinter': '#E76F51',
        'TROTS': '#C8102E',
        'Fictieve Lokale Partij': '#64748b',
        'Default': '#94a3b8',
    };

    // Partijen die ALLEEN in GR-context lokaal zijn
    const PURELY_LOCAL_PARTIES = ['VoorBaarn', 'BOP', 'LTS'];
    const NATIONAL_PARTIES_WITH_LOCAL_EQUIVALENT = [
        'VVD', 'D66', 'CDA', 'GroenLinks', 'PvdA', 'ChristenUnie',
        '50PLUS', 'ChristenUnie-SGP', 'GroenLinks-PvdA'
    ];

    // ─── DOM-referenties ──────────────────────────────────────────────────────
    const electionSelect         = document.getElementById('election-select');
    const analysisElectionSelect = document.getElementById('analysis-election-select');
    const partySelect            = document.getElementById('party-select');
    const partyFilterContainer   = document.getElementById('party-filter-container');
    const mainFilterContainer    = document.getElementById('main-filter-container');
    const analysisFilterContainer= document.getElementById('analysis-filter-container');

    // ─── State ────────────────────────────────────────────────────────────────
    let electionData, geojsonData;
    let map = null, geojsonLayer = null, info = null;
    let overviewChart = null, historicalChart = null;
    let activeTab = 'overzicht';
    let mapMode = 'winner';          // 'winner' | 'absolute' | 'relative'
    let averageLocalVoteShare = 0;

    // ─── Normalisatie ─────────────────────────────────────────────────────────
    function normalizeParty(name) {
        return PARTY_ALIASES[name] || name;
    }

    function getColor(partyName) {
        if (!partyName) return PARTY_COLORS['Default'];
        if (PARTY_COLORS[partyName]) return PARTY_COLORS[partyName];
        const key = Object.keys(PARTY_COLORS).find(k => partyName.includes(k));
        return key ? PARTY_COLORS[key] : PARTY_COLORS['Default'];
    }

    // ─── CSV → data ───────────────────────────────────────────────────────────
    function convertCsvToElectionData(csvText, stembureauData) {
        const lines = csvText.trim().split('\n');
        const header = lines[0].split(',').map(h => h.trim());
        const partyHeaders = header.slice(10);
        const data = {};

        const zipToBuurtMap = {};
        stembureauData.forEach(s => {
            const pc = s.postcode.replace(/\s/g, '');
            if (!zipToBuurtMap[pc]) zipToBuurtMap[pc] = new Set();
            zipToBuurtMap[pc].add(s.buurt);
        });

        for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            if (values.length < 10) continue;
            const row = {};
            header.forEach((key, idx) => { row[key] = values[idx] ? values[idx].trim() : ''; });

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

            const parts = row.verkiezing.split('_');
            if (parts.length < 2) continue;
            const year = parseInt(parts[0]);
            const type = parts[1].toUpperCase();

            let election = data[zip].verkiezingen.find(v => v.jaar === year && v.type === type);
            if (!election) {
                election = { jaar: year, type: type, resultaten: {} };
                data[zip].verkiezingen.push(election);
            }

            partyHeaders.forEach(rawParty => {
                const votes = parseInt(row[rawParty]);
                if (votes > 0) {
                    const party = normalizeParty(rawParty);
                    election.resultaten[party] = (election.resultaten[party] || 0) + votes;
                }
            });
        }

        for (const zip in data) {
            data[zip].stembureaus = Array.from(data[zip].stembureaus);
        }
        return data;
    }

    // CSV-parser die quoted velden correct afhandelt
    function parseCsvLine(line) {
        const result = [];
        let cur = '', inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
                else inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                result.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        result.push(cur);
        return result;
    }

    // ─── Kleurhulpfuncties ────────────────────────────────────────────────────
    function hexToRgb(hex) {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
    }
    function rgbToHex(r,g,b) {
        return '#' + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1).toUpperCase();
    }
    function lerpColor(hexA, hexB, t) {
        const a = hexToRgb(hexA), b = hexToRgb(hexB);
        if (!a || !b) return hexB;
        return rgbToHex(
            Math.round(a.r + (b.r - a.r) * t),
            Math.round(a.g + (b.g - a.g) * t),
            Math.round(a.b + (b.b - a.b) * t)
        );
    }
    // Wit → partijkleur op basis van percentage (0–1)
    function getAbsoluteColor(partyHex, pct) {
        return lerpColor('#ffffff', partyHex, Math.sqrt(Math.max(0, Math.min(1, pct))));
    }
    // Rood → grijs → groen op basis van delta t.o.v. gemeentegemiddelde
    function getRelativeColor(partyHex, delta) {
        // delta: positief = boven gemiddelde, negatief = onder gemiddelde
        // Schaal: [-0.15, +0.15] mapped naar [rood, wit, partijkleur]
        const norm = Math.max(-1, Math.min(1, delta / 0.15));
        if (norm >= 0) return lerpColor('#e5e7eb', partyHex, norm); // grijs → partijkleur
        return lerpColor('#e5e7eb', '#ef4444', -norm);               // grijs → rood
    }
    function getDeltaColor(delta) {
        if (delta >  0.5) return '#16a34a';
        if (delta >  0)   return '#4ade80';
        if (delta < -0.5) return '#dc2626';
        if (delta <  0)   return '#f87171';
        return '#94a3b8';
    }

    // ─── Data-aggregatie ──────────────────────────────────────────────────────
    // groupBy: 'gemeente' | 'buurt'
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

        Object.values(electionData).forEach(loc => {
            const election = loc.verkiezingen.find(v => v.type === type && v.jaar == year);
            if (!election) return;
            const keys = groupBy === 'buurt' ? loc.buurten : ['gemeente'];
            keys.forEach(key => {
                if (!results[key]) return;
                Object.entries(election.resultaten).forEach(([party, votes]) => {
                    results[key].parties[party] = (results[key].parties[party] || 0) + votes;
                    results[key].total += votes;
                });
            });
        });

        return groupBy === 'buurt' ? results : results['gemeente'];
    }

    // Geeft alle beschikbare verkiezingen gesorteerd (nieuwste eerst)
    function getAllElections() {
        const set = new Set();
        Object.values(electionData).forEach(loc =>
            loc.verkiezingen.forEach(v => set.add(`${v.type} ${v.jaar}`))
        );
        return Array.from(set).sort((a, b) => {
            const [, yA] = a.split(' '), [, yB] = b.split(' ');
            return yB - yA || a.localeCompare(b);
        });
    }

    // Vorige verkiezing van hetzelfde type (voor vergelijking)
    function getPreviousSameType(type, year) {
        const years = new Set();
        Object.values(electionData).forEach(loc =>
            loc.verkiezingen.forEach(v => { if (v.type === type) years.add(v.jaar); })
        );
        const sorted = Array.from(years).sort((a, b) => b - a);
        const idx = sorted.indexOf(parseInt(year));
        return idx >= 0 && idx < sorted.length - 1 ? `${type} ${sorted[idx + 1]}` : null;
    }

    // Vorige verkiezing van een willekeurig type (chronologisch dichtst voor)
    function getPreviousAnyType(type, year) {
        const all = getAllElections();
        const current = `${type} ${year}`;
        const idx = all.indexOf(current);
        return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
    }

    // ─── Filter-invulling ─────────────────────────────────────────────────────
    function populateElectionFilter() {
        const elections = getAllElections();
        elections.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e; opt.textContent = e;
            electionSelect.appendChild(opt);
        });
    }

    function populateAnalysisFilter() {
        const grYears = new Set();
        Object.values(electionData).forEach(loc =>
            loc.verkiezingen.forEach(v => { if (v.type === 'GR') grYears.add(v.jaar); })
        );
        const sorted = Array.from(grYears).sort((a, b) => b - a);
        analysisElectionSelect.innerHTML = '';
        sorted.forEach(y => {
            const opt = document.createElement('option');
            opt.value = `GR ${y}`;
            opt.textContent = `Historische Analyse GR ${y}`;
            analysisElectionSelect.appendChild(opt);
        });
        const pred = document.createElement('option');
        pred.value = 'GR 2026'; pred.textContent = 'Voorspelling GR 2026';
        analysisElectionSelect.appendChild(pred);
    }

    function updatePartyFilter() {
        const [type, year] = electionSelect.value.split(' ');
        const parties = new Set();
        Object.values(electionData).forEach(loc => {
            const el = loc.verkiezingen.find(v => v.type === type && v.jaar == year);
            if (el) Object.keys(el.resultaten).forEach(p => parties.add(p));
        });
        partySelect.innerHTML = '<option value="overall">Toon alle partijen</option>';
        Array.from(parties).sort().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p; opt.textContent = p;
            partySelect.appendChild(opt);
        });
    }

    // ─── Tab-beheer ───────────────────────────────────────────────────────────
    function setupTabs() {
        document.querySelectorAll('.tab-button').forEach(btn =>
            btn.addEventListener('click', () => switchTab(btn.dataset.tab))
        );
    }

    function switchTab(tabId) {
        activeTab = tabId;
        document.querySelectorAll('.tab-button').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === tabId)
        );
        document.querySelectorAll('.tab-content').forEach(c =>
            c.classList.toggle('active', c.id === tabId)
        );

        const isAnalysis  = tabId === 'analyse';
        const isHistorical= tabId === 'historisch';
        const showParty   = tabId === 'kaart' || tabId === 'overzicht';

        partyFilterContainer.classList.toggle('hidden', !showParty);
        mainFilterContainer.classList.toggle('hidden', isAnalysis || isHistorical);
        analysisFilterContainer.classList.toggle('hidden', !isAnalysis);

        updateDashboardContent();
    }

    function addEventListeners() {
        electionSelect.addEventListener('change', updateDashboardContent);
        analysisElectionSelect.addEventListener('change', updateDashboardContent);
        partySelect.addEventListener('change', updateDashboardContent);
        document.getElementById('resetFiltersBtn').addEventListener('click', () => {
            electionSelect.selectedIndex = 0;
            partySelect.value = 'overall';
            updateDashboardContent();
        });
    }

    function updateDashboardContent() {
        if (!electionData) return;
        switch (activeTab) {
            case 'kaart':
                if (!map) setupMap();
                updatePartyFilter();
                updateMap();
                break;
            case 'overzicht':
                updatePartyFilter();
                updateOverviewTab();
                break;
            case 'zetels':
                updateZetelverdeling();
                break;
            case 'analyse':
                updateAnalysisTab();
                break;
            case 'historisch':
                updateHistoricalTab();
                break;
        }
    }

    // ─── TAB: KAART ───────────────────────────────────────────────────────────
    function setupMap() {
        const container = document.getElementById('kaart');
        container.innerHTML = `
            <div class="bg-white rounded-lg shadow p-4 mb-4">
              <div class="flex flex-wrap gap-4 items-end">
                <div>
                  <span class="block text-sm font-medium text-slate-700 mb-1">Weergave</span>
                  <div class="flex gap-2" id="map-mode-btns">
                    <button data-mode="winner"   class="map-mode-btn px-3 py-1.5 text-sm rounded border border-slate-300 bg-indigo-600 text-white">Winnaar</button>
                    <button data-mode="absolute" class="map-mode-btn px-3 py-1.5 text-sm rounded border border-slate-300 bg-white text-slate-700">Absoluut %</button>
                    <button data-mode="relative" class="map-mode-btn px-3 py-1.5 text-sm rounded border border-slate-300 bg-white text-slate-700">Relatief t.o.v. gem.</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 bg-white p-4 rounded-lg shadow">
                <div id="map-inner-container" style="height:60vh;min-height:400px;border-radius:0.5rem;"></div>
              </div>
              <div id="info-panel" class="bg-white p-6 rounded-lg shadow">
                <h3 id="info-title" class="text-xl font-semibold mb-4 text-slate-900">Selecteer een buurt</h3>
                <div id="info-content" class="text-slate-700"><p>Klik op een buurt op de kaart voor details.</p></div>
              </div>
            </div>`;

        map = L.map('map-inner-container').setView([52.21, 5.29], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(map);

        info = L.control();
        info.onAdd = function () {
            this._div = L.DomUtil.create('div', 'p-2 bg-white bg-opacity-90 rounded shadow text-sm');
            this.update();
            return this._div;
        };
        info.update = function (props) {
            this._div.innerHTML = props
                ? `<b>${props.naam}</b><br/>${props.sub}`
                : 'Beweeg over een buurt';
        };
        info.addTo(map);

        // Mode-knoppen
        document.getElementById('map-mode-btns').addEventListener('click', e => {
            const btn = e.target.closest('[data-mode]');
            if (!btn) return;
            mapMode = btn.dataset.mode;
            document.querySelectorAll('.map-mode-btn').forEach(b => {
                b.classList.toggle('bg-indigo-600', b === btn);
                b.classList.toggle('text-white', b === btn);
                b.classList.toggle('bg-white', b !== btn);
                b.classList.toggle('text-slate-700', b !== btn);
            });
            updateMap();
        });
    }

    function updateMap() {
        if (!map) return;
        const [type, year] = electionSelect.value.split(' ');
        const buurtResults  = getResultsForSelection(electionSelect.value, 'buurt');
        const gemeenteResult= getResultsForSelection(electionSelect.value, 'gemeente');
        const selectedParty = partySelect.value;
        const effectiveMode = (selectedParty === 'overall') ? 'winner' : mapMode;

        if (geojsonLayer) map.removeLayer(geojsonLayer);

        geojsonLayer = L.geoJson(geojsonData, {
            style: feature => styleFeature(feature, buurtResults, gemeenteResult, selectedParty, effectiveMode),
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: e => {
                        e.target.setStyle({ weight: 4, color: '#4f46e5', dashArray: '' });
                        if (!L.Browser.ie) e.target.bringToFront();
                        const br = buurtResults[feature.properties.buurtnaam];
                        const sub = getMapTooltip(br, selectedParty, effectiveMode, gemeenteResult);
                        info.update({ naam: feature.properties.buurtnaam, sub });
                    },
                    mouseout: e => { geojsonLayer.resetStyle(e.target); info.update(); },
                    click: e => {
                        map.fitBounds(e.target.getBounds());
                        updateInfoPanel(feature.properties.buurtnaam, buurtResults[feature.properties.buurtnaam], gemeenteResult);
                    }
                });
            }
        }).addTo(map);
    }

    function styleFeature(feature, buurtResults, gemeenteResult, selectedParty, mode) {
        const buurtnaam  = feature.properties.buurtnaam;
        const br         = buurtResults[buurtnaam];
        let fillColor    = '#FFFFFF';
        let fillOpacity  = 0.75;

        if (!br || br.total === 0) {
            fillOpacity = 0.1;
        } else if (mode === 'winner') {
            const winner = Object.entries(br.parties).sort((a, b) => b[1] - a[1])[0];
            fillColor = winner ? getColor(winner[0]) : PARTY_COLORS['Default'];
        } else if (mode === 'absolute') {
            const partyVotes = br.parties[selectedParty] || 0;
            const pct = br.total > 0 ? partyVotes / br.total : 0;
            fillColor = getAbsoluteColor(getColor(selectedParty), pct);
        } else if (mode === 'relative') {
            const localPct   = br.total > 0 ? (br.parties[selectedParty] || 0) / br.total : 0;
            const gemPct     = gemeenteResult.total > 0 ? (gemeenteResult.parties[selectedParty] || 0) / gemeenteResult.total : 0;
            fillColor = getRelativeColor(getColor(selectedParty), localPct - gemPct);
        }

        return { fillColor, weight: 2, opacity: 1, color: 'white', dashArray: '3', fillOpacity };
    }

    function getMapTooltip(br, selectedParty, mode, gemeenteResult) {
        if (!br || br.total === 0) return 'Geen data';
        if (mode === 'winner') {
            const winner = Object.entries(br.parties).sort((a, b) => b[1] - a[1])[0];
            return winner ? `Winnaar: ${winner[0]} (${((winner[1]/br.total)*100).toFixed(1)}%)` : 'Geen data';
        }
        if (mode === 'absolute') {
            const pct = br.total > 0 ? ((br.parties[selectedParty] || 0) / br.total * 100).toFixed(1) : '0';
            return `${selectedParty}: ${pct}%`;
        }
        if (mode === 'relative') {
            const local = br.total > 0 ? (br.parties[selectedParty] || 0) / br.total * 100 : 0;
            const gem   = gemeenteResult.total > 0 ? (gemeenteResult.parties[selectedParty] || 0) / gemeenteResult.total * 100 : 0;
            const delta = (local - gem).toFixed(1);
            const sign  = delta > 0 ? '+' : '';
            return `${selectedParty}: ${local.toFixed(1)}% (${sign}${delta}% t.o.v. gem.)`;
        }
        return '';
    }

    function updateInfoPanel(buurtnaam, br, gemeenteResult) {
        const title   = document.getElementById('info-title');
        const content = document.getElementById('info-content');
        if (!title || !content) return;
        title.textContent = buurtnaam;

        if (!br || br.total === 0) {
            content.innerHTML = '<p>Geen uitslagen beschikbaar voor deze buurt.</p>';
            return;
        }

        const sorted = Object.entries(br.parties).sort((a, b) => b[1] - a[1]);
        let html = `<p class="font-semibold mb-2 text-sm text-slate-500">Totaal: ${br.total.toLocaleString('nl-NL')} stemmen</p><ul class="space-y-2">`;
        sorted.forEach(([party, votes]) => {
            const pct    = (votes / br.total * 100).toFixed(1);
            const gemPct = gemeenteResult.total > 0
                ? (gemeenteResult.parties[party] || 0) / gemeenteResult.total * 100 : 0;
            const delta  = (parseFloat(pct) - gemPct).toFixed(1);
            const dSign  = delta > 0 ? '+' : '';
            const color  = getColor(party);
            html += `<li>
              <div class="flex items-center justify-between text-sm">
                <span class="truncate max-w-[140px]" title="${party}">${party}</span>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="font-medium">${pct}%</span>
                  <span class="text-xs ${parseFloat(delta) >= 0 ? 'text-green-600' : 'text-red-500'}">${dSign}${delta}</span>
                </div>
              </div>
              <div class="w-full bg-slate-100 rounded h-2 mt-1">
                <div class="h-2 rounded" style="width:${Math.max(2,pct)}%;background:${color}"></div>
              </div></li>`;
        });
        content.innerHTML = html + '</ul>';
    }

    // ─── TAB: OVERZICHT ───────────────────────────────────────────────────────
    function updateOverviewTab() {
        const container = document.getElementById('overzicht');
        const selectedParty = partySelect.value;
        const [type, year] = electionSelect.value.split(' ');
        const current = getResultsForSelection(electionSelect.value);
        const prevSame = getPreviousSameType(type, year);
        const prevAny  = getPreviousAnyType(type, year);
        const prevSameData = prevSame ? getResultsForSelection(prevSame) : null;
        const prevAnyData  = prevAny  ? getResultsForSelection(prevAny)  : null;

        // Bouw de HTML
        let html = `<div class="bg-white p-6 rounded-lg shadow">
          <div class="text-center mb-6">
            <h2 class="text-2xl font-semibold">${type} ${year} — Overzicht</h2>
          </div>`;

        if (selectedParty !== 'overall') {
            // Enkel partijweergave: toon buurtresultaten voor die partij
            html += buildSinglePartyOverview(selectedParty, current, prevSameData, prevAnyData, prevSame, prevAny);
        } else {
            // Alle partijen met vergelijking
            html += buildAllPartiesOverview(current, prevSameData, prevAnyData, prevSame, prevAny);
        }

        html += '</div>';
        container.innerHTML = html;

        // Bind donut chart als alle partijen getoond
        if (selectedParty === 'overall') {
            renderOverviewDonut(current);
        }
    }

    function buildAllPartiesOverview(current, prevSameData, prevAnyData, prevSame, prevAny) {
        const sorted = Object.entries(current.parties).sort((a, b) => b[1] - a[1]);
        const colPrevAny  = prevAny  ? `<th class="px-3 py-2 text-right text-xs font-medium text-slate-500">Δ ${prevAny}</th>`  : '';
        const colPrevSame = prevSame ? `<th class="px-3 py-2 text-right text-xs font-medium text-slate-500">Δ ${prevSame}</th>` : '';

        let rows = '';
        sorted.forEach(([party, votes]) => {
            const pct = current.total > 0 ? votes / current.total * 100 : 0;
            const color = getColor(party);

            let dAny = '', dSame = '';
            if (prevAnyData && prevAnyData.total > 0) {
                if (party in prevAnyData.parties) {
                    const prev = prevAnyData.parties[party] / prevAnyData.total * 100;
                    const d    = pct - prev;
                    const sign = d >= 0 ? '+' : '';
                    const cls  = d >= 0 ? 'text-green-600' : 'text-red-500';
                    dAny = `<td class="px-3 py-2 text-right text-sm font-medium ${cls}">${sign}${d.toFixed(1)}%</td>`;
                } else {
                    // Partij deed niet mee aan vorige verkiezing → geen zinvolle vergelijking
                    dAny = `<td class="px-3 py-2 text-right text-slate-400 text-sm">nieuw</td>`;
                }
            } else if (prevAny) {
                dAny = `<td class="px-3 py-2 text-right text-slate-400 text-sm">—</td>`;
            }
            if (prevSameData && prevSameData.total > 0) {
                if (party in prevSameData.parties) {
                    const prev = prevSameData.parties[party] / prevSameData.total * 100;
                    const d    = pct - prev;
                    const sign = d >= 0 ? '+' : '';
                    const cls  = d >= 0 ? 'text-green-600' : 'text-red-500';
                    dSame = `<td class="px-3 py-2 text-right text-sm font-medium ${cls}">${sign}${d.toFixed(1)}%</td>`;
                } else {
                    dSame = `<td class="px-3 py-2 text-right text-slate-400 text-sm">nieuw</td>`;
                }
            } else if (prevSame) {
                dSame = `<td class="px-3 py-2 text-right text-slate-400 text-sm">—</td>`;
            }

            rows += `<tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-sm shrink-0" style="background:${color}"></div>
                  <span class="text-sm font-medium">${party}</span>
                </div>
              </td>
              <td class="px-3 py-2 text-right text-sm">${pct.toFixed(1)}%</td>
              <td class="px-3 py-2 text-right text-sm text-slate-500">${votes.toLocaleString('nl-NL')}</td>
              ${dAny}${dSame}
            </tr>`;
        });

        return `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div>
              <canvas id="overview-donut" style="max-height:350px"></canvas>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="px-3 py-2 text-xs font-medium text-slate-500">Partij</th>
                    <th class="px-3 py-2 text-right text-xs font-medium text-slate-500">%</th>
                    <th class="px-3 py-2 text-right text-xs font-medium text-slate-500">Stemmen</th>
                    ${colPrevAny}${colPrevSame}
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
    }

    function buildSinglePartyOverview(party, current, prevSameData, prevAnyData, prevSame, prevAny) {
        const pct = current.total > 0 ? (current.parties[party] || 0) / current.total * 100 : 0;
        const color = getColor(party);

        let compareHtml = '';
        if (prevSame || prevAny) {
            compareHtml = '<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">';
            [[prevAny, prevAnyData, 'Vorige verkiezing'], [prevSame, prevSameData, 'Vorige vergelijkbare']].forEach(([label, data, title]) => {
                if (!label) return;
                if (data && data.total > 0) {
                    const prev = (data.parties[party] || 0) / data.total * 100;
                    const d = pct - prev;
                    const sign = d >= 0 ? '+' : '';
                    const cls  = d >= 0 ? 'text-green-600' : 'text-red-500';
                    compareHtml += `<div class="bg-slate-50 rounded p-4 text-center">
                      <div class="text-xs text-slate-500 mb-1">${title} (${label})</div>
                      <div class="text-2xl font-bold ${cls}">${sign}${d.toFixed(1)}%</div>
                      <div class="text-sm text-slate-500">${prev.toFixed(1)}% → ${pct.toFixed(1)}%</div>
                    </div>`;
                }
            });
            compareHtml += '</div>';
        }

        return `<div class="max-w-md mx-auto text-center">
            <div class="inline-block w-4 h-4 rounded mr-2" style="background:${color}"></div>
            <span class="text-3xl font-bold">${pct.toFixed(1)}%</span>
            <p class="text-slate-500 mt-1">${(current.parties[party] || 0).toLocaleString('nl-NL')} stemmen van ${current.total.toLocaleString('nl-NL')}</p>
            ${compareHtml}
          </div>`;
    }

    function renderOverviewDonut(current) {
        const canvas = document.getElementById('overview-donut');
        if (!canvas) return;
        if (overviewChart) { overviewChart.destroy(); overviewChart = null; }

        const sorted = Object.entries(current.parties).sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(p => p[0]);
        const data   = sorted.map(p => p[1]);
        const colors = sorted.map(p => getColor(p[0]));

        overviewChart = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#f8fafc', borderWidth: 2 }] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 14, padding: 10, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct   = (ctx.parsed / total * 100).toFixed(1);
                                return ` ${ctx.label}: ${ctx.raw.toLocaleString('nl-NL')} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ─── TAB: HISTORISCH ─────────────────────────────────────────────────────
    function updateHistoricalTab() {
        const container = document.getElementById('historisch');

        // Laad of herstel de current election type keuze
        const currentType = container.dataset.elType || 'TK';

        // Beschikbare typen
        const types = new Set();
        Object.values(electionData).forEach(loc =>
            loc.verkiezingen.forEach(v => types.add(v.type))
        );
        const typeButtons = Array.from(types).sort().map(t =>
            `<button data-type="${t}" class="hist-type-btn px-4 py-2 text-sm rounded border ${t === currentType ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}">${t}</button>`
        ).join('');

        container.innerHTML = `
          <div class="bg-white rounded-lg shadow p-4 mb-6">
            <div class="flex flex-wrap gap-2 items-center">
              <span class="text-sm font-medium text-slate-700 mr-2">Verkiezingstype:</span>
              ${typeButtons}
            </div>
          </div>
          <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div class="xl:col-span-2 bg-white p-6 rounded-lg shadow">
              <h3 class="font-semibold text-lg mb-4">Resultaten over de tijd — ${currentType}</h3>
              <div style="position:relative;height:400px">
                <canvas id="hist-chart"></canvas>
              </div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow overflow-x-auto">
              <h3 class="font-semibold text-lg mb-4">Vergelijking t.o.v. vorige ${currentType}</h3>
              <div id="hist-table"></div>
            </div>
          </div>`;

        // Bind type-knoppen
        container.querySelectorAll('.hist-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.dataset.elType = btn.dataset.type;
                updateHistoricalTab();
            });
        });

        renderHistoricalChart(currentType);
        renderHistoricalTable(currentType);
    }

    function getHistoricalData(type) {
        // Verzamel alle jaren voor dit type
        const yearSet = new Set();
        Object.values(electionData).forEach(loc =>
            loc.verkiezingen.forEach(v => { if (v.type === type) yearSet.add(v.jaar); })
        );
        const years = Array.from(yearSet).sort((a, b) => a - b);

        // Per jaar: partij → % van totale stemmen
        const byYear = {};
        years.forEach(year => {
            const res = getResultsForSelection(`${type} ${year}`);
            const pcts = {};
            if (res.total > 0) {
                Object.entries(res.parties).forEach(([p, v]) => {
                    pcts[p] = v / res.total * 100;
                });
            }
            byYear[year] = { pcts, total: res.total };
        });

        return { years, byYear };
    }

    function renderHistoricalChart(type) {
        const canvas = document.getElementById('hist-chart');
        if (!canvas) return;
        if (historicalChart) { historicalChart.destroy(); historicalChart = null; }

        const { years, byYear } = getHistoricalData(type);
        if (years.length === 0) {
            canvas.parentElement.innerHTML = '<p class="text-slate-500">Geen data beschikbaar voor dit type.</p>';
            return;
        }

        // Verzamel alle partijen die ooit > 1% haalden
        const sigParties = new Set();
        years.forEach(year => {
            Object.entries(byYear[year].pcts).forEach(([p, pct]) => {
                if (pct >= 1) sigParties.add(p);
            });
        });

        // Sorteer op gemiddeld percentage (meest prominent bovenaan in legend)
        const sortedParties = Array.from(sigParties).sort((a, b) => {
            const avgA = years.reduce((s, y) => s + (byYear[y].pcts[a] || 0), 0) / years.length;
            const avgB = years.reduce((s, y) => s + (byYear[y].pcts[b] || 0), 0) / years.length;
            return avgB - avgA;
        });

        const datasets = sortedParties.map(party => ({
            label: party,
            data: years.map(y => byYear[y].pcts[party] != null ? parseFloat(byYear[y].pcts[party].toFixed(2)) : null),
            borderColor: getColor(party),
            backgroundColor: getColor(party) + '33',
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.3,
            spanGaps: false,
        }));

        historicalChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: years, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 8, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) + '%' : '—'}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '% stemmen' },
                        ticks: { callback: v => v + '%' }
                    },
                    x: { title: { display: true, text: 'Jaar' } }
                }
            }
        });
    }

    function renderHistoricalTable(type) {
        const tableDiv = document.getElementById('hist-table');
        if (!tableDiv) return;

        const { years, byYear } = getHistoricalData(type);
        if (years.length < 2) {
            tableDiv.innerHTML = '<p class="text-sm text-slate-500">Minimaal 2 verkiezingen nodig voor vergelijking.</p>';
            return;
        }

        const lastYear = years[years.length - 1];
        const prevYear = years[years.length - 2];
        const last = byYear[lastYear];
        const prev = byYear[prevYear];

        const allParties = new Set([...Object.keys(last.pcts), ...Object.keys(prev.pcts)]);
        const rows = Array.from(allParties)
            .map(p => {
                const cur  = last.pcts[p] || 0;
                const prv  = prev.pcts[p] || 0;
                const diff = cur - prv;
                return { p, cur, prv, diff };
            })
            .filter(r => r.cur > 0.5 || r.prv > 0.5)
            .sort((a, b) => b.cur - a.cur);

        let html = `<table class="w-full text-sm">
          <thead><tr class="border-b text-xs text-slate-500">
            <th class="py-2 text-left">Partij</th>
            <th class="py-2 text-right">${prevYear}</th>
            <th class="py-2 text-right">${lastYear}</th>
            <th class="py-2 text-right">Δ</th>
          </tr></thead><tbody>`;

        rows.forEach(({ p, cur, prv, diff }) => {
            const color = getColor(p);
            const sign  = diff >= 0 ? '+' : '';
            const cls   = diff > 0.5 ? 'text-green-600 font-semibold'
                        : diff < -0.5 ? 'text-red-500 font-semibold'
                        : 'text-slate-600';
            html += `<tr class="border-b border-slate-50 hover:bg-slate-50">
              <td class="py-1.5 flex items-center gap-1.5">
                <div class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${color}"></div>
                <span class="truncate max-w-[120px]" title="${p}">${p}</span>
              </td>
              <td class="py-1.5 text-right text-slate-500">${prv.toFixed(1)}%</td>
              <td class="py-1.5 text-right font-medium">${cur.toFixed(1)}%</td>
              <td class="py-1.5 text-right ${cls}">${sign}${diff.toFixed(1)}%</td>
            </tr>`;
        });

        tableDiv.innerHTML = html + '</tbody></table>';
    }

    // ─── TAB: ZETELVERDELING ──────────────────────────────────────────────────
    function calculateSeats(partyVotes, totalSeats) {
        const seats = {};
        Object.keys(partyVotes).forEach(p => { seats[p] = 0; });
        for (let i = 0; i < totalSeats; i++) {
            let maxQ = -1, winner = null;
            for (const p in partyVotes) {
                if (partyVotes[p] > 0) {
                    const q = partyVotes[p] / ((seats[p] || 0) + 1);
                    if (q > maxQ) { maxQ = q; winner = p; }
                }
            }
            if (winner) seats[winner]++;
            else break;
        }
        return seats;
    }

    function calculateAverageLocalVoteShare() {
        const shares = [];
        const grYears = new Set();
        Object.values(electionData).forEach(loc =>
            loc.verkiezingen.forEach(v => { if (v.type === 'GR') grYears.add(v.jaar); })
        );
        grYears.forEach(year => {
            let total = 0, local = 0;
            Object.values(electionData).forEach(loc => {
                const el = loc.verkiezingen.find(v => v.type === 'GR' && v.jaar === year);
                if (el) {
                    Object.entries(el.resultaten).forEach(([p, v]) => {
                        total += v;
                        if (PURELY_LOCAL_PARTIES.some(lp => p.includes(lp))) local += v;
                    });
                }
            });
            if (total > 0) shares.push(local / total);
        });
        if (shares.length > 0)
            averageLocalVoteShare = shares.reduce((a, b) => a + b, 0) / shares.length;
    }

    function updateZetelverdeling() {
        const container = document.getElementById('zetels');
        const selected  = electionSelect.value;
        const [type, year] = selected.split(' ');
        const isGR = type === 'GR';
        const totalSeats = parseInt(year) >= 2026 ? 21 : 19;
        const results = getResultsForSelection(selected);
        let partyVotes = results.parties;
        const totalVotes = results.total;

        let title = `Zetelverdeling GR ${year}`;
        let desc  = `Berekend met D'Hondt op ${totalSeats} zetels.`;

        if (!isGR && totalVotes > 0) {
            title = `Voorspelling zetelverdeling GR o.b.v. ${type} ${year}`;
            desc  = `Voorspelling voor ${totalSeats} zetels op basis van ${type} ${year}. Een fictieve lokale partij is toegevoegd (historisch gemiddelde: ${(averageLocalVoteShare * 100).toFixed(1)}%).`;
            const nationalEq = {};
            let nonLocal = 0, natTotal = 0;
            Object.entries(partyVotes).forEach(([p, v]) => {
                if (NATIONAL_PARTIES_WITH_LOCAL_EQUIVALENT.some(lp => p.includes(lp))) {
                    nationalEq[p] = v; natTotal += v;
                } else {
                    nonLocal += v;
                }
            });
            const fictLocal = Math.round(totalVotes * averageLocalVoteShare);
            nonLocal -= fictLocal;
            const adj = { ...nationalEq, 'Fictieve Lokale Partij': fictLocal };
            if (natTotal > 0 && nonLocal > 0) {
                for (const p in nationalEq) {
                    adj[p] += Math.round(nationalEq[p] / natTotal * nonLocal);
                }
            }
            partyVotes = adj;
        }

        if (Object.values(partyVotes).reduce((a, b) => a + b, 0) === 0) {
            container.innerHTML = '<p>Geen data beschikbaar.</p>'; return;
        }

        const seats = calculateSeats(partyVotes, totalSeats);
        const sorted = Object.entries(seats).filter(([, s]) => s > 0).sort(([, a], [, b]) => b - a);

        let html = `<div class="bg-white p-6 rounded-lg shadow max-w-4xl mx-auto">
          <div class="text-center mb-6"><h2 class="text-2xl font-semibold">${title}</h2></div>
          <p class="text-sm text-slate-600 mb-6 text-center max-w-2xl mx-auto">${desc}</p>
          <div class="space-y-4">`;

        sorted.forEach(([p, s]) => {
            const color = getColor(p);
            html += `<div class="grid grid-cols-4 gap-4 items-center">
              <span class="col-span-1 text-sm font-medium truncate" title="${p}">${p}</span>
              <div class="col-span-3 flex items-center">
                <div class="w-full bg-slate-100 rounded-full h-7">
                  <div class="h-7 rounded-full text-white text-sm font-bold flex items-center justify-center"
                       style="width:${Math.max(8,(s/totalSeats)*100)}%;background:${color}">
                    <span>${s}</span>
                  </div>
                </div>
              </div>
            </div>`;
        });

        container.innerHTML = html + '</div></div>';
    }

    // ─── TAB: ANALYSE ─────────────────────────────────────────────────────────
    function updateAnalysisTab() {
        const scenario = analysisElectionSelect.value;
        if (scenario === 'GR 2026') renderPrediction2026();
        else renderHistoricalAnalysis(scenario);
    }

    function renderHistoricalAnalysis(electionString) {
        const container = document.getElementById('analyse');
        const [, year] = electionString.split(' ');
        const results = getResultsForSelection(electionString);
        const originalVotes = results.parties;

        if (results.total === 0) {
            container.innerHTML = '<p>Geen data voor deze verkiezing.</p>'; return;
        }

        const totalSeats = 19;
        const seatsApart = calculateSeats(originalVotes, totalSeats);
        const glApart    = seatsApart['GroenLinks'] || 0;
        const pvdaApart  = seatsApart['PvdA'] || 0;

        const combined = { ...originalVotes };
        const glV  = combined['GroenLinks'] || 0;
        const pvV  = combined['PvdA'] || 0;
        delete combined['GroenLinks'];
        delete combined['PvdA'];
        combined['GroenLinks-PvdA'] = glV + pvV;
        const seatsCombined = calculateSeats(combined, totalSeats);
        const totalCombined = seatsCombined['GroenLinks-PvdA'] || 0;
        const diff = totalCombined - (glApart + pvdaApart);
        const diffText  = diff > 0 ? `Winst: ${diff} zetel(s)` : diff < 0 ? `Verlies: ${Math.abs(diff)} zetel(s)` : 'Geen verschil';
        const diffClass = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-700';

        let html = `<div class="bg-white p-6 rounded-lg shadow">
          <div class="text-center mb-6">
            <h2 class="text-2xl font-semibold">Analyse samenwerking GroenLinks / PvdA (GR ${year})</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 class="font-semibold text-lg mb-2">Scenario A: Aparte lijsten</h3>
              <p class="text-sm text-slate-500 mb-4">Daadwerkelijke zetelverdeling.</p>
              <table class="w-full text-sm"><tbody>`;
        Object.entries(seatsApart).filter(([,s])=>s>0).sort(([,a],[,b])=>b-a).forEach(([p,s]) => {
            html += `<tr class="border-b"><th class="py-2 px-3 font-medium text-left">${p}</th><td class="py-2 px-3">${s} zetel(s)</td></tr>`;
        });
        html += `</tbody></table></div>
            <div>
              <h3 class="font-semibold text-lg mb-2">Scenario B: Gezamenlijke lijst</h3>
              <p class="text-sm text-slate-500 mb-4">Simulatie.</p>
              <table class="w-full text-sm"><tbody>`;
        Object.entries(seatsCombined).filter(([,s])=>s>0).sort(([,a],[,b])=>b-a).forEach(([p,s]) => {
            html += `<tr class="border-b"><th class="py-2 px-3 font-medium text-left">${p}</th><td class="py-2 px-3">${s} zetel(s)</td></tr>`;
        });
        html += `</tbody></table></div>
          </div>
          <div class="mt-8 pt-6 border-t text-center">
            <h3 class="font-semibold text-lg mb-2">Conclusie</h3>
            <p class="mt-4 text-lg font-semibold ${diffClass}">${diffText}</p>
          </div>
        </div>`;
        container.innerHTML = html;
    }

    function renderPrediction2026() {
        const container = document.getElementById('analyse');
        const tk17 = getResultsForSelection('TK 2017');
        const tk23 = getResultsForSelection('TK 2023');
        const tk17total = (tk17.parties['GroenLinks'] || 0) + (tk17.parties['PvdA'] || 0);
        const tk23gl    = tk23.parties['GroenLinks-PvdA'] || 0;
        const synergy   = tk17total > 0 ? tk23gl / tk17total : 1;
        const gr22 = getResultsForSelection('GR 2022');
        const pred = {};
        const gl22 = gr22.parties['GroenLinks'] || 0;
        const pv22 = gr22.parties['PvdA'] || 0;
        Object.entries(gr22.parties).forEach(([p, v]) => {
            if (p !== 'GroenLinks' && p !== 'PvdA') pred[p] = v;
        });
        pred['GroenLinks-PvdA'] = Math.round((gl22 + pv22) * synergy);
        const seats = calculateSeats(pred, 21);
        const sorted = Object.entries(seats).filter(([,s])=>s>0).sort(([,a],[,b])=>b-a);

        let html = `<div class="bg-white p-6 rounded-lg shadow">
          <div class="text-center mb-6"><h2 class="text-2xl font-semibold">Voorspelling GR 2026 (21 zetels)</h2></div>
          <div class="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded max-w-2xl mx-auto">
            <p class="text-sm text-indigo-800">Gebaseerd op GR 2022 uitslag met GroenLinks-PvdA gecombineerd,
            gecorrigeerd voor het synergie-effect tussen TK 2017 en TK 2023
            (synergiefactor: <b>${synergy.toFixed(2)}</b>).</p>
          </div>
          <div class="max-w-xl mx-auto space-y-3">`;
        sorted.forEach(([p, s]) => {
            const color = getColor(p);
            html += `<div class="flex items-center gap-3">
              <span class="w-40 text-sm font-medium truncate" title="${p}">${p}</span>
              <div class="flex-1 bg-slate-100 rounded-full h-7">
                <div class="h-7 rounded-full text-white text-sm font-bold flex items-center justify-center"
                     style="width:${Math.max(8,(s/21)*100)}%;background:${color}">${s}</div>
              </div>
            </div>`;
        });
        container.innerHTML = html + '</div></div>';
    }

    // ─── Initialisatie ────────────────────────────────────────────────────────
    async function initializeDashboard() {
        try {
            const [csvText, geojson, stembureauData] = await Promise.all([
                fetch(ELECTION_DATA_URL).then(r => r.text()),
                fetch(GEOJSON_URL).then(r => r.json()),
                fetch(STEMBUREAU_DATA_URL).then(r => r.json()),
            ]);

            electionData = convertCsvToElectionData(csvText, stembureauData);
            geojsonData  = geojson;

            calculateAverageLocalVoteShare();
            populateElectionFilter();
            populateAnalysisFilter();
            setupTabs();
            addEventListeners();
            switchTab(activeTab);
        } catch (err) {
            console.error('Dashboard initialisatie mislukt:', err);
            document.querySelector('.container').innerHTML =
                `<div class="text-center p-8 text-red-600"><h1>Fout bij laden</h1><p>${err}</p></div>`;
        }
    }

    initializeDashboard();
});
