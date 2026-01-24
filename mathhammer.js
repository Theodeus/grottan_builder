
// Mathhammer Analysis Module
// Calculates average damage against standard defensive profiles

// --- Constants ---

export const DEFENSIVE_PROFILES = [
    { name: "GEQ (Guard Equivalent)", t: 3, sv: 5, w: 1, inv: 7, desc: "T3  5+  1W" },
    { name: "MEQ (Marine Equivalent)", t: 4, sv: 3, w: 2, inv: 7, desc: "T4  3+  2W" },
    { name: "TEQ (Terminator Equivalent)", t: 5, sv: 2, w: 3, inv: 4, desc: "T5  2+/4++  3W" },
    { name: "VEQ (Vehicle Equivalent)", t: 10, sv: 3, w: 12, inv: 7, desc: "T10  3+  12W" },
    { name: "KEQ (Knight Equivalent)", t: 12, sv: 3, w: 22, inv: 5, desc: "T12  3+/5++  22W" }
];

// --- Helpers ---

// Parse "3+" -> 3
function parseTargetVal(val) {
    if (typeof val === 'number') return val;
    if (!val) return 7; // Null save = 7+ (impossible on D6)
    const match = val.toString().match(/(\d+)/);
    return match ? parseInt(match[1]) : 7;
}

// Parse "D6+1" -> Average
function parseDiceAverage(str) {
    if (!str) return 0;
    const s = str.toString().toUpperCase().replace(/\s/g, '');

    // Fixed damage "2"
    if (/^\d+$/.test(s)) return parseInt(s);

    // D3
    if (s === 'D3') return 2;


    // D6
    // Simple parser for N*D6 + M
    let d6Count = 0;
    let d3Count = 0;
    let flat = 0;

    // Split by +
    const parts = s.split('+');
    parts.forEach(p => {
        if (p.includes('D6')) {
            const count = parseInt(p.split('D6')[0]) || 1;
            d6Count += count;
        } else if (p.includes('D3')) {
            const count = parseInt(p.split('D3')[0]) || 1;
            d3Count += count;
        } else {
            flat += parseInt(p) || 0;
        }
    });

    return (d6Count * 3.5) + (d3Count * 2) + flat;
}

// --- Core Math ---

