import { dbClient } from './js/db_client.js';

// const API_BASE = '/api'; // Removed


const state = {
    lists: [], // Array of { id, name, faction, factionUrl, units: [] }
    currentListId: null,

    // Builder State
    units: [], // Units for the ACTIVE faction
    detachments: [],
    stratagems: [], // Fetched stratagems
    selectedUnitId: null,
    searchQuery: '',
    searchMaxPoints: null,
    showLegends: false,
    sortMode: 'name', // 'name', 'points', 'movement', 'type'
    condensedView: false,

    // Shortcut to get active units
    get activeList() {
        return this.lists.find(l => l.id === this.currentListId);
    },
    get armyList() {
        return this.activeList ? this.activeList.units : [];
    }
};

const SM_CHAPTERS = [
    'Ultramarines',
    'Blood Angels',
    'Dark Angels',
    'Space Wolves',
    'Black Templars',
    'Deathwatch',
    'Imperial Fists',
    'Salamanders',
    'White Scars',
    'Raven Guard',
    'Iron Hands',
    'Crimson Fists'
];

const DETACHMENT_RESTRICTIONS = {
    // Dark Angels
    'Unforgiven Task Force': 'Dark Angels',
    'Inner Circle Task Force': 'Dark Angels',
    'Company of Hunters': 'Dark Angels',

    // Blood Angels
    'Sons of Sanguinius': 'Blood Angels',
    'Liberator Assault Group': 'Blood Angels',
    'The Lost Brethren': 'Blood Angels',
    'Angelic Inheritors': 'Blood Angels',
    'The Angelic Host': 'Blood Angels',

    // Space Wolves
    'Champions of Fenris': 'Space Wolves',
    'Saga of the Beastslayer': 'Space Wolves',

    // Black Templars
    'Righteous Crusaders': 'Black Templars',
    'Wrathful Procession': 'Black Templars', // Potentially

    'Black Spear Task Force': 'Deathwatch',

    // Imperial Fists
    'Bastion Task Force': 'Imperial Fists',
    'Emperor’s Shield': 'Imperial Fists',
    'Orbital Assault Force': 'Imperial Fists',

    // Salamanders
    'Hammer of Avernii': 'Salamanders',
    'Forgefather’s Seekers': 'Salamanders',

    // Raven Guard
    'Shadowmark Talon': 'Raven Guard',

    // White Scars
    'Pilum Strike Team': 'White Scars',

    // Common/Other (Best guess mapping or hiding)
    'Lion’s Blade Task Force': 'Dark Angels',
    'Wrath of the Rock': 'Dark Angels',
    'Companions of Vehemence': 'Black Templars',

    'Saga of the Bold': 'Space Wolves',
    'Saga of the Great Wolf': 'Space Wolves',
    'Saga of the Hunter': 'Space Wolves',

    'Rage-cursed Onslaught': 'Blood Angels',

    'Blade of Ultramar': 'Ultramarines'
};

const GENERIC_DETACHMENTS = [
    'Gladius Task Force',
    '1st Company Task Force',
    'Anvil Siege Force',
    'Firestorm Assault Force',
    'Ironstorm Spearhead',
    'Stormlance Task Force',
    'Vanguard Spearhead'
];

// DOM Elements
const views = {
    landing: document.getElementById('view-landing'),
    builder: document.getElementById('view-builder')
};
const listsContainer = document.getElementById('lists-container');
const modalCreate = document.getElementById('modal-create');
const modalRename = document.getElementById('modal-rename');

// Builder DOM
const unitListEl = document.getElementById('unit-list');
const armyListEl = document.getElementById('army-list');
const datasheetContainer = document.getElementById('datasheet-container');
const searchInput = document.getElementById('unit-search');
const tabUnits = document.getElementById('tab-units');
const tabArmy = document.getElementById('tab-army');
const viewUnits = document.getElementById('view-units');
const viewArmy = document.getElementById('view-army');
const armyCountEl = document.getElementById('army-count');
const totalPointsEl = document.getElementById('total-points');

// Initialization
async function init() {
    loadListsFromStorage();
    renderLandingPage();
    await dbClient.init(); // Initialize WASM DB
    await fetchFactions();

    // Event Listeners for Landing Page
    document.getElementById('btn-create-list').onclick = () => showCreateModal();
    document.getElementById('btn-cancel-create').onclick = () => hideCreateModal();
    document.getElementById('btn-confirm-create').onclick = () => createNewList();

    document.getElementById('new-list-faction').onchange = (e) => {
        toggleCustomUrl(e.target.value);
        toggleChapterSelect(e.target.value);
    };

    document.getElementById('btn-exit-builder').onclick = () => exitBuilder();

    // Condensed View Toggle
    document.getElementById('btn-condensed-view').onclick = toggleCondensedView;
    document.getElementById('btn-print').onclick = printArmy;

    // Rename Modal Listeners
    document.getElementById('btn-cancel-rename').onclick = () => {
        modalRename.style.display = 'none';
        document.getElementById('rename-list-name').value = '';
    };
    document.getElementById('btn-confirm-rename').onclick = confirmRename;

    // Unit Sort
    const sortSelect = document.getElementById('unit-sort');
    if (sortSelect) {
        sortSelect.value = state.sortMode;
        sortSelect.addEventListener('change', (e) => {
            state.sortMode = e.target.value;
            renderSidebar();
        });
    }

    const legendsCheck = document.getElementById('filter-show-legends');
    if (legendsCheck) {
        legendsCheck.checked = state.showLegends;
        legendsCheck.addEventListener('change', (e) => {
            state.showLegends = e.target.checked;
            renderSidebar();
        });
    }

    // Builder Search & Filter
    const unitSearchInput = document.getElementById('unit-search'); // Assuming searchInput is now unitSearchInput
    if (unitSearchInput) {
        unitSearchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase();
            renderSidebar();
        });
    }

    const pointsInput = document.getElementById('unit-points-filter');
    if (pointsInput) {
        pointsInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.searchMaxPoints = isNaN(val) ? null : val;
            renderSidebar();
        });
    }



    createWahapediaListeners();
}

function createWahapediaListeners() {
    // Intercept Wahapedia links
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href && (link.href.includes('wahapedia.ru') || link.href.includes('wahapedia.io'))) {
            e.preventDefault();
            // Open in a centered popup window
            const width = 1200;
            const height = 900;
            const left = (screen.width - width) / 2;
            const top = (screen.height - height) / 2;

            window.open(
                link.href,
                'wahapedia_ref',
                `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
            );
        }
    });
}

async function fetchFactions() {
    try {
        const factions = await dbClient.getFactions();
        const select = document.getElementById('new-list-faction');
        if (!select) return;

        let optionsHtml = '';

        factions.forEach(f => {
            if (!f.url) return;
            // Filter out factions that are actually Chapters (using the sub-faction selector instead)
            if (SM_CHAPTERS.includes(f.name)) return;
            optionsHtml += `<option value="${f.name}" data-url="${f.url}">${f.name}</option>`;
        });

        // Add Custom Option
        optionsHtml += `<option value="Custom">Custom URL...</option>`;

        select.innerHTML = optionsHtml;
    } catch (err) {
        console.error('Failed to fetch factions:', err);
    }
}

function loadListsFromStorage() {
    state.showLegends = false;
    const lists = JSON.parse(localStorage.getItem('armyLists') || '[]');
    state.lists = lists;
}

function saveListsToStorage() {
    localStorage.setItem('armyLists', JSON.stringify(state.lists));
}

// -- Landing Page Logic --

function renderLandingPage() {
    views.landing.style.display = 'block';
    views.builder.style.display = 'none';

    listsContainer.innerHTML = '';

    if (state.lists.length === 0) {
        listsContainer.innerHTML = '<div class="empty-state">No lists found. Create one to get started!</div>';
        return;
    }

    state.lists.forEach(list => {
        const totalPoints = list.units.reduce((sum, u) => sum + (u.points || 0), 0);

        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
            <div class="list-name">${list.name}</div>
            <div class="list-faction">${list.faction}</div>
            <div class="list-meta">
                <span>${list.units.length} Units</span>
                <span>${totalPoints} pts</span>
            </div>
            </div>
            <button class="btn-rename-list" title="Rename List">✎</button>
            <button class="btn-duplicate-list" title="Duplicate List">⧉</button>
            <button class="btn-delete-list" title="Delete List">×</button>
        `;

        // Open List
        card.onclick = (e) => {
            if (e.target.classList.contains('btn-delete-list')) return;
            if (e.target.classList.contains('btn-duplicate-list')) return;
            if (e.target.classList.contains('btn-rename-list')) return;
            openBuilder(list.id);
        };

        // Rename List
        card.querySelector('.btn-rename-list').onclick = (e) => {
            e.stopPropagation();
            openRenameModal(list.id);
        };

        // Duplicate List
        card.querySelector('.btn-duplicate-list').onclick = (e) => {
            e.stopPropagation();
            duplicateList(list.id);
        };

        // Delete List
        card.querySelector('.btn-delete-list').onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${list.name}"?`)) {
                state.lists = state.lists.filter(l => l.id !== list.id);
                saveListsToStorage();
                renderLandingPage();
            }
        };

        listsContainer.appendChild(card);
    });
}

function duplicateList(listId) {
    const original = state.lists.find(l => l.id === listId);
    if (!original) return;

    // Deep copy
    const newList = JSON.parse(JSON.stringify(original));

    // Updates
    newList.id = Date.now().toString();
    newList.name = `Copy of ${original.name}`;
    newList.timestamp = Date.now();

    state.lists.push(newList);
    saveListsToStorage();
    renderLandingPage();
}



