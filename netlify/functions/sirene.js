exports.handler = async function (event) {
  const API_KEY = process.env.INSEE_API_KEY;
  const params  = event.queryStringParameters || {};

  // Construire la requête vers l'API INSEE Sirene V3.11
  const nafCodes = (params.naf || '').split(',').filter(Boolean);
  const dept     = params.dept || '';
  const cp       = params.cp   || '';

  if (!nafCodes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Paramètre naf manquant' }) };
  }

  // Construire la query Sirene
  const nafQuery = nafCodes.map(n => `activitePrincipaleEtablissement:"${n.trim()}"`).join(' OR ');
  let q = `(${nafQuery}) AND etatAdministratifEtablissement:A`;

  if (cp)   q += ` AND codePostalEtablissement:${cp}*`;
  else if (dept) {
    const d = dept.padStart(2, '0');
    // DOM-TOM : 971-976 → 3 chiffres
    q += ` AND codePostalEtablissement:${d}*`;
  }

  const fields = [
    'denominationUsuelleUniteLegale',
    'denominationUniteLegale',
    'nomUsageUniteLegale',
    'prenom1UniteLegale',
    'nomUniteLegale',
    'siren',
    'siret',
    'numeroVoieEtablissement',
    'typeVoieEtablissement',
    'libelleVoieEtablissement',
    'codePostalEtablissement',
    'libelleCommuneEtablissement',
    'activitePrincipaleEtablissement',
    'trancheEffectifsEtablissement',
    'etatAdministratifEtablissement',
  ].join(',');

  const url = `https://api.insee.fr/api-sirene/3.11/siret?q=${encodeURIComponent(q)}&nombre=200&champs=${fields}&tri=denominationUniteLegale&ordre=asc`;

  try {
    const resp = await fetch(url, {
      headers: {
        'X-INSEE-Api-Key-Integration': API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return {
        statusCode: resp.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `INSEE API ${resp.status}`, detail: txt.slice(0, 300) }),
      };
    }

    const data = await resp.json();

    // Normaliser les résultats
    const results = (data.etablissements || []).map(e => {
      const ul  = e.uniteLegale || {};
      const adr = e.adresseEtablissement || {};
      const per = (e.periodesEtablissement || [])[0] || {};

      const nom = ul.denominationUsuelleUniteLegale
        || ul.denominationUniteLegale
        || ((ul.prenom1UniteLegale || '') + ' ' + (ul.nomUsageUniteLegale || ul.nomUniteLegale || '')).trim()
        || '—';

      const adresse = [
        adr.numeroVoieEtablissement,
        adr.typeVoieEtablissement,
        adr.libelleVoieEtablissement,
        adr.codePostalEtablissement,
        adr.libelleCommuneEtablissement,
      ].filter(Boolean).join(' ') || '—';

      const eff = decodeEffectif(e.trancheEffectifsEtablissement);

      return {
        nom,
        siren:    e.siren || '',
        siret:    e.siret || '',
        adresse,
        ville:    adr.libelleCommuneEtablissement || '',
        cp:       adr.codePostalEtablissement || '',
        naf:      per.activitePrincipaleEtablissement || '',
        effectif: eff,
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        total:   data.header?.total || results.length,
        results,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

const EFFECTIF = {
  NN:'Non renseigné','00':'0 sal.','01':'1-2 sal.','02':'3-5 sal.',
  '03':'6-9 sal.','11':'10-19 sal.','12':'20-49 sal.','21':'50-99 sal.',
  '22':'100-199 sal.','31':'200-249 sal.','32':'250-499 sal.',
  '41':'500-999 sal.','42':'1 000-1 999 sal.','51':'2 000-4 999 sal.',
  '52':'5 000-9 999 sal.','53':'10 000+ sal.',
};
function decodeEffectif(c) { return EFFECTIF[c] || (c || '—'); }