export function calculateDamage(weapon, target) {
    console.group(weapon.name + " vs " + target.name);
    // 1. Stats
    let A = parseDiceAverage(weapon.attacks);
    const BS = parseTargetVal(weapon.skill); // 3+ -> 3
    const S = parseInt(weapon.strength) || 0;
    const AP = Math.abs(parseInt(weapon.ap) || 0); // usage: Save + AP
    const D = parseDiceAverage(weapon.damage);
    const keywords = (weapon.keywords || "").toUpperCase();
    console.log(weapon.name, "A", A, "BS", BS, "S", S, "AP", AP, "D", D, "keywords", keywords);

    // 2. Modifiers (Keywords)
    const isTorrent = keywords.includes("TORRENT");
    const isLethal = keywords.includes("LETHAL HITS");
    let sustainedVal = 0;
    if (keywords.includes("SUSTAINED HITS")) {
        const match = keywords.match(/SUSTAINED HITS (\d+)/);
        sustainedVal = match ? parseInt(match[1]) : 1;
    }

    const isTwinLinked = keywords.includes("TWIN-LINKED");
    const isDevastating = keywords.includes("DEVASTATING WOUNDS");

    // 3. Hit Sequence
    let hitProb = 0;
    let critHitProb = 1 / 6;

    if (isTorrent) {
        hitProb = 1.0;
        critHitProb = 0; // Torrents don't roll to hit, so no crits (usually)
    } else {
        hitProb = (7 - BS) / 6;
        if (hitProb > 5 / 6) hitProb = 5 / 6; // Cap at 2+
        if (hitProb < 1 / 6) hitProb = 1 / 6; // Cap at 6+
    }

    console.log("hit and crit prob", hitProb, critHitProb);

    // Apply Sustained (Extra hits on 6s)
    // Avg Hits = Attacks * (HitRate + (SustainedVal * CritRate))
    // Note: Torrents don't crit.
    let effectiveHits = A * hitProb;
    let autoWounds = 0;

    if (!isTorrent) {
        effectiveHits += (A * critHitProb * sustainedVal);

        // Lethal Hits (Crits auto-wound)
        if (isLethal) {
            autoWounds = A * critHitProb;
            effectiveHits -= autoWounds; // These hits skip wound roll
        }
    }
    console.log("effectiveHits", effectiveHits);

    // 4. Wound Sequence
    // Strength vs Toughness
    let woundTarget = 4;
    if (S >= target.t * 2) woundTarget = 2;
    else if (S > target.t) woundTarget = 3;
    else if (S === target.t) woundTarget = 4;
    else if (S * 2 <= target.t) woundTarget = 6;
    else woundTarget = 5; // S < T

    let woundProb = (7 - woundTarget) / 6;

    // Twin-Linked (Re-roll wounds)
    // P_fail = 1 - P
    // P_success_reroll = P + (1-P)*P
    if (isTwinLinked) {
        woundProb = woundProb + ((1 - woundProb) * woundProb);
    }

    console.log("woundProb", woundProb);

    // Apply Wounds
    // Regular Wounds
    let successfulWounds = effectiveHits * woundProb;

    // Add Lethals (which bypassed rolling)
    let totalWounds = successfulWounds + autoWounds;

    console.log("successfulWounds", successfulWounds);
    console.log("autoWounds", autoWounds);

    // Devastating Wounds (6s to Wound bypass saves becomes MW)
    // How many of the SUCCESSFUL wounds were Critical Wounds?
    // Crit Wound Rate = 1/6.
    // BUT Twin Linked complicates this.
    // Base 6s: effectiveHits * (1/6)
    // Rerolled 6s: effectiveHits * (5/6) * (1/6)
    // Total Crits = effectiveHits * (1/6 + 5/36) = effectiveHits * (11/36) approx 30%
    let critWoundProb = 1 / 6;
    if (isTwinLinked) critWoundProb = 11 / 36;

    let devWounds = 0;
    if (isDevastating) {
        // Devastating converts Crit Wounds into Mortal Wounds (Damage spills over? No, just bypasses saves)
        // In 10th, Dev Wounds = Mortal Wounds, terminate sequence. 
        // Update Jan 2024: Dev Wounds are NOT Mortal Wounds anymore (no spill), just Ignore Invuln/Save.
        // Wait, Dataslate says Dev Wounds = "Ignores all saves". No spill.

        // So they are just unsaveable wounds.
        devWounds = effectiveHits * critWoundProb;
        totalWounds -= devWounds; // Separate bucket
    }

    console.log("totalWounds", totalWounds);
    console.log("devWounds", devWounds);

    // 5. Save Sequence
    // AP modifies Save (Sv + AP).
    // Compare vs Invuln. Use best.
    let modifiedSave = target.sv + AP;
    let finalSave = modifiedSave;

    // Use Invuln if better
    if (target.inv && target.inv < 7) {
        if (target.inv < finalSave) finalSave = target.inv;
    }

    // Save Probability (Success)
    // e.g. 3+ Save -> 4/6 to save.
    let saveProb = 0;
    if (finalSave <= 6) {
        saveProb = (7 - finalSave) / 6;
    }
    // Cap: A save of 7+ is 0%. A save of 2+ is 5/6. (1 always fails)
    if (saveProb > 5 / 6) saveProb = 5 / 6; // Natural 1 fails
    if (saveProb < 0) saveProb = 0;

    let failProb = 1 - saveProb;

    console.log("saveProb", saveProb);
    console.log("failProb", failProb);

    // 6. Damage Calculation
    // Regular Wounds * Fail Rate
    let woundsThroughSaves = totalWounds * failProb;

    // Devastating Wounds (Bypass Saves)
    // They deal damage directly.
    let woundsFromDev = devWounds; // 100% fail rate for saves

    let totalUnsavesWounds = woundsThroughSaves + woundsFromDev;

    let avgDamage = totalUnsavesWounds * D;

    console.log("woundsThroughSaves", woundsThroughSaves);
    console.log("woundsFromDev", woundsFromDev);
    console.log("totalUnsavesWounds", totalUnsavesWounds);
    console.log("avgDamage", avgDamage);

    // Models Slain Calculation
    // Cap Damage at Target Wounds (no spill over)
    const effectiveD = (D > target.w) ? target.w : D;
    const modelsSlain = totalUnsavesWounds * (effectiveD / target.w);
    console.groupEnd(weapon.name + " vs " + target.name);
    return {
        hits: effectiveHits + autoWounds,
        wounds: totalWounds + devWounds,
        unsaved: totalUnsavesWounds,
        damage: avgDamage,
        modelsSlain: modelsSlain
    };
}

// --- Aggregator ---

// Needs resolveLoadoutCounts helper or pre-resolved counts
// We will pass the `units` array which is cleaner, but we need the App's resolution logic.
// Simpler: The App should pass the "Active Profiles" it already calculated for the stats view!
// But `renderAnalysisView` does that internally.
// We can duplicate the resolution call or share it. 
// Let's assume WE receive the fully resolved list of weapon profiles with counts.