function openRenameModal(listId) {
    const list = state.lists.find(l => l.id === listId);
    if (!list) return;

    document.getElementById('rename-list-id').value = listId;
    document.getElementById('rename-list-name').value = list.name;
    modalRename.style.display = 'flex';
    document.getElementById('rename-list-name').focus();
}

function confirmRename() {
    const listId = document.getElementById('rename-list-id').value;
    const newName = document.getElementById('rename-list-name').value.trim();

    if (!newName) {
        showToast('Please enter a name', 'error');
        return;
    }

    const list = state.lists.find(l => l.id === listId);
    if (list) {
        list.name = newName;
        saveListsToStorage();
        renderLandingPage();
        modalRename.style.display = 'none';
    }
}

function showCreateModal() {
    modalCreate.style.display = 'flex';
    document.getElementById('new-list-name').focus();
}

function hideCreateModal() {
    modalCreate.style.display = 'none';
    document.getElementById('new-list-name').value = '';
    document.getElementById('refresh-data').checked = false;
}

function toggleCustomUrl(val) {
    document.getElementById('custom-url-group').style.display = val === 'Custom' ? 'block' : 'none';
}



function toggleChapterSelect(factionName) {
    const isSM = factionName === 'Space Marines';
    const group = document.getElementById('chapter-select-group');
    if (group) {
        group.style.display = isSM ? 'block' : 'none';
        if (isSM) {
            // Populate if empty
            const select = document.getElementById('new-list-chapter');
            if (select.options.length <= 1) {
                select.innerHTML = '<option value="">-- No Specific Chapter --</option>';
                SM_CHAPTERS.forEach(c => {
                    select.innerHTML += `<option value="${c}">${c}</option>`;
                });
            }
        }
    }
}

async function createNewList() {
    const nameInput = document.getElementById('new-list-name');
    const factionSelect = document.getElementById('new-list-faction');
    const chapterSelect = document.getElementById('new-list-chapter');
    const customUrlInput = document.getElementById('custom-url');

    const name = nameInput.value.trim() || 'Untitled Army';
    const factionOption = factionSelect.options[factionSelect.selectedIndex];
    const forceRefresh = document.getElementById('refresh-data').checked;

    let faction = factionSelect.value;
    let url = factionOption.dataset.url;
    let chapter = null;

    if (faction === 'Space Marines' && chapterSelect && chapterSelect.value) {
        chapter = chapterSelect.value;
    }

    if (faction === 'Custom') {
        url = customUrlInput.value.trim();
        faction = 'Custom Faction';

        if (!url) return showToast('Please enter a Wahapedia URL', 'error');
    }

    const newList = {
        id: Date.now().toString(),
        name,
        faction,
        chapter,
        factionUrl: url,
        units: [],
        timestamp: Date.now()
    };

    state.lists.push(newList);
    saveListsToStorage();
    hideCreateModal();

    // Open the new list immediately
    await openBuilder(newList.id, forceRefresh);
}

// -- Builder Logic --

async function openBuilder(listId, forceRefresh = false) {
    const list = state.lists.find(l => l.id === listId);
    if (!list) return;

    state.currentListId = listId;

    // Switch Views
    views.landing.style.display = 'none';
    views.builder.style.display = 'flex'; // Must be flex to maintain sidebar layout

    // Load Units and Detachments
    await fetchUnitsForFaction(list.factionUrl, list.faction, forceRefresh);
    await fetchDetachments(list.factionUrl);
    await fetchStratagems(list.factionUrl);

    // Render Builder
    renderSidebar();
    renderArmyList();
    renderDetachmentSelector(); // New function for list settings
    updatePoints();

    // Default to Units tab
    switchTab('units');
}

async function fetchDetachments(url) {
    try {
        state.detachments = await dbClient.getDetachments(url);
    } catch (e) {
        console.error('Failed to load detachments', e);
        state.detachments = []; // fallback
    }
}

async function fetchStratagems(url) {
    try {
        state.stratagems = await dbClient.getStratagems(url);
    } catch (e) {
        console.error('Failed to load stratagems', e);
        state.stratagems = [];
    }
}

function renderDetachmentSelector() {
    const container = document.getElementById('detachment-selector-container');
    if (!container) return;

    // Find current list
    const list = state.activeList;
    const currentDetachment = list.detachment || '';

    // Filter Detachments based on Chapter
    const filteredDetachments = state.detachments.filter(d => {
        // 0. If NOT Space Marines, show all (no filtering needed yet)
        if (list.faction !== 'Space Marines') return true;

        // 1. If Generic -> Show
        if (GENERIC_DETACHMENTS.includes(d.name)) return true;

        // 2. If Restricted -> Show only if matches
        const restriction = DETACHMENT_RESTRICTIONS[d.name];
        if (restriction) {
            return restriction === list.chapter;
        }

        // 3. If neither (Unknown/Misc) -> Hide (to be safe and clean)
        return false;
    });

    container.innerHTML = `
        <select id="detachment-select" style="width: 100%; background:#333; color:white; border:1px solid #555; padding:8px; border-radius:4px;">
            <option value="">-- Select Detachment --</option>
            ${filteredDetachments.map(d => `<option value="${d.name}" ${d.name === currentDetachment ? 'selected' : ''}>${d.name}</option>`).join('')}
        </select>
        <div style="margin-top: 8px; text-align: center;">
            <a href="#" id="btn-view-rules" style="font-size: 0.9em; color: var(--accent); text-decoration: none;">View Army & Detachment Rules</a>
        </div>
    `;

    // Event listener for the new link
    setTimeout(() => { // delay slightly to ensure DOM is ready? No, should be synchronous.
        const btn = document.getElementById('btn-view-rules');
        if (btn) btn.onclick = (e) => { e.preventDefault(); showRulesOverlay(); };
    }, 0);

    document.getElementById('detachment-select').addEventListener('change', async (e) => {
        list.detachment = e.target.value;
        saveListsToStorage();

        // Update Stratagems view
        renderStratagems(list.detachment);

        // If we have a unit selected, re-render its datasheet to update enhancements
        if (state.selectedUnitId) {
            try {
                // Must fetch full details, not just use the summary from state.units
                const unit = await dbClient.getUnitDetails(state.selectedUnitId);
                renderDatasheet(unit);
            } catch (err) {
                console.error('Failed to update datasheet on detachment change:', err);
            }
        }
    });

    // Initial render of stratagems if detachment is set
    if (currentDetachment) {
        renderStratagems(currentDetachment);
    }
}

