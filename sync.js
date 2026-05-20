/**
 * sync.js - Gestion de la synchronisation
 * URL ACTUELLE : https://script.google.com/macros/s/AKfycbwrO2jyx8Xvh58EpTWcqCYjmS0Wo_YuvKJ0gO2VVM5KDGgJptADM2hztiFEfq31G_Qw/exec
 */

const syncAPI = {
    // MISE À JOUR AVEC VOTRE NOUVELLE URL
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwrO2jyx8Xvh58EpTWcqCYjmS0Wo_YuvKJ0gO2VVM5KDGgJptADM2hztiFEfq31G_Qw/exec',

    // Liste des tables à synchroniser
    ENTITIES: ['familles', 'medicaments', 'lots', 'codes_medicaments', 'codes_lots', 'inventaires', 'lignes_inventaire'],

    /**
     * ENVOYER les données (Push)
     */
    push: async function() {
        if (!navigator.onLine) {
            app.toast('⚠️ Vous êtes hors ligne');
            return;
        }

        app.showLoader(true);
        let totalPushed = 0;

        try {
            for (const entity of this.ENTITIES) {
                const allRecords = await window.dbAPI.getAll(entity);
                const toSync = allRecords.filter(r => r.synced === false);

                if (toSync.length === 0) continue;

                const response = await fetch(this.APPS_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        entity: entity,
                        action: 'upsert',
                        records: toSync
                    })
                });

                const result = await response.json();

                if (result.success) {
                    for (const record of toSync) {
                        record.synced = true;
                        await window.dbAPI.put(entity, record);
                    }
                    totalPushed += toSync.length;
                }
            }

            if (totalPushed > 0) {
                app.toast(`✅ ${totalPushed} éléments synchronisés !`);
            } else {
                app.toast('ℹ️ Déjà à jour');
            }
            
            await this.updateSyncBadge();

        } catch (err) {
            console.error('Erreur Push:', err);
            app.toast('❌ Erreur de connexion au serveur');
        } finally {
            app.showLoader(false);
        }
    },

    /**
     * RÉCUPÉRER les données (Pull)
     */
    pull: async function() {
        if (!navigator.onLine) {
            app.toast('⚠️ Vous êtes hors ligne');
            return;
        }

        const confirmPull = confirm("Importer les données depuis Google Sheets ?");
        if (!confirmPull) return;

        app.showLoader(true);
        let totalImported = 0;

        try {
            // On récupère les médicaments et familles en priorité
            const pullEntities = ['familles', 'medicaments', 'lots', 'codes_medicaments'];

            for (const entity of pullEntities) {
                const url = `${this.APPS_SCRIPT_URL}?entity=${entity}`;
                const response = await fetch(url);
                const result = await response.json();

                if (result.success && result.data) {
                    for (const record of result.data) {
                        record.synced = true;
                        const existing = await window.dbAPI.getById(entity, record.id);
                        if (existing) {
                            await window.dbAPI.put(entity, record);
                        } else {
                            try { await window.dbAPI.add(entity, record); } 
                            catch (e) { await window.dbAPI.put(entity, record); }
                        }
                        totalImported++;
                    }
                }
            }

            app.toast(`✅ ${totalImported} éléments importés`);
            if (app.invId) app.searchMeds('');
            await this.updateSyncBadge();

        } catch (err) {
            console.error('Erreur Pull:', err);
            app.toast('❌ Erreur lors de l\'importation');
        } finally {
            app.showLoader(false);
        }
    },

    /**
     * Mise à jour du badge rouge
     */
    updateSyncBadge: async function() {
        let count = 0;
        const tables = ['medicaments', 'lots', 'inventaires', 'lignes_inventaire'];
        
        for (const t of tables) {
            try {
                const all = await window.dbAPI.getAll(t);
                count += all.filter(r => r.synced === false).length;
            } catch(e) {}
        }

        const btnSync = document.getElementById('btn-sync');
        if (!btnSync) return;

        const oldBadge = btnSync.querySelector('.badge');
        if (oldBadge) oldBadge.remove();

        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = count > 99 ? '99+' : count;
            btnSync.appendChild(badge);
        }
    }
};

// Initialisation
window.addEventListener('load', () => {
    syncAPI.updateSyncBadge();
    // Rafraîchir le badge toutes les minutes
    setInterval(() => syncAPI.updateSyncBadge(), 60000);
});