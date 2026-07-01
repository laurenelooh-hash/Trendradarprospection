exports.handler = async function (event) {
  const API_KEY = process.env.INSEE_API_KEY;
  const params  = event.queryStringParameters || {};

  const nafCodes = (params.naf || '').split(',').filter(Boolean);
  const dept     = (params.dept || '').trim();
  const cp       = (params.cp   || '').trim();

  if (!nafCodes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Paramètre naf manquant' }) };
  }

  const results = [];
  let totalGlobal = 0;

  for (const naf of nafCodes) {
    let geoFilter = '';
    if (cp) {
      geoFilter = ` AND codePostalEtablissement:${cp}`;
    } else if (dept) {
      const d = dept.padStart(2, '0');
      geoFilter = ` AND codePostalEtablissement:${d}*`;
    }

    const nafForQuery = naf.trim();
    const q = `activitePrincipaleEtablissement:"${nafForQuery}" AND etatAdministratifEtablissement:A${geoFilter}`;
    const url = `https://api.insee.fr/api-sirene/3.11/siret?q=${encodeURIComponent(q)}&nombre=200&champs=denominationUsuelleUniteLegale,denominationUniteLegale,nomUsageUniteLegale,prenom1UniteLegale,nomUniteLegale,siren,siret,numeroVoieEtablissement,typeVoieEtablissement,libelleVoieEtablissement,codePostalEtablissement,libelleCommuneEtablissement,activitePrincipaleEtablissement,trancheEffectifsEtablissement&tri=denominationUniteLegale&ordre=asc`;

    try {
      const resp = await fetch(url, {
        headers: {
          'X-INSEE-Api-Key-Integration': API_KEY,
          'Accept': 'application/json',
        },
      });

      if (resp.status === 404) continue;

      if (!resp.ok) {
        const txt = await resp.text();
        console.error(`INSEE error ${resp.status} for NAF ${naf}:`, txt.slice(0, 200));
        continue;
      }

      const data = await resp.json();
      totalGlobal += data.header?.total || 0;

      (data.etablissements || []).forEach(e => {
        const ul  = e.uniteLegale || {};
        const adr = e.adresseEtablissement || {};
        const per = Array.isArray(e.periodesEtablissement) ? e.periodesEtablissement[0] : {};

        const nom = ul.denominationUsuelleUniteLegale
          || ul.denominationUniteLegale
          || [ul.prenom1UniteLegale, ul.nomUsageUniteLegale || ul.nomUniteLegale].filter(Boolean).join(' ')
          || '—';

        const adresse = [
          adr.numeroVoieEtablissement,
          adr.typeVoieEtablissement,
          adr.libelleVoieEtablissement,
          adr.codePostalEtablissement,
          adr.libelleCommuneEtablissement,
        ].filter(Boolean).join(' ') || '—';

        results.push({
          nom:      nom.trim(),
          siren:    e.siren || '',
          siret:    e.siret || '',
          adresse,
          ville:    adr.libelleCommuneEtablissement || '',
          cp:       adr.codePostalEtablissement || '',
          naf:      per?.activitePrincipaleEtablissement || naf,
          effectif: decodeEffectif(e.trancheEffectifsEtablissement),
        });
      });

    } catch (err) {
      console.error(`Fetch error for NAF ${naf}:`, err.message);
    }
  }

  const seen = new Set();
  const unique = results.filter(r => {
    if (!r.siren || seen.has(r.siren)) return false;
    seen.add(r.siren); return true;
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ total: totalGlobal, results: unique }),
  };
};

const EFFECTIF = {
  NN:'Non renseigné','00':'0 sal.','01':'1-2 sal.','02':'3-5 sal.',
  '03':'6-9 sal.','11':'10-19 sal.','12':'20-49 sal.','21':'50-99 sal.',
  '22':'100-199 sal.','31':'200-249 sal.','32':'250-499 sal.',
  '41':'500-999 sal.','42':'1 000-1 999 sal.','51':'2 000-4 999 sal.',
  '52':'5 000-9 999 sal.','53':'10 000+ sal.',
};
function decodeEffectif(c) { return EFFECTIF[c] || (c || '—'); }