function renderStratagems(detachmentName) {
    const section = document.getElementById('stratagems-section');
    const container = document.getElementById('stratagems-list');

    if (!section || !container) return; // Should exist if HTML updated

    if (!detachmentName) {
        section.style.display = 'none';
        return;
    }

    // Filter Logic
    const validStrats = state.stratagems.filter(s => {
        const d = (s.detachment || '').toLowerCase();
        const target = detachmentName.toLowerCase();
        return d === 'core' || d === target;
    });

    if (validStrats.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = validStrats.map(s => `
        <div class="stratagem-card">
            <div class="stratagem-header">
                <span class="stratagem-name">${s.name}</span>
                <span class="stratagem-cp">${s.cp_cost}</span>
            </div>
            <div class="stratagem-type">${s.type}</div>
            <div class="stratagem-desc">${s.description}</div>
        </div>
    `).join('');
}

function exitBuilder() {
    state.currentListId = null;
    state.units = []; // Clear units to save memory?
    renderLandingPage();
}

async function fetchUnitsForFaction(url, factionName, forceRefresh = false) {
    unitListEl.innerHTML = '<li class="loading">Loading Faction Units...</li>';

    try {
        let allUnits = [];

        // No more scraping or scraping endpoints. Just DB query.
        allUnits = await dbClient.getUnits(url);

        state.units = allUnits;
        console.log(`Fetched ${allUnits.length} units for ${factionName} from ${url}`);
        if (allUnits.length === 0) console.warn('Zero units fetched, but backend should have data');
        if (allUnits.length > 0 && allUnits[0].min_points === undefined) console.warn('Units missing min_points', allUnits[0]);

        state.units.sort((a, b) => a.name.localeCompare(b.name));

    } catch (e) {
        console.error(e);
        showToast('Failed to load faction data. ' + e.message, 'error');
        exitBuilder();
    }
}

function updatePoints() {
    if (!state.activeList) return;
    const total = state.activeList.units.reduce((sum, item) => sum + item.points, 0);
    totalPointsEl.textContent = total;
    armyCountEl.textContent = `(${state.activeList.units.length})`;
}

function renderSidebar() {
    unitListEl.innerHTML = '';
    const sortMode = state.sortMode || 'name';

    const filteredUnits = state.units.filter(unit => {
        // Filtering Logic
        const matchesSearch = unit.name.toLowerCase().includes(state.searchQuery) ||
            (unit.keywords && unit.keywords.toLowerCase().includes(state.searchQuery));

        const matchesPoints = state.searchMaxPoints === null || (unit.min_points !== undefined && unit.min_points <= state.searchMaxPoints);
        const matchesLegends = state.showLegends || !unit.is_legends;

        // Chapter Filtering (Space Marines only)
        let matchesChapter = true;
        if (state.activeList && state.activeList.chapter) {
            const myChapter = state.activeList.chapter;
            const kws = (unit.keywords || '').split(',').map(k => k.trim());

            // 1. If unit HAS my chapter keyword -> SHOW
            const hasMyChapter = kws.includes(myChapter);

            // 2. If unit HAS ANY OTHER chapter keyword -> HIDE
            // (Unless it also has my chapter, but usually they are exclusive)
            const hasOtherChapter = kws.some(k => SM_CHAPTERS.includes(k) && k !== myChapter);

            if (hasMyChapter) {
                matchesChapter = true;
            } else if (hasOtherChapter) {
                matchesChapter = false;
            } else {
                // Generic unit (no chapter keywords) -> SHOW
                matchesChapter = true;
            }
        }

        return matchesSearch && matchesPoints && matchesLegends && matchesChapter;
    });

    // Sorting Logic
    filteredUnits.sort((a, b) => {
        if (sortMode === 'name') {
            return a.name.localeCompare(b.name);
        } else if (sortMode === 'points') {
            return (a.min_points || 0) - (b.min_points || 0);
        } else if (sortMode === 'movement') {
            const parseMove = (m) => parseInt(m) || 0; // "6\"" -> 6, "-" -> 0
            return parseMove(b.movement) - parseMove(a.movement); // Descending (Faster first)
        } else if (sortMode === 'type') {
            const getPriority = (u) => {
                const kws = (u.keywords || '').toUpperCase();
                if (kws.includes('EPIC HERO')) return 1;
                if (kws.includes('CHARACTER')) return 2;
                if (kws.includes('MONSTER')) return 3;
                if (kws.includes('VEHICLE')) return 4;
                if (kws.includes('MOUNTED')) return 5;
                if (kws.includes('INFANTRY')) return 6;
                return 7; // Other
            };
            return getPriority(a) - getPriority(b);
        }
        return 0;
    });
    console.log(`Rendering Sidebar: ${filteredUnits.length} / ${state.units.length} units shown.`);

    if (filteredUnits.length === 0) {
        unitListEl.innerHTML = '<li class="no-results">No units found</li>';
        return;
    }

    filteredUnits.forEach(unit => {
        const li = document.createElement('li');
        const legendsBadge = unit.is_legends ? '<span title="Legends Unit" style="background:#552; color:#ffc; font-size:0.7em; padding:1px 4px; border-radius:2px; margin-right:4px;">L</span>' : '';
        li.innerHTML = `<span>${legendsBadge}${unit.name.split('(')[0].trim()}</span> <span style="font-size:0.8em; opacity:0.4">${unit.min_points}pts</span>`;
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.dataset.id = unit.id;

        // Apply visual border if Sorting by Type
        if (sortMode === 'type') {
            const kws = (unit.keywords || '').toUpperCase();
            let color = 'orange'; // Default/Other

            if (kws.includes('EPIC HERO')) color = 'gold';
            else if (kws.includes('CHARACTER')) color = 'purple';
            else if (kws.includes('MONSTER')) color = 'red';
            else if (kws.includes('VEHICLE')) color = 'silver';
            else if (kws.includes('MOUNTED')) color = 'blue';
            else if (kws.includes('INFANTRY')) color = 'green';

            li.style.borderLeft = `2px solid ${color}`;
        }

        if (state.selectedUnitId === unit.id) {
            li.classList.add('active');
        }

        li.addEventListener('click', () => selectUnit(unit.id));
        unitListEl.appendChild(li);
    });
}



function addToArmy(unit, composition) {
    // Collect selected wargear
    const selectedWargear = [];
    const inputs = document.querySelectorAll('.wargear-qty');
    inputs.forEach(input => {
        const qty = parseInt(input.value);
        if (qty > 0) {
            const index = parseInt(input.id.split('-')[2]);
            if (unit.wargear[index]) {
                selectedWargear.push({
                    description: unit.wargear[index].description,
                    count: qty
                });
            }
        }
    });

    // Collect selected enhancements
    const selectedEnhancements = [];
    const enhChecks = document.querySelectorAll('.enhancement-check:checked');
    let extraPoints = 0;

    enhChecks.forEach(cb => {
        const index = parseInt(cb.value);
        if (unit.enhancements[index]) {
            const enh = unit.enhancements[index];
            selectedEnhancements.push(enh);
            extraPoints += enh.points;
        }
    });

    state.armyList.push({
        unitId: unit.id,
        name: unit.name,
        description: composition.description,
        points: composition.points + extraPoints,
        basePoints: composition.points,
        wargear: selectedWargear,
        enhancements: selectedEnhancements
    });
    saveListsToStorage(); // Updated persistence
    updatePoints();

    // Optional: Visual feedback
    // Optional: Visual feedback
    showToast(`Added ${unit.name} to army!`, 'success');
}


// Helper for modals
function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

// Helper for truncation
function truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '...' : str;
}

// --- Leader Attachment System ---



function openAttachModal(leaderId) {
    // leaderId is the Unique Instance ID (string)
    const leader = state.activeList.units.find(u => u.id === leaderId);
    if (!leader) return;

    // Filter potential bodyguards:
    // ...
    const candidates = state.activeList.units.filter(u => {
        // Exclude self (by generic ID or unique ID - uniqueness is safer)
        if (u.id === leaderId) return false;
        // Exclude units that are already attached TO someone (cant chain)
        if (u.attachedTo) return false;

        // Exclude units that are already leading? 
        // ...

        // Exclude units that act as leaders? (Characters shouldn't attach to Characters typically, but some can)
        // For MVP: simple filter
        return true;
    });

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content animate-scale-in" style="max-width: 500px;">
            <h3>Attach ${leader.name} to...</h3>
            <div class="list-container" style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
                ${candidates.map(u => `
                    <div class="list-item" onclick="attachUnit('${leaderId}', '${u.id}')" style="cursor:pointer; padding: 10px; border: 1px solid #444; margin-bottom: 5px; border-radius: 4px;">
                        <strong>${u.name}</strong>
                        <div style="font-size: 0.8em; color: #888;">${u.points} pts</div>
                    </div>
                `).join('')}
                ${candidates.length === 0 ? '<div style="color:#888; font-style:italic;">No eligible bodyguard units found.</div>' : ''}
            </div>
            <div class="modal-actions">
                <button onclick="closeModal()" class="btn-cancel">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function attachUnit(leaderId, bodyguardId) {
    // Both are Unique Instance IDs (strings)
    const leader = state.activeList.units.find(u => u.id === leaderId);
    if (leader) {
        leader.attachedTo = bodyguardId;
        saveListsToStorage();
        renderArmyList();
        closeModal();
    }
}

function detachUnit(leaderId) {
    const leader = state.activeList.units.find(u => u.id === leaderId);
    if (leader) {
        delete leader.attachedTo;
        saveListsToStorage();
        renderArmyList();
    }
}

function removeUnit(unitId) {
    // unitId is Unique Instance ID
    if (!confirm('Are you sure you want to remove this unit?')) return;

    // Check if this unit is a Bodyguard for any leader
    const attachedLeaders = state.activeList.units.filter(u => u.attachedTo === unitId);

    let removeLeaders = false;
    if (attachedLeaders.length > 0) {
        const leaderNames = attachedLeaders.map(l => l.name).join(', ');
        removeLeaders = confirm(`This unit is a Bodyguard for: ${leaderNames}.\n\nDo you want to remove the Leader(s) as well?\nClick OK to REMOVE Leaders too.\nClick Cancel to KEEP Leaders (they will be detached).`);
    }

    // Perform Removal

    // 1. Remove the target unit
    const originalLength = state.activeList.units.length;
    state.activeList.units = state.activeList.units.filter(u => u.id !== unitId);

    if (state.activeList.units.length === originalLength) {
        console.error("Failed to remove unit. ID mismatch?", unitId);
        return;
    }

    // 2. Handle Leaders
    if (attachedLeaders.length > 0) {
        if (removeLeaders) {
            // Remove attached leaders
            state.activeList.units = state.activeList.units.filter(u => u.attachedTo !== unitId);
        } else {
            // Detach attached leaders
            state.activeList.units.forEach(u => {
                if (u.attachedTo === unitId) {
                    delete u.attachedTo;
                }
            });
        }
    }

    state.activeList.timestamp = Date.now();
    saveListsToStorage();
    renderArmyList();
    updatePoints();
}

// Make functions global
window.showCreateModal = showCreateModal;
window.hideCreateModal = hideCreateModal;
window.createNewList = createNewList;
window.openAttachModal = openAttachModal;
window.toggleCustomUrl = toggleCustomUrl;
window.exitBuilder = exitBuilder;
window.selectUnit = selectUnit; // Will be defined later or needs export
window.toggleCondensedView = toggleCondensedView;
window.printArmy = printArmy;
window.attachUnit = attachUnit;
window.detachUnit = detachUnit;
window.removeUnit = removeUnit;
window.addToArmy = addToArmy;
window.openBuilder = openBuilder;
window.duplicateList = duplicateList;
window.openRenameModal = openRenameModal;
window.confirmRename = confirmRename;
window.closeModal = closeModal;

// -- Toast Notification System --
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Should exist

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon based on type
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}



// --- End Leader System ---

async function selectUnit(id) {
    if (state.selectedUnitId === id && viewArmy.style.display === 'none') return;

    state.selectedUnitId = id;
    renderSidebar(); // update active class

    // Fetch detailed data
    datasheetContainer.innerHTML = '<div class="loading">Loading datasheet...</div>';

    try {
        const unitData = await dbClient.getUnitDetails(id);
        renderDatasheet(unitData);
    } catch (error) {
        console.error('Failed to fetch unit details:', error);
        datasheetContainer.innerHTML = '<div class="error">Error loading datasheet</div>';
    }
}
window.selectUnit = selectUnit;

