// Remplacez la fonction exportInventory dans excel.js
async exportInventory() {
    const meds = await window.dbAPI.getAll('medicaments');
    const familles = await window.dbAPI.getAll('familles');
    const lots = await window.dbAPI.getAll('lots');
    const codesMeds = await window.dbAPI.getAll('codes_medicaments');
    const lignes = await window.dbAPI.getAll('lignes_inventaire');

    const rows = [];
    const headers = [
        "famille", "dci", "designation", "unite_comptage", 
        "code_interne", "prix_vente_unitaire", "prix_achat_unitaire", 
        "categorie_financiere", "numero_lot", "date_peremption", 
        "stock_theorique", "quantite_physique", "observation", "code_1"
    ];

    for (const med of meds) {
        if (med.actif === false) continue;
        const fam = familles.find(f => f.id === med.famille_id);
        const medLots = lots.filter(l => l.medicament_id === med.id && l.actif !== false);
        const medCodes = codesMeds.filter(c => c.medicament_id === med.id && c.actif !== false);

        const base = {
            famille: fam ? fam.nom_famille : '',
            dci: med.dci,
            designation: med.designation || med.dci,
            unite_comptage: med.unite_comptage || 'BOITE',
            code_interne: med.code_interne || '',
            prix_vente_unitaire: med.prix_vente_unitaire || 0,
            prix_achat_unitaire: med.prix_achat_unitaire || 0,
            categorie_financiere: med.categorie_financiere || 'recouvrable'
        };

        if (medLots.length === 0) {
            const lastLigne = lignes.reverse().find(l => l.medicament_id === med.id);
            rows.push({
                ...base,
                numero_lot: '', date_peremption: '', stock_theorique: 0,
                quantite_physique: lastLigne ? lastLigne.quantite_physique : '',
                observation: lastLigne ? lastLigne.observation : '',
                code_1: medCodes[0] ? medCodes[0].code : ''
            });
        } else {
            for (const lot of medLots) {
                const lotLigne = lignes.find(l => l.medicament_id === med.id && l.lot_id === lot.id);
                rows.push({
                    ...base,
                    numero_lot: lot.numero_lot,
                    date_peremption: lot.date_peremption,
                    stock_theorique: lot.stock_theorique,
                    quantite_physique: lotLigne ? lotLigne.quantite_physique : '',
                    observation: lotLigne ? lotLigne.observation : '',
                    code_1: medCodes[0] ? medCodes[0].code : ''
                });
            }
        }
    }

    const ws = XLSX.utils.json_to_sheet(rows, {header: headers});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventaire");
    XLSX.writeFile(wb, `Inventaire_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
}