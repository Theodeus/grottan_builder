
// Core Stratagems (Hardcoded mirror from server.js)
const CORE_STRATAGEMS = [
    {
        name: 'Command Re-roll',
        type: 'Core Stratagem - Battle Tactic Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Any phase, just after you make an Advance roll, a Charge roll, a Desperate Escape test or a Hazardous test for a unit from your army, or a Hit roll, a Wound roll, a Damage roll or a saving throw for a model in that unit, or a roll to determine the number of attacks made with a weapon equipped by a model in that unit. If you are using fast dice rolling, this Stratagem can still be used after rolling multiple rolls or saving throws at once. <br />TARGET: That unit or model from your army. <br />EFFECT: You re-roll that roll, test or saving throw. If you are using fast dice rolling, select one of those rolls or saving throws to re-roll.'
    },
    {
        name: 'Fire Overwatch',
        type: 'Core Stratagem - Strategic Ploy Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Your opponent’s Movement or Charge phase, just after an enemy unit is set up or when an enemy unit starts or ends a Normal, Advance or Fall Back move, or declares a charge. <br />TARGET: One unit from your army that is within 24" of that enemy unit and that would be eligible to shoot if it were your Shooting phase. <br />EFFECT: If that enemy unit is visible to your unit, your unit can shoot that enemy unit as if it were your Shooting phase. <br />RESTRICTIONS: You cannot target a TITANIC unit with this Stratagem. Until the end of the phase, each time a model in your unit makes a ranged attack, an unmodified Hit roll of 6 is required to score a hit, irrespective of the attacking weapon’s Ballistic Skill or any modifiers. You can only use this Stratagem once per turn.'
    },
    {
        name: 'Epic Challenge',
        type: 'Core Stratagem - Epic Deed Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Fight phase, when a CHARACTER unit from your army that is within Engagement Range of one or more Attached units is selected to fight. <br />TARGET: One CHARACTER model in your unit. <br />EFFECT: Until the end of the phase, all melee attacks made by that model have the [PRECISION] ability.'
    },
    {
        name: 'Grenade',
        type: 'Core Stratagem - Wargear Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Your Shooting phase. <br />TARGET: One GRENADES unit from your army (excluding units that Advanced, Fell Back or have shot this turn) that is not within Engagement Range of one or more enemy units. <br />EFFECT: Select one GRENADES model in your unit and one enemy unit that is not within Engagement Range of any units from your army and is within 8" of and visible to your GRENADES model. Roll six D6: for each 4+, that enemy unit suffers 1 mortal wound.'
    },
    {
        name: 'Tank Shock',
        type: 'Core Stratagem - Strategic Ploy Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Your Charge phase, just after a VEHICLE unit from your army ends a Charge move. <br />TARGET: That VEHICLE unit. <br />EFFECT: Select one enemy unit within Engagement Range of your unit, and select one VEHICLE model in your unit that is within Engagement Range of that enemy unit. Roll a number of D6 equal to the Toughness characteristic of the selected VEHICLE model. For each 5+, that enemy unit suffers 1 mortal wound (to a maximum of 6 mortal wounds).'
    },
    {
        name: 'Rapid Ingress',
        type: 'Core Stratagem - Strategic Ploy Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> End of your opponent’s Movement phase. <br />TARGET: One unit from your army that is in Reserves. <br />EFFECT: Your unit can arrive on the battlefield as if it were the Reinforcements step of your Movement phase, and if every model in that unit has the Deep Strike ability, you can set that unit up as described in the Deep Strike ability (even though it is not your Movement phase). <br />RESTRICTIONS: You cannot use this Stratagem to enable a unit to arrive on the battlefield during a battle round it would not normally be able to do so in.'
    },
    {
        name: 'Heroic Intervention',
        type: 'Core Stratagem - Strategic Ploy Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Your opponent’s Charge phase, just after an enemy unit ends a Charge move. <br />TARGET: One unit from your army that is within 6" of that enemy unit and would be eligible to declare a charge against that enemy unit if it were your Charge phase. <br />EFFECT: Your unit now declares a charge that targets only that enemy unit, and you resolve that charge as if it were your Charge phase. <br />RESTRICTIONS: You can only select a VEHICLE unit from your army if it is a WALKER. Note that even if this charge is successful, your unit does not receive any Charge bonus this turn.'
    },
    {
        name: 'Counter-offensive',
        type: 'Core Stratagem - Strategic Ploy Stratagem',
        cp_cost: '2',
        detachment: 'Core',
        description: '<b>WHEN:</b> Fight phase, just after an enemy unit has fought.<br>TARGET: 1 unit from your army that is within Engagement Range of one or more enemy units and that has not already been selected to fight this phase.<br>EFFECT: Your unit fights next.'
    },
    {
        name: 'Insane Bravery',
        type: 'Core Stratagem - Epic Deed Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Battle-shock step of your Command phase, just before you take a Battle-shock test for a unit from your army. <br />TARGET: That unit from your army. <br />EFFECT: Your unit automatically passes that Battle-shock test. <br />RESTRICTIONS: You cannot use this Stratagem more than once per battle.'
    },
    {
        name: 'Go to Ground',
        type: 'Core Stratagem - Battle Tactic Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Your opponent’s Shooting phase, just after an enemy unit has selected its targets.<br>TARGET: 1 INFANTRY unit from your army that was selected as the target of one or more of the attacking unit’s attacks.<br>EFFECT: Until the end of the phase, models in your unit have a 6+ invulnerable save and have the Benefit of Cover.'
    },
    {
        name: 'Smokescreen',
        type: 'Core Stratagem -  Wargear Stratagem',
        cp_cost: '1',
        detachment: 'Core',
        description: '<b>WHEN:</b> Your opponent’s Shooting phase, just after an enemy unit has selected its targets. <br />TARGET: One SMOKE unit from your army that was selected as the target of one or more of the attacking unit’s attacks. <br />EFFECT: Until the end of the phase, all models in your unit have the Benefit of Cover and the Stealth ability.'
    }
];