// New helper to view play card from list
async function viewPlayCard(id) {
    if (state.condensedView) {
        state.condensedView = false;
        datasheetContainer.innerHTML = '<div class="loading">Loading...</div>';
    }

    // Find item by Unique Instance ID
    // Find item by Unique Instance ID
    const listUnit = state.activeList.units.find(u => u.id === id);
    if (!listUnit) {
        console.error("Unit not found in list for Play Card view", id);
        return;
    }

    try {
        const unitData = await dbClient.getUnitDetails(listUnit.unitId);

        renderPlayCard(listUnit, unitData);

        // Also ensure we are in the right view mode (not search list)
        // If sidebar is showing 'search', maybe we should switch?
        // But for now, just replacing the datasheet content is enough.

    } catch (err) {
        console.error(err);
        datasheetContainer.innerHTML = '<div class="error">Failed to load unit rules.</div>';
    }
}
window.viewPlayCard = viewPlayCard;

// Helper to format wargear list with counts (e.g. "4x Shield")
function formatWargearList(wargearItems) {
    if (!wargearItems || wargearItems.length === 0) return [];

    // Normalize and aggregate
    const counts = {};

    wargearItems.forEach(w => {
        const rawDesc = w.description;
        const desc = rawDesc.includes('->')
            ? rawDesc.split('->')[1].trim()
            : rawDesc.trim();

        // Use w.count if present, otherwise default to 1
        const quantity = (typeof w.count === 'number') ? w.count : 1;

        counts[desc] = (counts[desc] || 0) + quantity;
    });

    // Format
    return Object.entries(counts).map(([desc, count]) => {
        return count > 1 ? `${count}x ${desc}` : desc;
    });
}

async function renderArmyList() {
    const container = document.getElementById('army-list');
    container.innerHTML = '<div class="loading">Loading units...</div>';

    const units = state.activeList.units;

    // Migration: Ensure all units have unique instance IDs (legacy list support)
    let dirty = false;
    units.forEach((u, i) => {
        if (!u.id) {
            u.id = (Date.now() + i).toString();
            dirty = true;
        }
    });
    if (dirty) {
        saveListsToStorage();
    }
    if (units.length === 0) {
        container.innerHTML = '<div class="empty-state">No units in this list. Add some!</div>';
        return;
    }

    // Identify Attached Units vs Top Level
    const attachedUnits = units.filter(u => u.attachedTo);
    const topLevelUnits = units.filter(u => !u.attachedTo);

    // Grouping Map: BodyguardID -> [Leaders]
    const attachmentsMap = {};
    attachedUnits.forEach(u => {
        if (!attachmentsMap[u.attachedTo]) attachmentsMap[u.attachedTo] = [];
        attachmentsMap[u.attachedTo].push(u);
    });

    const renderCardHTML = (item, unit, isAttached = false) => {
        const stats = (unit.models && unit.models.length > 0) ? unit.models[0] : { m: '-', t: '-', sv: '-', w: '-', ld: '-', oc: '-' };
        const isCharacter = (unit.keywords || '').toUpperCase().includes('CHARACTER');

        // Wargear / Enhancement Summary
        let features = [];
        // Enhancements
        if (item.enhancements && item.enhancements.length > 0) {
            features.push(`<span style="color:var(--accent);">★ ${item.enhancements.map(e => e.name).join(', ')}</span>`);
        }
        // Wargear (custom choices only?)
        // item.wargear is an array of objects { selectionId, description, ... }
        // If we want to show specific choices:
        // Wargear (custom choices only?)
        if (item.wargear && item.wargear.length > 0) {
            features.push(...formatWargearList(item.wargear));
        } else if (item.loadout) {
            // Fallback to loadout string if no custom selections
            features.push(`<span style="color:#888; font-style:italic;">${truncate(item.loadout, 50)}</span>`);
        }

        return `
            <div class="unit-card animate-fade-in ${isAttached ? 'attached-unit' : ''}" 
                 data-unit-id="${item.unitId}"
                 onclick="viewPlayCard('${item.id}')"
                 style="cursor: pointer;">
                 
                ${isAttached ? `<div class="attached-label">Attached Leader</div>` : ''}
                
                <header class="card-header">
                    <div class="header-main">
                        <h3>${item.name}</h3>
                        <div class="points-badge">${item.points} pts</div>
                    </div>
                    <div class="card-actions">
                        ${isCharacter && !isAttached ? `
                            <button class="attach-btn" onclick="event.stopPropagation(); openAttachModal('${item.id}')" title="Attach to Bodyguard">
                                🔗 Attach
                            </button>
                        ` : ''}
                        ${isAttached ? `
                            <button class="attach-btn detach-btn" onclick="event.stopPropagation(); detachUnit('${item.id}')" title="Detach from Bodyguard">
                                💔 Detach
                            </button>
                        ` : ''}
                        <button class="btn-icon" onclick="event.stopPropagation(); removeUnit('${item.id}')" title="Remove Unit">✕</button>
                    </div>
                </header>



                <div class="card-body">
                    <!-- Wargear/Enhancement Preview -->
                    <div class="wargear-preview" style="white-space: normal;">
                        ${features.length > 0 ? features.join(' • ') : ''}
                    </div>
                </div>
            </div>
        `;
    };

    try {
        // Fetch data for all top-level units
        // We actually need data for ALL units to check keywords (Character)
        // But render order is Top Level -> (If has attachments -> Render Attachments)

        // Let's just map all units to promises first
        const allDataPromises = units.map(item => dbClient.getUnitDetails(item.unitId));
        const allData = await Promise.all(allDataPromises);

        // Map UnitID -> Data
        const dataMap = {};
        allData.forEach((d, i) => {
            dataMap[units[i].unitId] = d;
        });

        let html = '';

        for (const item of topLevelUnits) {
            const unitData = dataMap[item.unitId];
            const attachments = attachmentsMap[item.id];

            if (attachments && attachments.length > 0) {
                html += '<div class="attachment-group">';

                // 1. Render Bodyguard
                html += renderCardHTML(item, unitData, false);

                // 2. Render Attachments
                for (const attachedItem of attachments) {
                    const attachedData = dataMap[attachedItem.unitId];
                    html += renderCardHTML(attachedItem, attachedData, true);
                }
                html += '</div>';
            } else {
                // No attachments, render normally
                html += renderCardHTML(item, unitData, false);
            }
        }

        container.innerHTML = html;

    } catch (err) {
        console.error('Error rendering list:', err);
        container.innerHTML = '<div class="error">Failed to load army list.</div>';
    }
}

