// scanner.js - Gestion du Scan Code-Barre et Parsing composite

const scanner = {
    isScanning: false,
    cameraStream: null,
    detector: null,
    
    init: async function() {
        if ('BarcodeDetector' in window) {
            try {
                this.detector = new BarcodeDetector({ 
                    formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'data_matrix'] 
                });
            } catch(e) { console.warn("BarcodeDetector error", e); }
        }
    },

    startCamera: async function() {
        const video = document.getElementById('camera-preview');
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            video.srcObject = this.cameraStream;
            this.isScanning = true;
            this.scanLoop(video);
            document.getElementById('scan-result-area').innerHTML = "<p>Pointez l'appareil vers un code-barres...</p>";
        } catch (err) {
            console.error("Erreur ouverture caméra:", err);
            document.getElementById('scan-result-area').innerHTML = "<p class='error'>Accès caméra refusé ou non supporté. Veuillez saisir le code manuellement.</p>";
            // Fallback manual input
            document.getElementById('manual-code-input-wrapper').style.display = 'block';
        }
    },

    stopCamera: function() {
        this.isScanning = false;
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
    },

    scanLoop: async function(video) {
        if (!this.isScanning) return;

        if (this.detector && video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
                const barcodes = await this.detector.detect(video);
                if (barcodes.length > 0) {
                    this.stopCamera();
                    this.processCode(barcodes[0].rawValue);
                    return;
                }
            } catch (err) {
                console.warn("Scan processing error:", err);
            }
        }
        
        // Loop recursively via requestAnimationFrame
        requestAnimationFrame(() => this.scanLoop(video));
    },
    
    testManualCode: function() {
        const val = document.getElementById('manual-code-input').value.trim();
        if(val) this.processCode(val);
    },

    parseCompositeCode: function(code) {
        // Output format: { productCode, lotNumber, expiryDate }
        const result = { productCode: null, lotNumber: null, expiryDate: null };

        // Format 1: PROD:...|LOT:...|EXP:...
        if (code.includes('PROD:') || code.includes('LOT:')) {
            const parts = code.split('|');
            parts.forEach(p => {
                if(p.startsWith('PROD:')) result.productCode = p.substring(5);
                if(p.startsWith('LOT:')) result.lotNumber = p.substring(4);
                if(p.startsWith('EXP:')) result.expiryDate = p.substring(4);
            });
            if(result.productCode) return result;
        }

        // Format 2 & 3: delimiter-based
        const delimiter = code.includes('|') ? '|' : (code.includes(';') ? ';' : null);
        if (delimiter) {
            const parts = code.split(delimiter);
            if (parts.length >= 3) {
                result.productCode = parts[0];
                result.lotNumber = parts[1];
                result.expiryDate = parts[2]; // assuming format YYYY-MM-DD
                return result;
            }
        }

        // Format 4: GS1 (Basic parser) logic: 01 + 14 chars GTIN + 10 + lot + 17 + YYMMDD
        // Real GS1 is complex (FNC1, variable lengths). Here is a simplified heuristic.
        if (code.startsWith('01') && code.length > 20) {
            // Suppose 01[14 digits]
            const gtin = code.substring(2, 16);
            let remainder = code.substring(16);
            let lot = null;
            let date = null;

            // Try to find '17' (date) and '10' (lot)
            let index17 = remainder.indexOf('17');
            let index10 = remainder.indexOf('10');

            if (index17 > -1 && index17 + 8 <= remainder.length) {
                const yymmdd = remainder.substring(index17 + 2, index17 + 8);
                // Convert to YYYY-MM-DD
                let yearStr = parseInt(yymmdd.substring(0, 2)) > 50 ? '19' : '20';
                date = `${yearStr}${yymmdd.substring(0, 2)}-${yymmdd.substring(2, 4)}-${yymmdd.substring(4, 6)}`;
                // Strip this segment out to find 10 
                remainder = remainder.substring(0, index17) + remainder.substring(index17 + 8);
            }

            index10 = remainder.indexOf('10');
            if (index10 > -1) {
                lot = remainder.substring(index10 + 2).split(/01|17|21|11/)[0]; // cut at next AI if any
            }

            result.productCode = gtin;
            result.lotNumber = lot;
            result.expiryDate = date;
            return result;
        }

        return null; // Not composite
    },

    processCode: async function(rawCode) {
        document.getElementById('scan-result-area').innerHTML = `<p>Code scanné: <strong>${rawCode}</strong>. Recherche en cours...</p>`;
        
        try {
            // 1. Chercher dans codes_lots
            const codeLot = await window.dbAPI.getOneByIndex('codes_lots', 'code', rawCode);
            if (codeLot && codeLot.actif !== false) {
                return this.handleKnownLotCode(codeLot, rawCode);
            }

            // 2. Chercher dans codes_medicaments
            const codeMed = await window.dbAPI.getOneByIndex('codes_medicaments', 'code', rawCode);
            if (codeMed && codeMed.actif !== false) {
                return this.handleKnownMedicineCode(codeMed, rawCode);
            }

            // 3. Try to parse composite
            const parsed = this.parseCompositeCode(rawCode);
            if (parsed && parsed.productCode) {
                const cmpMedCode = await window.dbAPI.getOneByIndex('codes_medicaments', 'code', parsed.productCode);
                if (cmpMedCode && cmpMedCode.actif !== false) {
                    return this.handleCompositeResult(cmpMedCode, parsed, rawCode);
                }
            }

            // 4. Code Inconnu -> Provide options
            this.handleUnknownCode(rawCode);

        } catch (error) {
            console.error("Erreur lors du traitement du code:", error);
            document.getElementById('scan-result-area').innerHTML += "<p class='error'>Erreur interne.</p>";
        }
    },

    handleKnownLotCode: async function(codeLotEntry, rawCode) {
        const med = await window.dbAPI.getById('medicaments', codeLotEntry.medicament_id);
        const lot = await window.dbAPI.getById('lots', codeLotEntry.lot_id);
        if (app.currentInventoryId) {
            app.openInventoryEntryModal(med, lot, rawCode);
        } else {
            document.getElementById('scan-result-area').innerHTML = `
                <div class="list-item">
                    <h4>${med.dci}</h4>
                    <div class="meta"><span>Lot: ${lot.numero_lot}</span><span>Exp: ${lot.date_peremption}</span></div>
                    <div class="stats"><span>Stock: ${lot.stock_theorique}</span> <span>Prix: ${lot.prix_vente_unitaire}</span></div>
                </div>
            `;
        }
    },

    handleKnownMedicineCode: async function(codeMedEntry, rawCode) {
        const med = await window.dbAPI.getById('medicaments', codeMedEntry.medicament_id);
        if (app.currentInventoryId) {
            app.openInventoryEntryModal(med, null, rawCode);
        } else {
            document.getElementById('scan-result-area').innerHTML = `
                <div class="list-item">
                    <h4>${med.dci} - ${med.designation}</h4>
                    <p>Code identifié. Allez dans une session d'inventaire pour saisir.</p>
                </div>
            `;
        }
    },

    handleCompositeResult: async function(codeMedEntry, parsed, fullRawCode) {
        // Find if lot already exists
        const medId = codeMedEntry.medicament_id;
        const med = await window.dbAPI.getById('medicaments', medId);
        
        const existingLots = await window.dbAPI.getByIndex('lots', 'medicament_id', medId);
        let targetLot = existingLots.find(l => l.numero_lot === parsed.lotNumber);

        if (!targetLot) {
            // Auto create lot
            const lotId = await window.dbAPI.add('lots', {
                medicament_id: medId,
                numero_lot: parsed.lotNumber,
                date_peremption: parsed.expiryDate,
                stock_theorique: 0,
                prix_vente_unitaire: med.prix_vente_unitaire,
                prix_achat_unitaire: med.prix_achat_unitaire,
                actif: true
            });
            targetLot = await window.dbAPI.getById('lots', lotId);
        }

        // Register the composite code to this lot so future scans are instant
        await window.dbAPI.add('codes_lots', {
            medicament_id: medId,
            lot_id: targetLot.id,
            code: fullRawCode,
            type_code: 'composite_code',
            date_ajout: new Date().toISOString(),
            actif: true
        });

        if (app.currentInventoryId) {
            app.openInventoryEntryModal(med, targetLot, fullRawCode);
        } else {
            document.getElementById('scan-result-area').innerHTML = `<p>Code composite reconnu et enregistré. DCI: ${med.dci}, Lot: ${targetLot.numero_lot}</p>`;
        }
    },

    handleUnknownCode: function(rawCode) {
        document.getElementById('scan-result-area').innerHTML = `<p style="color:red;">Code Inconnu: ${rawCode}</p>`;
        document.getElementById('unknown-code-display').innerText = rawCode;
        app.pendingUnknownCode = rawCode;
        ui.openModal('unknown-code-modal');
    }
};

window.scanner = scanner;
// initialize detector context
scanner.init();