class DbClient {
    constructor() {
        this.db = null;
        this.SQL = null;
    }

    async init() {
        if (this.db) return;

        console.log('Initializing SQL.js...');

        // Load the library
        // Note: we assume sql-wasm.js is loaded via <script> tag or available globally if not using modules
        // But since we plan to use type="module", we should import it or rely on global `window.initSqlJs`

        if (!window.initSqlJs) {
            throw new Error('sql-wasm.js not loaded');
        }

        this.SQL = await window.initSqlJs({
            locateFile: file => `js/${file}`
        });

        console.log('Downloading database...');
        const dataPromise = fetch('armybuilder.db').then(res => res.arrayBuffer());
        const [buf] = await Promise.all([dataPromise]);

        this.db = new this.SQL.Database(new Uint8Array(buf));
        console.log('Database loaded successfully');
    }

    // Generic query helper that mimics better-sqlite3's .all() syntax roughly
    // Returns object array
    runQuery(sql, params = []) {
        if (!this.db) throw new Error('DB not initialized');

        // sql.js .exec returns [{columns:[], values:[]}]
        // We need to bind params. .exec allows binding if using a prepared statement approach
        // simplified:
        const stmt = this.db.prepare(sql);
        stmt.bind(params);

        const result = [];
        while (stmt.step()) {
            result.push(stmt.getAsObject());
        }
        stmt.free();
        return result;
    }

    // Generic single result helper
    runGet(sql, params = []) {
        const res = this.runQuery(sql, params);
        return res.length > 0 ? res[0] : null;
    }

    /* API METHODS */

    async getFactions() {
        return this.runQuery('SELECT * FROM factions ORDER BY name ASC');
    }

    async getUnits(factionUrl) {
        if (!factionUrl) return [];

        const faction = this.runGet("SELECT * FROM factions WHERE ? LIKE url || '%' ORDER BY (code IS NOT NULL AND code != '') DESC, length(url) DESC LIMIT 1", [factionUrl]);

        if (!faction) {
            console.warn(`DB: Faction not found for URL: ${factionUrl}`);
            return [];
        }

        const units = this.runQuery(`
            SELECT units.*, MIN(unit_compositions.points) as min_points, models.m as movement 
            FROM units 
            JOIN factions ON units.faction_id = factions.id 
            LEFT JOIN unit_compositions ON units.id = unit_compositions.unit_id
            LEFT JOIN models ON units.id = models.unit_id
            WHERE ? LIKE factions.url || '%'
            GROUP BY units.id
            ORDER BY units.name ASC
        `, [factionUrl]);

        return units;
    }

    async getDetachments(factionUrl) {
        if (!factionUrl) return [];

        const faction = this.runGet("SELECT id, name, url FROM factions WHERE ? LIKE url || '%' ORDER BY (code IS NOT NULL AND code != '') DESC, length(url) DESC LIMIT 1", [factionUrl]);

        if (!faction) return [];

        // Fetch detachments
        const detachments = this.runQuery(`
            SELECT d.id, d.name, d.wahapedia_id 
            FROM detachments d
            WHERE d.faction_id = ?
            ORDER BY d.name ASC
        `, [faction.id]);

        // Enhance with abilities
        return detachments.map(d => {
            const abilities = this.runQuery('SELECT name, description FROM detachment_abilities WHERE detachment_id = ?', [d.id]);
            return { ...d, abilities };
        });
    }

    async getRules(factionUrl) {
        if (!factionUrl) return [];

        const faction = this.runGet("SELECT id FROM factions WHERE ? LIKE url || '%' ORDER BY (code IS NOT NULL AND code != '') DESC, length(url) DESC LIMIT 1", [factionUrl]);
        if (!faction) return [];

        return this.runQuery('SELECT name, description FROM rules WHERE faction_id = ?', [faction.id]);
    }

    async getStratagems(factionUrl) {
        let factionStrats = [];
        if (factionUrl) {
            factionStrats = this.runQuery(`
                SELECT stratagems.* FROM stratagems 
                JOIN factions ON stratagems.faction_id = factions.id 
                WHERE ? LIKE factions.url || '%'
            `, [factionUrl]);
        }

        return [...factionStrats, ...CORE_STRATAGEMS];
    }

    async getUnitDetails(unitId) {
        // unitId here is the DB id
        const unit = this.runGet('SELECT * FROM units WHERE id = ?', [unitId]);
        if (!unit) return null;

        const models = this.runQuery('SELECT * FROM models WHERE unit_id = ?', [unit.id]);
        const weapons = this.runQuery('SELECT * FROM weapons WHERE unit_id = ?', [unit.id]);
        const abilities = this.runQuery('SELECT * FROM abilities WHERE unit_id = ?', [unit.id]);
        const composition = this.runQuery('SELECT * FROM unit_compositions WHERE unit_id = ?', [unit.id]);
        // Enhancements are faction-wide
        const enhancements = this.runQuery('SELECT * FROM enhancements WHERE faction_id = ?', [unit.faction_id]);
        const wargear = this.runQuery('SELECT * FROM wargear_options WHERE unit_id = ? ORDER BY is_default DESC, id ASC', [unit.id]);

        enhancements.sort((a, b) => a.detachment.localeCompare(b.detachment));

        return { ...unit, models, weapons, abilities, composition, wargear, enhancements };
    }
}

export const dbClient = new DbClient();