function renderDatasheet(unit) {
    const stats = unit.models.length > 0 ? unit.models[0] : null;

    const html = `
        <div class="datasheet animate-fade-in">
            <header class="ds-header">
                <div class="ds-title-block">
                    <h2>
                        ${unit.name.split('(')[0]}
                        <span class="base-size">${unit.name.includes('(') ? '(' + unit.name.split('(')[1] : ''}</span>
                    </h2>
                    <div class="ds-keywords">${unit.keywords}</div>
                </div>
            </header>

            ${stats ? `
            <div class="stats-grid">
                <div class="stat-box"><span class="stat-label">M</span><span class="stat-value">${stats.m}</span></div>
                <div class="stat-box"><span class="stat-label">T</span><span class="stat-value">${stats.t}</span></div>
                <div class="stat-box"><span class="stat-label">SV</span><span class="stat-value">${stats.sv}</span></div>
                <div class="stat-box"><span class="stat-label">W</span><span class="stat-value">${stats.w}</span></div>
                <div class="stat-box"><span class="stat-label">LD</span><span class="stat-value">${stats.ld}</span></div>
                <div class="stat-box"><span class="stat-label">OC</span><span class="stat-value">${stats.oc}</span></div>
                <div class="stat-box"><span class="stat-label">INV</span><span class="stat-value">${stats.invul}</span></div>
            </div>
            ` : ''}

            <section>
                ${unit.loadout ? `<div class="default-loadout" style="margin-bottom: 10px; font-style: italic; color: #aaa; font-size: 0.9em;"><strong>Default:</strong> ${unit.loadout.replace(/<b>/g, '').replace(/<\/b>/g, '')}</div>` : ''}
                <h3 class="section-title">Points Costs</h3>
                <div class="points-list" id="points-container">
                    <!-- Points will be rendered dynamically below -->
                </div>
            </section>

            <section>
                <h3 class="section-title">Ranged & Melee Weapons</h3>
                <table class="weapons-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Range</th>
                            <th>A</th>
                            <th>WS/BS</th>
                            <th>S</th>
                            <th>AP</th>
                            <th>D</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${unit.weapons.map(w => `
                            <tr>
                                <td class="weapon-name">
                                    ${w.name}
                                    ${w.keywords && w.keywords !== 'undefined' && w.keywords.length > 0 ? `<div class="weapon-keywords">${w.keywords}</div>` : ''}
                                </td>
                                <td>${w.range}</td>
                                <td>${w.attacks}</td>
                                <td>${w.skill}</td>
                                <td>${w.strength}</td>
                                <td>${w.ap}</td>
                                <td>${w.damage}</td>
                            </tr>
                        `).join('')}
                        ${unit.weapons.length === 0 ? '<tr><td colspan="7">No weapons listed</td></tr>' : ''}
                    </tbody>
                </table>
            </section>

            ${unit.wargear && unit.wargear.length > 0 ? `
            <section>
                <h3 class="section-title">Wargear Options</h3>
                <div class="wargear-list" id="wargear-container">
                    ${unit.wargear.map((w, i) => `
                        <div class="wargear-option">
                            <label class="wargear-label">
                                <input type="number" 
                                       class="wargear-qty" 
                                       id="wargear-qty-${i}" 
                                       min="0" 
                                       value="${w.is_default ? (parseInt(unit.composition[0]?.description) || 1) : 0}"
                                       data-default="${w.is_default}"
                                       style="width: 50px; margin-right: 10px; padding: 4px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;">
                                <span class="wargear-text">${w.description.replace(/\n/g, '<br>')}</span>
                            </label>
                        </div>
                        `).join('')}
                </div>
            </section>
            ` : ''}

            ${unit.enhancements && unit.enhancements.length > 0 ? (() => {
            const currentDetachment = state.activeList ? state.activeList.detachment : null;
            const filteredEnhancements = unit.enhancements.filter(e => !e.detachment || e.detachment === currentDetachment);

            if (!currentDetachment) {
                return `
                    <section>
                        <h3 class="section-title">Enhancements</h3>
                        <div class="points-desc" style="font-style: italic; color: #888;">
                            Select a Detachment in the sidebar to view enhancements.
                        </div>
                    </section>`;
            }

            if (filteredEnhancements.length === 0) {
                return `
                    <section>
                        <h3 class="section-title">Enhancements</h3>
                        <div class="points-desc">No enhancements available for ${currentDetachment}.</div>
                    </section>`;
            }

            return `
                <section>
                    <details open>
                        <summary class="section-title" style="cursor: pointer; user-select: none; font-weight: bold;">Enhancements (${currentDetachment})</summary>
                        <div class="wargear-list" id="enhancements-container">
                            ${filteredEnhancements.map((e, i) => {
                // We need to find the ORIGINAL index for the checkbox value to work correctly with existing addToArmy logic?
                // Actually addToArmy uses the index from the DOM checkbox value to look up in unit.enhancements array.
                // If we filter the display, the index `i` here will be 0, 1, 2... of the FILTERED list.
                // We need to store the original index or find the enhancement object by ID/Name in addToArmy.
                // For now, let's fix addToArmy to use the actual enhancement object, effectively using the index relative to the FULL list is dangerous if we hide some.
                // Better approach: Store the GLOBAL index of the enhancement.
                const originalIndex = unit.enhancements.indexOf(e);
                return `
                                <div class="wargear-option">
                                    <label class="wargear-label">
                                        <input type="checkbox" 
                                               class="enhancement-check" 
                                               value="${originalIndex}" 
                                               data-points="${e.points}"
                                               style="accent-color: var(--accent);">
                                        <span class="wargear-text">${e.name} <span style="color:var(--accent)">(${e.points} pts)</span></span>
                                    </label>
                                    <div style="font-size: 0.8em; color: #aaa; margin-left: 28px; margin-top: 2px;">${e.description}</div>
                                </div>
                            `;
            }).join('')}
                        </div>
                    </details>
                </section>`;
        })() : ''}
            
            <section>
                <h3 class="section-title">Abilities</h3>
                <div class="abilities-list">
                    ${unit.abilities.map(a => {
            const isLeader = (a.name && a.name.trim().toUpperCase() === 'LEADER');

            let description = cleanText(a.description);

            if (isLeader) {
                const hasHead = !!unit.leader_head;
                const hasFooter = !!unit.leader_footer;

                // Display logic: Show whatever we have
                let content = `
                                <div class="leader-info">
                                    ${hasHead ? `<div class="leader-head">${cleanText(unit.leader_head)}</div>` : ''}
                                    ${hasFooter ? `<div class="leader-footer" style="margin-top: 8px; font-style: italic;">${cleanText(unit.leader_footer)}</div>` : ''}
                                </div>`;

                // Fallback / Supplement link if data is incomplete OR completely missing
                if (unit.wahapedia_url && (!hasHead || !hasFooter)) {
                    content += `
                                    <div style="margin-top: 10px;">
                                        <a href="${unit.wahapedia_url}" target="_blank" style="color: var(--accent); text-decoration: underline;">
                                            See full rules on Wahapedia
                                        </a>
                                    </div>`;
                }

                // If we have content (either head/footer OR the link), use it.
                if (hasHead || hasFooter || unit.wahapedia_url) {
                    description = content;
                }
            }

            return `
                        <details class="ability-card" style="padding: 8px;">
                            <summary class="ability-name" style="cursor:pointer; font-weight:bold; padding-bottom:4px;">${a.name}${a.parameter ? ` ${a.parameter}` : ''}</summary>
                            <div class="ability-desc" style="margin-top:8px; padding: 25px;">${description}</div>
                        </details>
                    `}).join('')}
                    ${unit.abilities.length === 0 ? '<div class="ability-desc">No abilities listed</div>' : ''}
                </div>
            </section>

            ${/* Transport Rules */ unit.transport ? `
            <section>
                <h3 class="section-title">Transport</h3>
                <div class="ability-card" style="padding: 15px; background: #222; border: 1px solid #444; border-radius: 4px;">
                    <div class="ability-desc" style="color: #ccc; line-height: 1.5;">${cleanText(unit.transport)}</div>
                </div>
            </section>
            ` : ''}

            ${unit.wahapedia_url ? `
            <div style="text-align: right; margin-top: 20px; font-size: 0.8em; border-top: 1px solid #333; padding-top: 5px;">
                <a href="${unit.wahapedia_url}" target="_blank" style="color: #555; text-decoration: none; font-family: sans-serif;">[Wahapedia]</a>
            </div>` : ''}
        </div>
    `;

    datasheetContainer.innerHTML = html;

    // Render Points with Buttons manually to add listeners
    const pointsContainer = document.getElementById('points-container');
    if (unit.composition && unit.composition.length > 0) {
        unit.composition.forEach(comp => {
            const row = document.createElement('div');
            row.className = 'points-row';

            const info = document.createElement('div');
            info.innerHTML = `<span class="points-desc">${comp.description}</span>`;

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.alignItems = 'center';
            actions.style.gap = '10px';

            const cost = document.createElement('span');
            cost.className = 'points-cost';
            cost.textContent = `${comp.points} pts`;

            const btn = document.createElement('button');
            btn.textContent = '+ Add';
            btn.className = 'btn-add'; // We need to style this
            btn.style.background = 'var(--accent)';
            btn.style.border = 'none';
            btn.style.color = 'black';
            btn.style.fontWeight = 'bold';
            btn.style.padding = '5px 10px';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                addToArmy(unit, comp);
            });

            actions.appendChild(cost);
            actions.appendChild(btn);

            row.appendChild(info);
            row.appendChild(actions);

            pointsContainer.appendChild(row);
        });
    } else {
        pointsContainer.innerHTML = '<div class="points-desc">No points data available</div>';
    }
}

// DEAD CODE REMOVED (removeArmyItem, addUnit)

// Helper to get active weapons based on selected wargear
// Helper to get active weapons based on selected wargear
function getActiveWeapons(item, unit) {
    if (!unit.weapons || unit.weapons.length === 0) return [];

    // 1. Establish Baseline: specific items.
    let activeEquipment = [];

    // Parse the default loadout string from the database (e.g. "Every model is equipped with: balistus grenade launcher; guardian spear.")
    if (unit.loadout) {
        // Remove common prefixes/HTML (fragile but effective for Wahapedia)
        let cleanLoadout = unit.loadout.replace(/<[^>]*>/g, '').toLowerCase(); // Strip tags
        cleanLoadout = cleanLoadout.replace(/every model is equipped with:?/g, '');
        cleanLoadout = cleanLoadout.replace(/this model is equipped with:?/g, '');
        cleanLoadout = cleanLoadout.replace(/the .+? is equipped with:?/g, ''); // e.g. "The Tempestor is equipped with:"

        // Split by ';' (standard Wahapedia) or ',' (fallback)
        // Wahapedia mostly uses ';' for list of items in loadout column
        // Split by ';' (standard Wahapedia) or ',' (fallback)
        // Wahapedia mostly uses ';' for list of items in loadout column
        // FIX: Strip trailing periods from parts to match "Fealty." -> "Fealty"
        const parts = cleanLoadout.split(/[;,]/)
            .map(s => s.trim().replace(/\.$/, '')) // Strip trailing dot
            .filter(s => s.length > 0);
        activeEquipment = parts;
    }

    // 2. Apply Modifications from Selected Wargear
    const wargearDescs = (item.wargear || []).map(w => w.description.toLowerCase());

    wargearDescs.forEach(desc => {
        // Normalize
        const cleanDesc = desc.replace(/’/g, "'");

        // Arrow Syntax Check: "subject -> result" (Standard Wahapedia format)
        if (cleanDesc.includes('->')) {
            const parts = cleanDesc.split('->');
            // Right side is the result (what we are adding)
            let result = parts[1].trim();

            // Clean Result: "1 of the following: 1 melta carbine" -> "melta carbine"
            result = result.replace(/^\d+\s+of\s+the\s+following:\s+/, '');

            // Handle "1 X and 1 Y"
            const addedItems = result.split(/\s+and\s+/).map(s => {
                // Remove leading quantities "1 "
                return s.replace(/^\d+\s+/, '').trim();
            });

            // Add new items to the active list
            // We do NOT remove the source item because in a summary view of a mixed unit, 
            // we likely still have the original weapon on other models.
            // Showing both (e.g. "Guardian Spear, Castellan Axe") is the safest and most accurate representation.
            addedItems.forEach(i => activeEquipment.push(i));
        }
        // Fallback for "Replace X with Y" (older format?)
        else {
            const replaceMatch = cleanDesc.match(/replace (?:its|the|their|that model’s) (.+?) with (.+?)(?:\.|,|;|$)/);
            if (replaceMatch) {
                const toAdd = replaceMatch[2].trim();
                activeEquipment.push(toAdd);
            }
        }
    });

    // 3. Filter Unit Profiles against Active List
    return unit.weapons.filter(weapon => {
        const profileName = weapon.name.toLowerCase();

        // Check if this profile name matches any active equipment item
        // Matching rules:
        // 1. Exact match
        // 2. Partial match (e.g. "Guardian spear (melee)" should match "guardian spear")
        return activeEquipment.some(eq => {
            // Clean equipment name for comparison (remove quantity "2 ")
            const cleanEq = eq.replace(/^\d+\s+/, '');
            return profileName.includes(cleanEq) || cleanEq.includes(profileName);
        });
    });
}

