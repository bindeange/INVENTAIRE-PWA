// app.js - Gestion principale du PWA

const ui = {

    showView(viewId) {

        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active-view');
            v.classList.add('hidden');
        });

        const page = document.getElementById(`page-${viewId}`);

        if (page) {
            page.classList.remove('hidden');
            page.classList.add('active-view');
        }

        const btnBack = document.getElementById('btn-back');

        if (viewId === 'accueil') {
            btnBack.classList.add('hidden');
        } else {
            btnBack.classList.remove('hidden');
        }
    },

    openModal(id) {
        document.getElementById(id).classList.remove('hidden');
    },

    closeModal(id) {
        document.getElementById(id).classList.add('hidden');
    }
};

const app = {

    currentInventoryId: null,

    async init() {
        this.bindEvents();
        await this.loadInitialData();
        this.navigate('accueil');
    },

    bindEvents() {

        document.getElementById('btn-back')?.addEventListener('click', () => {
            this.navigate('accueil');
        });

        document.getElementById('form-nouvel-inventaire')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.startInventory();
        });

        document.getElementById('search-med-inv')?.addEventListener('input', async (e) => {
            await this.searchMedicamentInventory(e.target.value);
        });

        document.getElementById('btn-scan-inv')?.addEventListener('click', () => {
            this.navigate('scan');
        });
    },

    async loadInitialData() {

        const structures = await window.dbAPI.getAll('structures');

        if (structures.length === 0) {

            const structureId = await window.dbAPI.add('structures', {
                nom_structure: 'PHARMACIE CENTRALE',
                code_structure: 'PHC01',
                actif: true
            });

            await window.dbAPI.add('depots', {
                structure_id: structureId,
                nom_depot: 'MAGASIN PRINCIPAL',
                actif: true
            });
        }

        await this.loadFamilles();
    },

    async loadFamilles() {

        const familles = await window.dbAPI.getAll('familles');

        const filterInv = document.getElementById('filter-famille-inv');

        if (!filterInv) return;

        filterInv.innerHTML = '<option value="">Toutes familles</option>';

        familles.forEach(f => {
            filterInv.innerHTML += `<option value="${f.id}">${f.nom_famille}</option>`;
        });
    },

    navigate(viewId) {

        ui.showView(viewId);

        if (viewId === 'nouvel-inventaire') {
            this.initNouvelInventaire();
        }

        if (viewId === 'inventaire') {
            this.initInventaireView();
        }

        if (viewId === 'scan') {
            window.scanner?.startCamera();
        }
    },

    async initNouvelInventaire() {

        const structures = await window.dbAPI.getAll('structures');
        const depots = await window.dbAPI.getAll('depots');

        const selStruct = document.getElementById('inv-structure');
        const selDepot = document.getElementById('inv-depot');

        selStruct.innerHTML = structures.map(s => `<option value="${s.id}">${s.nom_structure}</option>`).join('');

        selDepot.innerHTML = depots.map(d => `<option value="${d.id}">${d.nom_depot}</option>`).join('');

        document.getElementById('inv-date').value = new Date().toISOString().split('T')[0];
    },

    async startInventory() {

        const payload = {
            nom_inventaire: document.getElementById('inv-nom').value,
            structure: document.getElementById('inv-structure').value,
            depot: document.getElementById('inv-depot').value,
            date_inventaire: document.getElementById('inv-date').value,
            utilisateur: document.getElementById('inv-agent').value,
            statut: 'en_cours',
            synced: false
        };

        this.currentInventoryId = await window.dbAPI.add('inventaires', payload);

        alert('Inventaire démarré');

        this.navigate('inventaire');
    },

    async initInventaireView() {
        await this.searchMedicamentInventory('');
    },

    async searchMedicamentInventory(query = '') {

        const meds = await window.dbAPI.searchMedicaments(query, null, 100);

        const container = document.getElementById('inventory-list');

        if (!container) return;

        container.innerHTML = '';

        meds.forEach(med => {

            const div = document.createElement('div');

            div.className = 'list-item';

            div.innerHTML = `
                <h4>${med.dci}</h4>
                <div class="meta">${med.code_interne || ''}</div>
                <div class="stats">${med.unite_comptage || ''}</div>

                <button class="btn btn-primary mt-1"
                    onclick="app.openInventoryEntry('${med.id}')">
                    Inventorier
                </button>
            `;

            container.appendChild(div);
        });
    },

    async openInventoryEntry(medId) {
        const med = await window.dbAPI.getById('medicaments', medId);
        this.openInventoryEntryModal(med, null, null);
    },

    openInventoryEntryModal(med, lot, rawCode) {
        this._pendingInventoryMed = med;
        this._pendingInventoryLot = lot;
        document.getElementById('inv-entry-title').textContent = med.dci;
        let info = '';
        if (lot) info += `Lot : ${lot.numero_lot}`;
        if (lot && lot.date_peremption) info += ` — Exp : ${lot.date_peremption}`;
        if (rawCode) info += `<br>Code : ${rawCode}`;
        document.getElementById('inv-entry-info').innerHTML = info;
        document.getElementById('inv-entry-qty').value = '';
        document.getElementById('inv-entry-obs').value = '';
        ui.openModal('inventory-entry-modal');
        setTimeout(() => document.getElementById('inv-entry-qty').focus(), 300);
    },

    async saveInventoryEntry() {
        const med = this._pendingInventoryMed;
        const lot = this._pendingInventoryLot;
        const qty = document.getElementById('inv-entry-qty').value;
        const obs = document.getElementById('inv-entry-obs').value;

        if (qty === '' || qty === null) {
            alert('Veuillez saisir une quantité');
            return;
        }
        if (!this.currentInventoryId) {
            alert('Aucun inventaire en cours. Démarrez un inventaire d\'abord.');
            ui.closeModal('inventory-entry-modal');
            return;
        }

        await window.dbAPI.add('lignes_inventaire', {
            inventaire_id: this.currentInventoryId,
            medicament_id: med.id,
            lot_id: lot ? lot.id : null,
            famille_id: med.famille_id,
            quantite_physique: Number(qty),
            observation: obs,
            synced: false
        });

        ui.closeModal('inventory-entry-modal');
        this._showSuccessToast(`✅ ${med.dci} — ${qty} ${med.unite_comptage || ''} enregistré`);
        await syncAPI.updateSyncBadge();
    },

    async searchForAssoc(query) {
        const results = await window.dbAPI.searchMedicaments(query, null, 20);
        const container = document.getElementById('assoc-results');
        if (!container) return;
        if (!results.length) {
            container.innerHTML = '<p style="color:var(--gray);padding:.5rem;font-size:.85rem">Aucun résultat</p>';
            return;
        }
        container.innerHTML = results.map(m => `
            <div class="list-item" style="margin-bottom:.5rem;padding:.7rem" onclick="app.associateCode('${m.id}')">
                <strong>${m.dci}</strong>
                <div class="meta">${m.code_interne || ''}</div>
            </div>`).join('');
    },

    async associateCode(medId) {
        const code = this.pendingUnknownCode;
        if (!code || !medId) return;
        try {
            await window.dbAPI.add('codes_medicaments', {
                code: code,
                medicament_id: medId,
                type_code: 'manuel',
                actif: true
            });
            ui.closeModal('unknown-code-modal');
            this._showSuccessToast('✅ Code associé au médicament');
        } catch(e) {
            alert('Ce code est déjà associé à un médicament.');
        }
    },

    openQuickCreateModal() {
        // Reset le formulaire
        this._resetCreateModal();
        ui.openModal('quick-create-modal');
    },

    _resetCreateModal() {
        // Reset étape 1
        ['qc-famille','qc-dci','qc-designation','qc-code'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        const unite = document.getElementById('qc-unite');
        if(unite) unite.value = 'BOITE';
        const cat = document.getElementById('qc-categorie');
        if(cat) cat.value = 'recouvrable';
        ['qc-pvu','qc-pau'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '0';
        });

        // Reset étape 2
        const hasLot = document.getElementById('qc-has-lot');
        if(hasLot) hasLot.checked = false;
        this.toggleLotSection();
        ['qc-lot','qc-exp'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        const stock = document.getElementById('qc-stock');
        if(stock) stock.value = '0';

        // Reset étape 3 - codes-barres
        const container = document.getElementById('barcodes-container');
        if(container) {
            container.innerHTML = `
                <div class="barcode-entry" id="barcode-0">
                    <div class="barcode-row">
                        <input type="text" class="barcode-input" placeholder="Code-barre ou QR Code" data-index="0">
                        <button class="btn-scan-barcode" onclick="app.scanBarcodeForField(0)" title="Scanner">
                            <i class="fas fa-barcode"></i>
                        </button>
                    </div>
                </div>`;
        }

        // Reset radio
        const radioDci = document.querySelector('input[name="barcode-target"][value="dci"]');
        if(radioDci) radioDci.checked = true;

        // Retourner à l'étape 1
        this.goToStep(1);
    },

    goToStep(stepNum) {
        [1,2,3].forEach(n => {
            document.getElementById(`step-${n}`)?.classList.add('hidden');
            document.getElementById(`step-${n}`)?.classList.remove('active-step');
            const ind = document.getElementById(`step-ind-${n}`);
            if(ind) ind.classList.remove('active','done');
        });

        for(let n = 1; n < stepNum; n++) {
            document.getElementById(`step-ind-${n}`)?.classList.add('done');
        }

        const stepEl = document.getElementById(`step-${stepNum}`);
        if(stepEl) {
            stepEl.classList.remove('hidden');
            stepEl.classList.add('active-step');
        }
        document.getElementById(`step-ind-${stepNum}`)?.classList.add('active');

        // Si étape 3 : montrer/cacher option "lot" selon si un lot est défini
        if(stepNum === 3) {
            const hasLot = document.getElementById('qc-has-lot')?.checked;
            const radioLot = document.getElementById('radio-lot-option');
            if(radioLot) radioLot.style.opacity = hasLot ? '1' : '0.4';
            if(!hasLot) {
                const radioDci = document.querySelector('input[name="barcode-target"][value="dci"]');
                if(radioDci) radioDci.checked = true;
                const radioLotInput = document.querySelector('input[name="barcode-target"][value="lot"]');
                if(radioLotInput) radioLotInput.disabled = true;
            } else {
                const radioLotInput = document.querySelector('input[name="barcode-target"][value="lot"]');
                if(radioLotInput) radioLotInput.disabled = false;
            }
        }

        // Si étape 1 : charger suggestions familles
        if(stepNum === 1) this._bindFamilleSuggestions();
    },

    _bindFamilleSuggestions() {
        const input = document.getElementById('qc-famille');
        if(!input) return;
        // Remove old listener by cloning
        if(input._famHandler) {
            input.removeEventListener('input', input._famHandler);
        }
        const handler = async () => {
            const val = input.value.toLowerCase();
            const familles = await window.dbAPI.getAll('familles');
            const suggestions = document.getElementById('famille-suggestions');
            if(!suggestions) return;
            if(!val) { suggestions.classList.add('hidden'); return; }
            const matches = familles.filter(f => f.nom_famille.toLowerCase().includes(val));
            if(matches.length === 0) { suggestions.classList.add('hidden'); return; }
            suggestions.innerHTML = matches.map(f =>
                `<div class="suggestion-item" onclick="document.getElementById('qc-famille').value='${f.nom_famille.replace(/'/g,"\\'")}';document.getElementById('famille-suggestions').classList.add('hidden')">${f.nom_famille}</div>`
            ).join('');
            suggestions.classList.remove('hidden');
        };
        input._famHandler = handler;
        input.addEventListener('input', handler);
        // Global click-away (only once)
        if(!window._famClickAway) {
            window._famClickAway = true;
            document.addEventListener('click', (e) => {
                if(!e.target.closest('.input-with-suggest')) {
                    document.getElementById('famille-suggestions')?.classList.add('hidden');
                }
            });
        }
    },

    toggleLotSection() {
        const checked = document.getElementById('qc-has-lot')?.checked;
        const fields = document.getElementById('lot-fields');
        if(fields) {
            if(checked) fields.classList.remove('hidden');
            else fields.classList.add('hidden');
        }
    },

    addBarcodeField() {
        const container = document.getElementById('barcodes-container');
        const count = container.querySelectorAll('.barcode-entry').length;
        if(count >= 5) { alert('Maximum 5 codes-barres par produit'); return; }
        const div = document.createElement('div');
        div.className = 'barcode-entry';
        div.id = `barcode-${count}`;
        div.innerHTML = `
            <div class="barcode-row">
                <input type="text" class="barcode-input" placeholder="Code-barre ou QR Code" data-index="${count}">
                <button class="btn-scan-barcode" onclick="app.scanBarcodeForField(${count})" title="Scanner">
                    <i class="fas fa-barcode"></i>
                </button>
                <button class="btn-remove-barcode" onclick="this.closest('.barcode-entry').remove()" title="Supprimer">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
        container.appendChild(div);
    },

    scanBarcodeForField(index) {
        // Naviguer vers le scanner et capturer le résultat dans le champ
        this._pendingScanFieldIndex = index;
        this._scanningForModal = true;
        ui.closeModal('quick-create-modal');
        this.navigate('scan');
    },

    async quickCreateProduct() {

        const famille = document.getElementById('qc-famille').value.trim();
        const dci = document.getElementById('qc-dci').value.trim();
        const unite = document.getElementById('qc-unite').value;
        const code = document.getElementById('qc-code').value.trim();
        const designation = document.getElementById('qc-designation').value.trim() || dci;
        const categorie = document.getElementById('qc-categorie').value;
        const pvu = Number(document.getElementById('qc-pvu').value || 0);
        const pau = Number(document.getElementById('qc-pau').value || 0);

        const hasLot = document.getElementById('qc-has-lot')?.checked;
        const lot = document.getElementById('qc-lot').value.trim();
        const exp = document.getElementById('qc-exp').value;
        const stock = Number(document.getElementById('qc-stock').value || 0);

        if (!famille || !dci) {
            alert('Famille et DCI sont obligatoires');
            this.goToStep(1);
            return;
        }

        if (hasLot && !lot) {
            alert('Veuillez saisir le numéro de lot');
            this.goToStep(2);
            return;
        }

        try {
            let famId;
            const fams = await window.dbAPI.getByIndex('familles', 'nom_famille', famille);
            if (fams.length > 0) {
                famId = fams[0].id;
            } else {
                famId = await window.dbAPI.add('familles', { nom_famille: famille, actif: true });
            }

            const medId = await window.dbAPI.add('medicaments', {
                famille_id: famId,
                dci: dci,
                designation: designation,
                unite_comptage: unite,
                code_interne: code,
                prix_vente_unitaire: pvu,
                prix_achat_unitaire: pau,
                categorie_financiere: categorie,
                actif: true,
                synced: false
            });

            let lotId = null;
            if (hasLot && lot) {
                lotId = await window.dbAPI.add('lots', {
                    medicament_id: medId,
                    numero_lot: lot,
                    date_peremption: exp,
                    stock_theorique: stock,
                    actif: true,
                    synced: false
                });
            }

            // Récupérer tous les codes-barres saisis
            const barcodeInputs = document.querySelectorAll('.barcode-input');
            const barcodeTarget = document.querySelector('input[name="barcode-target"]:checked')?.value || 'dci';

            for (const input of barcodeInputs) {
                const val = input.value.trim();
                if (!val) continue;

                if (barcodeTarget === 'lot' && lotId) {
                    await window.dbAPI.add('codes_lots', {
                        code: val,
                        medicament_id: medId,
                        lot_id: lotId,
                        type_code: 'manuel',
                        actif: true
                    });
                } else {
                    await window.dbAPI.add('codes_medicaments', {
                        code: val,
                        medicament_id: medId,
                        type_code: 'manuel',
                        actif: true
                    });
                }
            }

            ui.closeModal('quick-create-modal');
            await this.loadFamilles();
            await this.searchMedicamentInventory('');

            // Toast succès
            this._showSuccessToast(`✅ Produit "${dci}" créé avec succès`);

        } catch(err) {
            console.error(err);
            alert('Erreur lors de la création : ' + err.message);
        }
    },

    _showSuccessToast(msg) {
        const t = document.createElement('div');
        t.className = 'app-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('visible'), 10);
        setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 3000);
    }
};

window.app = app;
window.ui = ui;
