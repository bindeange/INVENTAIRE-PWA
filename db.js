// db.js - Gestion de la base de données IndexedDB structurée via Promise

const DB_NAME = 'inventaire_pharmacie_db';
const DB_VERSION = 1;

const storesAndIndexes = {
    familles: [
        {name: 'nom_famille', keyPath: 'nom_famille', unique: false},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    medicaments: [
        {name: 'famille_id', keyPath: 'famille_id', unique: false},
        {name: 'dci', keyPath: 'dci', unique: false},
        {name: 'designation', keyPath: 'designation', unique: false},
        {name: 'code_interne', keyPath: 'code_interne', unique: false},
        {name: 'categorie_financiere', keyPath: 'categorie_financiere', unique: false},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    codes_medicaments: [
        {name: 'code', keyPath: 'code', unique: true}, // Un code ne doit pas être associé à 2 médicaments différents
        {name: 'medicament_id', keyPath: 'medicament_id', unique: false},
        {name: 'type_code', keyPath: 'type_code', unique: false},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    lots: [
        {name: 'medicament_id', keyPath: 'medicament_id', unique: false},
        {name: 'numero_lot', keyPath: 'numero_lot', unique: false},
        {name: 'date_peremption', keyPath: 'date_peremption', unique: false},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    codes_lots: [
        {name: 'code', keyPath: 'code', unique: true},
        {name: 'medicament_id', keyPath: 'medicament_id', unique: false},
        {name: 'lot_id', keyPath: 'lot_id', unique: false},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    inventaires: [
        {name: 'structure', keyPath: 'structure', unique: false},
        {name: 'depot', keyPath: 'depot', unique: false},
        {name: 'date_inventaire', keyPath: 'date_inventaire', unique: false},
        {name: 'statut', keyPath: 'statut', unique: false},
        {name: 'synced', keyPath: 'synced', unique: false}
    ],
    lignes_inventaire: [
        {name: 'inventaire_id', keyPath: 'inventaire_id', unique: false},
        {name: 'medicament_id', keyPath: 'medicament_id', unique: false},
        {name: 'lot_id', keyPath: 'lot_id', unique: false},
        {name: 'famille_id', keyPath: 'famille_id', unique: false},
        {name: 'synced', keyPath: 'synced', unique: false}
    ],
    structures: [
        {name: 'nom_structure', keyPath: 'nom_structure', unique: false},
        {name: 'code_structure', keyPath: 'code_structure', unique: true},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    depots: [
        {name: 'structure_id', keyPath: 'structure_id', unique: false},
        {name: 'nom_depot', keyPath: 'nom_depot', unique: false},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    utilisateurs: [
        {name: 'role', keyPath: 'role', unique: false},
        {name: 'structure', keyPath: 'structure', unique: false},
        {name: 'code_acces', keyPath: 'code_acces', unique: false},
        {name: 'actif', keyPath: 'actif', unique: false}
    ],
    parametres: [
        {name: 'cle', keyPath: 'cle', unique: true}
    ],
    historique_modifications: [
        {name: 'table_modifiee', keyPath: 'table_modifiee', unique: false},
        {name: 'id_element', keyPath: 'id_element', unique: false},
        {name: 'action', keyPath: 'action', unique: false},
        {name: 'utilisateur', keyPath: 'utilisateur', unique: false},
        {name: 'date_action', keyPath: 'date_action', unique: false}
    ]
};

const dbAPI = {
    db: null,

    init: function() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject("IndexedDB n'est pas supporté par ce navigateur.");
                return;
            }

            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Erreur ouverture DB:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Creation of all object stores mapped in storesAndIndexes
                for (const [storeName, indexes] of Object.entries(storesAndIndexes)) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
                        indexes.forEach(idx => {
                            store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
                        });
                    }
                }
            };
        });
    },

    generateId: function() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    },

    getStore: function(storeName, mode = 'readonly') {
        const transaction = this.db.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    },

    add: function(storeName, data, logAction = true) {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readwrite');
            if (!data.id) data.id = this.generateId();
            if (!data.created_at) data.created_at = new Date().toISOString();
            data.updated_at = new Date().toISOString();

            const request = store.add(data);
            request.onsuccess = () => {
                if(logAction && storeName !== 'historique_modifications') {
                    this.logModification(storeName, data.id, 'ajout', null, data);
                }
                resolve(data.id);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    put: function(storeName, data, logAction = true) {
        return new Promise(async (resolve, reject) => {
            data.updated_at = new Date().toISOString();
            
            let oldData = null;
            if(logAction && storeName !== 'historique_modifications') {
                try { oldData = await this.getById(storeName, data.id); } catch(e){}
            }

            const store = this.getStore(storeName, 'readwrite');
            const request = store.put(data);
            request.onsuccess = () => {
                if(logAction && storeName !== 'historique_modifications') {
                    this.logModification(storeName, data.id, 'modification', oldData, data);
                }
                resolve(data.id);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    getById: function(storeName, id) {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readonly');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    getAll: function(storeName) {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readonly');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    getByIndex: function(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readonly');
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    getOneByIndex: function(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readonly');
            const index = store.index(indexName);
            const request = index.get(value); // gets only the first record
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    delete: function(storeName, id, logAction = true) {
        return new Promise(async (resolve, reject) => {
            let oldData = null;
            if(logAction && storeName !== 'historique_modifications') {
                try { oldData = await this.getById(storeName, id); } catch(e){}
            }

            const store = this.getStore(storeName, 'readwrite');
            const request = store.delete(id);
            request.onsuccess = () => {
                if(logAction && storeName !== 'historique_modifications') {
                    this.logModification(storeName, id, 'suppression', oldData, null);
                }
                resolve(true);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    
    // Virtual deactivate (actif = 0/false) instead of delete
    deactivate: async function(storeName, id) {
        const item = await this.getById(storeName, id);
        if(item) {
            item.actif = false;
            return await this.put(storeName, item);
        }
        return false;
    },

    logModification: function(table, id_element, action, ancienne_valeur, nouvelle_valeur) {
        const log = {
            id: this.generateId(),
            table_modifiee: table,
            id_element: id_element,
            action: action,
            ancienne_valeur: ancienne_valeur ? JSON.stringify(ancienne_valeur) : null,
            nouvelle_valeur: nouvelle_valeur ? JSON.stringify(nouvelle_valeur) : null,
            utilisateur: 'current_user', // To be replaced in a real auth scenario
            date_action: new Date().toISOString()
        };
        // Use raw add to avoid recursive logging loop
        const store = this.getStore('historique_modifications', 'readwrite');
        store.add(log);
    },

    // A helper to partially search items with index-like behaviour and text filtering
    searchMedicaments: async function(query, familleId = null, limit = 50) {
        return new Promise((resolve, reject) => {
            const store = this.getStore('medicaments', 'readonly');
            const request = store.openCursor();
            const results = [];
            const q = query.toLowerCase();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && results.length < limit) {
                    const val = cursor.value;
                    if (val.actif !== false) { // Ensure it's active
                        let matchFamille = true;
                        if (familleId && val.famille_id !== familleId) {
                            matchFamille = false;
                        }

                        if (matchFamille) {
                            if (!q || 
                                (val.dci && val.dci.toLowerCase().includes(q)) || 
                                (val.designation && val.designation.toLowerCase().includes(q)) ||
                                (val.code_interne && val.code_interne.toLowerCase().includes(q))) {
                                results.push(val);
                            }
                        }
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }
};

window.dbAPI = dbAPI;