// Play View Logic
async function selectArmyItem(index) {
    if (state.condensedView) {
        // Exit condensed view if checking a specific item via sidebar
        state.condensedView = false;
        datasheetContainer.innerHTML = '<div class="loading">Loading...</div>';
    }
    const item = state.activeList.units[index];
    if (!item) return;

    // Fetch full unit data to get stats/weapons
    try {
        const unit = await dbClient.getUnitDetails(item.unitId);
        if (!unit) {
            console.error('Unit not found:', item.unitId);
            alert('This unit seems to be missing from the database. You may need to remove it from your list.');
            return;
        }
        renderPlayCard(item, unit);
    } catch (err) {
        console.error('Error loading play card:', err);
        alert('Failed to load unit details.');
    }
}



// Helper to clean repeated text
const cleanText = (text) => {
    if (!text) return 'No description available.';
    return text
        .replace(/(ADEPTUS CUSTODES)+/g, 'ADEPTUS CUSTODES ')
        .replace(/(ANATHEMA PSYKANA)+/g, 'ANATHEMA PSYKANA ')
        .replace(/(Aura)+/g, '(Aura) ')
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
};

// Helper to format stratagem text (Shared)
function formatStratagemText(text, darkTheme = true) {
    if (!text) return '';
    const color = darkTheme ? '#fff' : '#000';
    return text
        .replace(/WHEN:/g, `<br><strong style="color:${color};">WHEN:</strong>`)
        .replace(/TARGET:/g, `<br><strong style="color:${color};">TARGET:</strong>`)
        .replace(/EFFECT:/g, `<br><strong style="color:${color};">EFFECT:</strong>`)
        .replace(/RESTRICTIONS:/g, `<br><strong style="color:${color};">RESTRICTIONS:</strong>`)
        .replace(/^<br>/, '');
}

