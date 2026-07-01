exports.handler = async function (event) {
  const API_KEY = process.env.INSEE_API_KEY;
  const params  = event.queryStringParameters || {};
  const nafCodes = (params.naf || '').split(',').filter(Boolean);
  const dept     = (params.dept || '').trim();
  const cp       = (params.cp   || '').trim();

  if (!nafCodes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'naf manquant' }) };
  }

  // Guillemets autour de chaque code NAF pour gérer le point (ex: 10.71C)
  const nafQuery = nafCodes.map(n => `activitePrincipaleEtablissement:"${n.trim()}"`).join(' OR ');

  let geoFilter = '';
  if (cp) {
    geoFilter = ` AND codePostalEtablissement:${cp}`;
  } else if (dept) {
    const d = dept.length === 1 ? '0' + dept : dept;
    geoFilter = ` AND codePostalEtablissement:[${d}000 TO ${d}999]`;
  }

  const q = `(${nafQuery}) AND etatAdministratifEtablissement:A${geoFilter}`;
  const url = `https://api.insee.fr/api-sirene/3.11/siret?q=${encodeURIComponent(q)}&nombre=200&tri=denominationUniteLegale&ordre=asc`;

  console.log('URL:', url);

  try {
    const resp = await fetch(url, {
      headers: {
        'X-INSEE-Api-Key-Integration': API_KEY,
        'Accept': 'application/json',
      },
    });

    if (resp.status === 404) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ total: 0, results: [] }),
      };
    }

    if (!resp.ok) {
      const txt = await resp.text();
      console.error(`INSEE ${resp.status}:`, txt.slice(0, 400));
      return {
        statusCode: resp.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `INSEE API ${resp.status}`, detail: txt.slice(0, 300) }),
      };
    }

    const data = await resp.json();

    const results = (data.etablissements || []).map(e => {
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

      return {
        nom: nom.trim(),
        siren: e.siren || '',
        siret: e.siret || '',
        adresse,
        ville: adr.libelleCommuneEtablissement || '',
        cp: adr.codePostalEtablissement || '',
        naf: per?.activitePrincipaleEtablissement || '',
        effectif: decodeEffectif(e.trancheEffectifsEtablissement),
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ total: data.header?.total || results.length, results }),
    };

  } catch (err) {
    console.error('Erreur:', err.message);
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