export function calculateArmyMatchups(unitStats) {
    // unitStats should be an array of: { name: "Unit A", profiles: [ {name, count, ...weaponStats} ] }
    // Wait, `unitStats` in app.js is slightly different.
    // Let's just take the raw units and re-resolve? Or pass the resolved structure.

    // Let's design the API to take the output of the App's processing loop if possible.
    // App's loop resolves weapons.
    // Let's make this function take a single processed unit if we want, or the whole list.

    // Design: accept [{name: "Unit A", weapons: [...]}] 
    // where weapons is the list of active profiles with counts.

    const matchups = DEFENSIVE_PROFILES.map(profile => {
        let totalDamage = 0;
        let totalUnsaved = 0;
        let totalModelsSlain = 0;

        // New Split Stats
        let totalMeleeDamage = 0;
        let totalMeleeSlain = 0;
        let totalMeleeHits = 0;
        let totalMeleeNames = [];

        let totalRangedDamage = 0;
        let totalRangedSlain = 0;
        let totalRangedHits = 0;
        let totalRangedNames = [];

        unitStats.forEach(unit => {
            // Per-Unit Accumulators
            let unitMelee = { damage: 0, modelsSlain: 0, hits: 0, names: [] };
            let unitRanged = { damage: 0, modelsSlain: 0, hits: 0, names: [] };
            let unitPistol = { damage: 0, modelsSlain: 0, hits: 0, names: [] };

            // Group weapons by Base Name to handle profiles (Strike/Sweep)
            const weaponGroups = {};

            unit.weapons.forEach(weapon => {
                // Heuristic: Split by " – " (En dash) or " - " (Hyphen)
                const baseName = weapon.name.split(/\s+[–-]\s+/)[0].trim();

                if (!weaponGroups[baseName]) weaponGroups[baseName] = [];
                weaponGroups[baseName].push(weapon);
            });

            // Process each group: Select BEST profile against this target
            Object.values(weaponGroups).forEach(group => {
                // Calculate stats for all profiles in the group
                const results = group.map(weapon => {
                    const result = calculateDamage(weapon, profile);
                    const count = weapon.count || 1;

                    // Determine Type
                    const isMelee = (weapon.range === 'Melee' || weapon.type === 'Melee' || (weapon.keywords && weapon.keywords.toUpperCase().includes('MELEE')));
                    const isPistol = (weapon.keywords && weapon.keywords.toUpperCase().includes('PISTOL'));
                    const type = isMelee ? 'Melee' : 'Ranged';

                    return {
                        dmg: result.damage * count,
                        unsaved: result.unsaved * count,
                        modelsSlain: result.modelsSlain * count,
                        hits: result.hits * count,
                        type: type,
                        isPistol: isPistol,
                        name: weapon.name
                    };
                });

                // Split into Melee and Ranged candidates
                // Melee and Ranged are additive (used in different phases), so we shouldn't force a choice between them.
                // However, profiles WITHIN a category (e.g. Strike vs Sweep) ARE mutually exclusive.
                const meleeCandidates = results.filter(r => r.type === 'Melee');
                const rangedCandidates = results.filter(r => r.type !== 'Melee');

                const processCandidates = (candidates) => {
                    if (candidates.length === 0) return;

                    // Find max damage/slain
                    const best = candidates.reduce((max, current) => {
                        // Precision for float comparison
                        if (Math.abs(current.modelsSlain - max.modelsSlain) > 0.1) {
                            return current.modelsSlain > max.modelsSlain ? current : max;
                        }
                        return current.dmg > max.dmg ? current : max;
                    }, { dmg: -1, unsaved: 0, modelsSlain: -1, hits: 0, type: 'Unknown', isPistol: false });

                    if (best.dmg >= 0) {
                        if (best.type === 'Melee') {
                            unitMelee.damage += best.dmg;
                            unitMelee.modelsSlain += best.modelsSlain;
                            unitMelee.hits += best.hits;
                            unitMelee.names.push(best.name);
                        } else if (best.isPistol) {
                            unitPistol.damage += best.dmg;
                            unitPistol.modelsSlain += best.modelsSlain;
                            unitPistol.hits += best.hits;
                            unitPistol.names.push(best.name);
                        } else {
                            unitRanged.damage += best.dmg;
                            unitRanged.modelsSlain += best.modelsSlain;
                            unitRanged.hits += best.hits;
                            unitRanged.names.push(best.name);
                        }
                    }
                };

                processCandidates(meleeCandidates);
                processCandidates(rangedCandidates);
            });

            // Resolve Ranged (Pistol vs Other)
            // Rule: Shoot with all Non-Pistols OR all Pistols.
            // Assumption: Unit-wide selection.
            const pistolBetter = unitPistol.damage > unitRanged.damage;
            const finalRanged = pistolBetter ? unitPistol : unitRanged;

            totalMeleeDamage += unitMelee.damage;
            totalMeleeSlain += unitMelee.modelsSlain;
            totalMeleeHits += unitMelee.hits;
            totalMeleeNames.push(...unitMelee.names);

            totalRangedDamage += finalRanged.damage;
            totalRangedSlain += finalRanged.modelsSlain;
            totalRangedHits += finalRanged.hits;
            totalRangedNames.push(...finalRanged.names);

            totalDamage += (unitMelee.damage + finalRanged.damage);
            totalUnsaved += 0; // Deprecated/Complex to sum unsaved with different profiles
            totalModelsSlain += (unitMelee.modelsSlain + finalRanged.modelsSlain);
        });

        return {
            profile: profile,
            totalDamage: totalDamage,
            totalModelsSlain: totalModelsSlain,
            split: {
                melee: { damage: totalMeleeDamage, slain: totalMeleeSlain, hits: totalMeleeHits, names: [...new Set(totalMeleeNames)] },
                ranged: { damage: totalRangedDamage, slain: totalRangedSlain, hits: totalRangedHits, names: [...new Set(totalRangedNames)] }
            }
        };
    });

    return matchups;
}