// Helper to render a "Condensed" unit card (Shared between Screen & Print)
function getCondensedUnitHTML(item, unit, options = {}) {
    const {
        isPrint = false,
        isAttached = false,
        attachedToParentName = null
    } = options;

    const stats = (unit.models && unit.models.length > 0)
        ? unit.models[0]
        : { m: '-', t: '-', sv: '-', w: '-', ld: '-', oc: '-', invul: '-' };

    const modelCountMatch = item.description.match(/^(\d+)/);
    const modelCount = modelCountMatch ? modelCountMatch[1] : '?';

    // Weapons
    const weapons = getActiveWeapons(item, unit);

    // Abilities
    const abilityNames = (unit.abilities || [])
        .map(a => `${a.name}${a.parameter ? ' ' + a.parameter : ''}`)
        .join(', ');

    // Styles & Classes
    const cardClass = isPrint
        ? `condensed-card print-card ${isAttached ? 'attached-print-card' : ''}`
        : 'condensed-card';

    const cardStyle = isPrint
        ? (isAttached ? 'border-left: 4px solid var(--accent); background: #f9f9f9 !important;' : '')
        : 'background: #222; border: 1px solid #444; border-radius: 6px; padding: 15px; display: flex; flex-direction: column;';

    // Sub-components

    const attachedLabel = (isPrint && isAttached && attachedToParentName)
        ? `<div style="font-size:0.7em; font-weight:bold; color:black; margin-bottom:4px;">LEADER ATTACHED TO ${attachedToParentName.toUpperCase()}</div>`
        : '';

    const header = isPrint
        ? `<header>
                <div class="card-title">
                    <strong>${item.name}</strong>
                    <span class="model-count">(x${modelCount})</span>
                </div>
                <div class="points">${item.points} pts</div>
           </header>`
        : `<header style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 8px;">
                <div style="display: flex; align-items: baseline; gap: 8px;">
                    <span style="font-weight: bold; font-size: 1.1em; color: #fff;">${item.name}</span>
                    <span style="font-size: 0.9em; color: #888;">(x${modelCount})</span>
                </div>
                <div style="font-weight: bold; color: var(--accent); white-space: nowrap;">${item.points} pts</div>
           </header>`;

    const statRow = isPrint
        ? `<div class="stats-row">
                <span>M: ${stats.m}</span>
                <span>T: ${stats.t}</span>
                <span>SV: ${stats.sv}</span>
                <span>W: ${stats.w}</span>
                <span>LD: ${stats.ld}</span>
                <span>OC: ${stats.oc}</span>
                <span>INV: ${stats.invul}</span>
           </div>`
        : `<div class="stats-grid" style="grid-template-columns: repeat(7, 1fr); gap: 5px; margin-bottom: 20px;">
                <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size: 0.7em;">M</div><div class="stat-value" style="font-size: 0.9em;">${stats.m}</div></div>
                <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size: 0.7em;">T</div><div class="stat-value" style="font-size: 0.9em;">${stats.t}</div></div>
                <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size: 0.7em;">SV</div><div class="stat-value" style="font-size: 0.9em;">${stats.sv}</div></div>
                <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size: 0.7em;">W</div><div class="stat-value" style="font-size: 0.9em;">${stats.w}</div></div>
                <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size: 0.7em;">LD</div><div class="stat-value" style="font-size: 0.9em;">${stats.ld}</div></div>
                <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size: 0.7em;">OC</div><div class="stat-value" style="font-size: 0.9em;">${stats.oc}</div></div>
                <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size: 0.7em;">INV</div><div class="stat-value" style="font-size: 0.9em;">${stats.invul}</div></div>
           </div>`;

    // Weapons Table
    let weaponsHTML = '';
    if (isPrint) {
        weaponsHTML = `<div class="weapons-list">
            ${weapons.map(w => `
                <div class="weapon-row">
                    <span class="w-name">${w.name}</span>
                    <span class="w-stats">${w.range} | A:${w.attacks} | BS:${w.skill} | S:${w.strength} | AP:${w.ap} | D:${w.damage}</span>
                </div>
            `).join('')}
        </div>`;
    } else {
        weaponsHTML = `<div style="margin-bottom: 10px;">
            <table class="weapons-table" style="width:100%; font-size:0.85em; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom:1px solid #444; color:#aaa; text-align:left;">
                        <th style="padding:4px;">Weapon</th>
                        <th style="padding:4px;">R</th>
                        <th style="padding:4px;">A</th>
                        <th style="padding:4px;">BS</th>
                        <th style="padding:4px;">S</th>
                        <th style="padding:4px;">AP</th>
                        <th style="padding:4px;">D</th>
                    </tr>
                </thead>
                <tbody>
                    ${weapons.length > 0 ? weapons.map(w => `
                        <tr style="border-bottom:1px solid #333;">
                            <td style="padding:4px; color:#fff;">
                                <div>${w.name}</div>
                                ${w.keywords ? `<div style="font-size:0.8em; color:#888;">${w.keywords}</div>` : ''}
                            </td>
                            <td style="padding:4px; color:#ccc;">${w.range}</td>
                            <td style="padding:4px; color:#ccc;">${w.attacks}</td>
                            <td style="padding:4px; color:#ccc;">${w.skill}</td>
                            <td style="padding:4px; color:#ccc;">${w.strength}</td>
                            <td style="padding:4px; color:#ccc;">${w.ap}</td>
                            <td style="padding:4px; color:#ccc;">${w.damage}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="7" style="padding:4px; color:#777; font-style:italic;">No weapons active</td></tr>'}
                </tbody>
            </table>
        </div>`;
    }

    // Wargear / Options
    let wargearHTML = '';
    if (item.wargear && item.wargear.length > 0) {
        if (isPrint) {
            wargearHTML = `<div style="font-size: 0.85em; color: #222; margin-top: 5px; font-style:italic;">
                <strong style="color:#000;">Options:</strong> ${formatWargearList(item.wargear).join(', ')}
            </div>`;
        } else {
            wargearHTML = `<div style="margin-bottom: 10px; font-size: 0.9em; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px;">
                <strong style="color: #aaa; font-size: 0.8em; text-transform: uppercase;">Options</strong>
                <div style="color: #fff; margin-top: 2px;">
                    ${formatWargearList(item.wargear).join(', ')}
                </div>
            </div>`;
        }
    }

    // Abilities & Transport
    let abilitiesHTML = '';
    if (isPrint) {
        abilitiesHTML = `<div class="abilities-list"><em>${abilityNames}</em></div>`;
    } else {
        abilitiesHTML = `<div style="margin-top: auto;">
            <strong style="color: #aaa; font-size: 0.8em; display: block; margin-bottom: 4px; text-transform: uppercase;">Abilities</strong>
            <div style="font-size: 0.9em; color: #d0d0d0; font-style: italic;">${abilityNames || 'None'}</div>
        </div>`;

        if (unit.transport) {
            abilitiesHTML += `<div style="margin-top: 10px; border-top: 1px solid #333; padding-top: 8px;">
                <strong style="color: #aaa; font-size: 0.8em; display: block; margin-bottom: 4px; text-transform: uppercase;">Transport</strong>
                <div style="font-size: 0.85em; color: #ccc; line-height: 1.4;">${truncate(cleanText(unit.transport), 150)}</div>
            </div>`;
        }
    }

    return `
        <div class="${cardClass}" style="${cardStyle}">
            ${attachedLabel}
            ${header}
            ${statRow}
            ${weaponsHTML}
            ${wargearHTML}
            ${abilitiesHTML}
        </div>
    `;
}

function getPlayCardHTML(item, unit, options = {}) {
    const { forceExpanded = false } = options;
    const detailAttr = forceExpanded ? 'open' : '';

    // 0. Prepare Stratagems
    const currentDetachment = state.activeList ? state.activeList.detachment : null;
    let stratagemsHtml = '';

    if (!options.hideStratagems && state.stratagems && state.stratagems.length > 0 && currentDetachment) {
        const validStrats = state.stratagems.filter(s => {
            const d = (s.detachment || '').toLowerCase();
            const target = currentDetachment.toLowerCase();
            return d === 'core' || d === target;
        });

        if (validStrats.length > 0) {
            // formatStratagemText is now a helper function


            stratagemsHtml = `
            <div class="play-section" style="margin-top: 30px; border-top: 1px solid #444; padding-top: 20px;">
                <h3 class="section-title">Stratagems (${currentDetachment})</h3>
                <div class="stratagem-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; align-items: start;">
                    ${validStrats.map(s => `
                        <details ${detailAttr} style="background: #222; border: 1px solid #444; border-radius: 4px; padding: 12px; display: flex; flex-direction: column;">
                            <summary style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                                <div style="font-weight: bold; color: #fff;">${s.name}</div>
                                <div style="font-weight: bold; color: #aaa; font-size: 0.9em;">${s.cp_cost} CP</div>
                            </summary>
                            <div style="margin-top: 8px; font-size: 0.9em; border-top: 1px solid #444; padding-top: 8px;">
                                <em style="color:#888; display:block; margin-bottom:4px;">${s.type}</em>
                                <div style="font-size: 0.9em; color: #ccc; line-height: 1.4;">
                                    ${formatStratagemText(s.description)}
                                </div>
                            </div>
                        </details>
                    `).join('')}
                </div>
            </div>
            `;
        }
    }

    // 1. Filter Weapons
    const activeWeapons = getActiveWeapons(item, unit);

    // 2. Format Enhancements
    const enhancementHtml = item.enhancements && item.enhancements.length > 0
        ? `
        <div class="play-section">
            <h3>Enhancements</h3>
            ${item.enhancements.map(e => `
                <div class="play-enhancement">
                    <div class="enh-header">${e.name} <span class="enh-points">${e.points} pts</span></div>
                    <div class="enh-desc">${cleanText(e.description)}</div>
                </div>
            `).join('')}
        </div>`
        : '';

    // Use first model for stats (multimodel units usually share stats, or we display first)
    const stats = (unit.models && unit.models.length > 0) ? unit.models[0] : { m: '-', t: '-', sv: '-', w: '-', ld: '-', oc: '-' };

    return `
        <div class="datasheet play-card animate-fade-in">
            <header class="ds-header play-header">
                <div>
                    <h2>${item.name.split('(')[0]}</h2>
                    <div class="ds-keywords">${unit.keywords}</div>
                </div>
                <div class="play-points">${item.points} pts</div>
            </header>

            <div class="stats-grid">
                <div class="stat-box"><div class="stat-label">M</div><div class="stat-value">${stats.m}</div></div>
                <div class="stat-box"><div class="stat-label">T</div><div class="stat-value">${stats.t}</div></div>
                <div class="stat-box"><div class="stat-label">SV</div><div class="stat-value">${stats.sv}</div></div>
                <div class="stat-box"><div class="stat-label">W</div><div class="stat-value">${stats.w}</div></div>
                <div class="stat-box"><div class="stat-label">LD</div><div class="stat-value">${stats.ld}</div></div>
                <div class="stat-box"><div class="stat-label">OC</div><div class="stat-value">${stats.oc}</div></div>
                <div class="stat-box"><div class="stat-label">INV</div><div class="stat-value">${stats.invul}</div></div>
            </div>

            <div class="play-section">
                <h3>Active Loadout</h3>
                ${item.wargear && item.wargear.length > 0 ?
            `<div style="margin-bottom: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                        <strong style="color:var(--accent); display:block; margin-bottom:5px;">Selected Options:</strong>
                        <ul style="margin:0; padding-left:20px; color:#ccc;">
                            ${formatWargearList(item.wargear).map(s => `<li>${s}</li>`).join('')}
                        </ul>
                     </div>` : ''
        }
                ${unit.loadout ? `<div style="margin-bottom: 10px; font-style: italic; color: #aaa; font-size: 0.9em;">${unit.loadout.replace(/<b>/g, '').replace(/<\/b>/g, '')}</div>` : ''}
                <table class="weapons-table">
                    <thead>
                        <tr>
                            <th>Weapon</th>
                            <th>Range</th>
                            <th>A</th>
                            <th>BS/WS</th>
                            <th>S</th>
                            <th>AP</th>
                            <th>D</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activeWeapons.length > 0 ? activeWeapons.map(w => `
                            <tr>
                                <td>
                                    <div class="weapon-name">${w.name}</div>
                                    ${w.keywords && w.keywords !== 'undefined' && w.keywords.length > 0 ? `<div class="weapon-keywords">${w.keywords}</div>` : ''}
                                </td>
                                <td>${w.range}</td>
                                <td>${w.attacks}</td>
                                <td>${w.skill}</td>
                                <td>${w.strength}</td>
                                <td>${w.ap}</td>
                                <td>${w.damage}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="7" style="text-align:center; color:#888;">No weapons equipped? Check Wargear options.</td></tr>'}
                    </tbody>
                </table>
            </div>

            ${unit.abilities && unit.abilities.length > 0 ? (() => {
            const tagTypes = ['Core', 'Faction'];
            const isLeader = (name) => name && name.trim().toUpperCase() === 'LEADER';
            // Leader is technically Core but we want to show its full text (attachment info)
            const tags = unit.abilities.filter(a => tagTypes.includes(a.type) && !isLeader(a.name));
            const others = unit.abilities.filter(a => !tagTypes.includes(a.type) || isLeader(a.name));

            return `
                <div class="play-section">
                    <h3>Abilities</h3>
                    
                    ${tags.length > 0 ? `
                    <div class="ability-tags" style="margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
                        ${tags.map(a => `<span class="ability-tag ${a.type.toLowerCase()}">${a.name}${a.parameter ? ` ${a.parameter}` : ''}</span>`).join('')}
                    </div>` : ''}

                    ${others.map(a => `
                        <details ${detailAttr} class="play-ability">
                            <summary class="play-ability-header">
                                <span class="ability-name">${a.name}${a.parameter ? ` ${a.parameter}` : ''}</span>
                            </summary>
                            <div class="ability-desc">
                            <div class="ability-desc">
                                ${(() => {
                    if (isLeader(a.name)) {
                        const hasHead = !!unit.leader_head;
                        const hasFooter = !!unit.leader_footer;

                        let content = `
                                            <div class="leader-info">
                                                ${hasHead ? `<div class="leader-head">${cleanText(unit.leader_head)}</div>` : ''}
                                                ${hasFooter ? `<div class="leader-footer" style="margin-top: 8px; font-style: italic;">${cleanText(unit.leader_footer)}</div>` : ''}
                                            </div>`;

                        if ((!hasHead || !hasFooter) && unit.wahapedia_url) {
                            content += `
                                                <div style="margin-top: 10px;">
                                                    <a href="${unit.wahapedia_url}" target="_blank" style="color: var(--accent); text-decoration: underline;">
                                                        See full rules on Wahapedia
                                                    </a>
                                                </div>`;
                        }

                        if (hasHead || hasFooter || unit.wahapedia_url) {
                            return content;
                        }
                        return cleanText(a.description); // Fallback
                    }
                    return cleanText(a.description);
                })()}
                            </div>
                            </div>
                        </details>
                    `).join('')}
                </div>`;
        })() : ''}

            ${/* Transport Rules */ unit.transport ? `
            <div class="play-section">
                <h3>Transport</h3>
                <div class="play-ability" style="padding: 10px; border: 1px solid #444; background: #222; border-radius: 4px;">
                    <div class="ability-desc" style="color: #ccc;">${cleanText(unit.transport)}</div>
                </div>
            </div>` : ''}

            ${enhancementHtml}

            ${stratagemsHtml}

            ${unit.wahapedia_url ? `
            <div style="text-align: right; margin-top: 15px; font-size: 0.75em;">
                <a href="${unit.wahapedia_url}" target="_blank" style="color: #444; text-decoration: none;">[Wahapedia]</a>
            </div>` : ''}
        </div>
    `;
}

function renderPlayCard(item, unit) {
    datasheetContainer.innerHTML = getPlayCardHTML(item, unit);
}

// Print Functionality
async function printArmy() {
    if (!state.activeList || state.activeList.units.length === 0) {
        alert('Army list is empty!');
        return;
    }

    // Create print container if not exists
    let printContainer = document.getElementById('print-container');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-container';
        document.body.appendChild(printContainer);
    }

    // Fetch full unit data
    const units = state.activeList.units;
    const promises = units.map(item => dbClient.getUnitDetails(item.unitId));

    // Fetch Rules Data concurrently
    const rulesPromise = dbClient.getRules(state.activeList.factionUrl);
    const detachmentsPromise = dbClient.getDetachments(state.activeList.factionUrl);

    const [fullUnits, armyRulesData, detachmentsData] = await Promise.all([
        Promise.all(promises),
        rulesPromise,
        detachmentsPromise
    ]);

    const totalPoints = state.activeList.points;
    const unitCount = units.length;

    let html = `
        <div class="print-header">
            <h1>${state.activeList.name}</h1>
            <div class="print-meta">
                <span>${state.activeList.faction.name}</span>
                <span>${state.activeList.detachment}</span>
                <span>${document.getElementById('total-points').innerText} pts</span>
                <span>${units.length} units</span>
            </div>
        </div>

        <div class="print-section">
            <h2>Army Summary</h2>
            <div class="condensed-grid">
    `;

    // Exclude Attached units from the main stream, they will be handled by their "parent"
    const organizedUnits = [];
    const attachedMap = {};

    // 1. Map attachments
    units.forEach(u => {
        if (u.attachedTo) {
            if (!attachedMap[u.attachedTo]) attachedMap[u.attachedTo] = [];
            attachedMap[u.attachedTo].push(u);
        }
    });

    // 2. Build ordered list
    units.forEach(u => {
        if (!u.attachedTo) {
            organizedUnits.push(u);
            if (attachedMap[u.id]) {
                attachedMap[u.id].forEach(attached => organizedUnits.push(attached));
            }
        }
    });

    // Use organizedUnits instead of units for rendering
    html += organizedUnits.map((item, i) => {
        const originalIndex = units.findIndex(u => u.unitId === item.unitId);
        const unit = fullUnits[originalIndex];

        const isAttached = !!item.attachedTo;
        let attachedToParentName = null;
        if (isAttached) {
            const parent = units.find(u => u.id === item.attachedTo);
            attachedToParentName = parent ? parent.name : 'Unit';
        }

        return getCondensedUnitHTML(item, unit, {
            isPrint: true,
            isAttached,
            attachedToParentName
        });
    }).join('');

    html += `
            </div>
        </div>
        <div class="page-break"></div>
        <div class="print-section expanded-print">
            <h2>Unit Datasheets</h2>
    `;

    // 2. Render Expanded Body (Details)
    html += units.map((item, i) => {
        const unit = fullUnits[i];
        return `<div class="print-datasheet">${getPlayCardHTML(item, unit, { forceExpanded: true, hideStratagems: true })}</div>`;
    }).join('');

    html += `</div>`;

    // 3. Render Stratagems Section (Centralized)
    const currentDetachment = state.activeList ? state.activeList.detachment : null;
    if (state.stratagems && state.stratagems.length > 0 && currentDetachment) {
        const validStrats = state.stratagems.filter(s => {
            const d = (s.detachment || '').toLowerCase();
            const target = currentDetachment.toLowerCase();
            return d === 'core' || d === target;
        });

        if (validStrats.length > 0) {
            // formatStratagemText is shared helper now


            html += `
            <div class="page-break"></div>
            <div class="print-section expanded-print">
                <h2>Army Stratagems (${currentDetachment})</h2>
                <div class="stratagem-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: start;">
                    ${validStrats.map(s => `
                        <div style="border: 1px solid #000; padding: 10px; page-break-inside: avoid;">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px;">
                                <strong style="font-size: 1.1em;">${s.name}</strong>
                                <strong style="font-size: 0.9em; background: #000; color: #fff; padding: 2px 6px; border-radius: 4px;">${s.cp_cost} CP</strong>
                            </div>
                            <em style="color:#444; display:block; margin-bottom:4px; font-size: 0.9em;">${s.type}</em>
                            <div style="font-size: 0.9em; line-height: 1.4;">
                                ${formatStratagemText(s.description)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
    }

    // 4. Render Army & Detachment Rules (Print View)
    // Find current detachment data
    let printDetachmentRules = [];
    if (currentDetachment && detachmentsData) {
        const det = detachmentsData.find(d => d.name === currentDetachment);
        if (det && det.abilities) {
            printDetachmentRules = det.abilities;
        }
    }

    if (printDetachmentRules.length > 0 || armyRulesData.length > 0) {
        html += `
            <div class="page-break"></div>
            <div class="print-section expanded-print">
                <h2>Army & Detachment Rules</h2>
                
                ${printDetachmentRules.length > 0 ? `
                    <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px; margin-top: 20px;">${currentDetachment} Rules</h3>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 15px;">
                        ${printDetachmentRules.map(r => `
                            <div style="border: 1px solid #000; padding: 10px; page-break-inside: avoid;">
                                <strong style="display:block; font-size: 1.1em; border-bottom: 1px solid #ccc; margin-bottom: 5px;">${r.name}</strong>
                                <div style="font-size: 0.9em; line-height: 1.4;">${r.description}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${armyRulesData.length > 0 ? `
                    <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px; margin-top: 30px;">${state.activeList.faction} Rules</h3>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 15px;">
                        ${armyRulesData.map(r => `
                            <div style="border: 1px solid #000; padding: 10px; page-break-inside: avoid;">
                                <strong style="display:block; font-size: 1.1em; border-bottom: 1px solid #ccc; margin-bottom: 5px;">${r.name}</strong>
                                <div style="font-size: 0.9em; line-height: 1.4;">${r.description}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    printContainer.innerHTML = html;
    window.print();
}

function switchTab(tab) {
    if (tab === 'units') {
        tabUnits.classList.add('active');
        tabArmy.classList.remove('active');
        viewUnits.style.display = 'flex';
        viewArmy.style.display = 'none';
    } else {
        tabUnits.classList.remove('active');
        tabArmy.classList.add('active');
        viewUnits.style.display = 'none';
        viewArmy.style.display = 'flex';
        renderArmyList();
    }
}

// Add event listeners for tabs
tabUnits.addEventListener('click', () => switchTab('units'));
tabArmy.addEventListener('click', () => switchTab('army'));

async function toggleCondensedView() {
    state.condensedView = !state.condensedView;
    if (state.condensedView) {
        await renderCondensedArmy();
    } else {
        // Show placeholder or nothing
        datasheetContainer.innerHTML = '<div class="placeholder-message">Select a unit to view its datasheet</div>';
    }
}

async function renderCondensedArmy() {
    datasheetContainer.innerHTML = '<div class="loading">Loading army overview...</div>';

    try {
        // Fetch details for all units
        const units = state.activeList.units;
        if (units.length === 0) {
            datasheetContainer.innerHTML = '<div class="placeholder-message">Your army is empty!</div>';
            return;
        }

        const promises = units.map(item => dbClient.getUnitDetails(item.unitId));
        const fullUnits = await Promise.all(promises);

        const html = `
            <div class="condensed-view animate-fade-in" style="padding: 20px;">
                <h2 style="margin-bottom: 20px; border-bottom: 1px solid #444; padding-bottom: 10px;">Army Overview</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
                    ${units.map((item, i) => {
            const unit = fullUnits[i];
            return getCondensedUnitHTML(item, unit, { isPrint: false });
        }).join('')}
                </div>
            </div>
        `;

        datasheetContainer.innerHTML = html;
    } catch (err) {
        console.error('Error rendering condensed view:', err);
        datasheetContainer.innerHTML = '<div class="error">Failed to load army overview.</div>';
    }
}

async function showRulesOverlay() {
    const list = state.activeList;
    if (!list) return;

    // Fetch Army Rules
    let armyRules = [];
    try {
        armyRules = await dbClient.getRules(list.factionUrl);
    } catch (e) {
        console.error('Failed to load army rules', e);
    }

    // Get current Detachment Rules
    let detachmentRules = [];
    let detachmentName = list.detachment || 'None Selected';

    if (list.detachment) {
        const det = state.detachments.find(d => d.name === list.detachment);
        if (det && det.abilities) {
            detachmentRules = det.abilities;
        }
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    // Use inline styles to ensure it looks good even if CSS is minimal
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';

    modal.innerHTML = `
        <div class="modal-content animate-scale-in" style="max-width: 800px; max-height: 90vh; overflow-y: auto; background: #222; border: 1px solid #444; padding: 20px; border-radius: 8px; width: 90%;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                <h2 style="margin:0; color:var(--accent);">Army Rules</h2>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn-text" style="font-size: 1.5em; line-height: 1; color: #fff; background:none; border:none; cursor:pointer;">&times;</button>
            </div>

            <div class="rules-section">
                <h3 style="border-bottom: 1px solid #444; padding-bottom: 5px; color: var(--accent);">Detachment: ${detachmentName}</h3>
                
                ${detachmentRules.length > 0 ? detachmentRules.map(r => `
                    <div class="rule-card" style="background: #2a2a2a; border: 1px solid #444; margin-bottom: 10px; padding: 15px; border-radius: 4px;">
                        <h4 style="margin: 0 0 10px 0; color: #fff;">${r.name}</h4>
                        <div class="rule-text" style="color: #ddd; line-height: 1.5; font-size: 0.95em;">${r.description}</div>
                    </div>
                `).join('') : (
            list.detachment ? '<div style="color: #888;">No specific rules text available for this detachment.</div>' : '<div style="color: #888;">Select a detachment to view its rules.</div>'
        )}
            </div>

            <div class="rules-section" style="margin-top: 30px;">
                <h3 style="border-bottom: 1px solid #444; padding-bottom: 5px; color: var(--accent); margin-top:0;">${list.faction} Rules</h3>
                ${armyRules.length > 0 ? armyRules.map(r => `
                    <div class="rule-card" style="background: #2a2a2a; border: 1px solid #444; margin-bottom: 10px; padding: 15px; border-radius: 4px;">
                        <h4 style="margin: 0 0 10px 0; color: #fff;">${r.name}</h4>
                        <div class="rule-text" style="color: #ddd; line-height: 1.5; font-size: 0.95em;">${r.description}</div>
                    </div>
                `).join('') : '<div style="color: #888;">No army rules found.</div>'}
            </div>

            <div class="modal-actions" style="margin-top: 20px; display:flex; justify-content: flex-end;">
                <button onclick="this.closest('.modal-overlay').remove()" class="btn-primary">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

init();
