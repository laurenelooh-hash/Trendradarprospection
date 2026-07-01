exports.handler = async function (event) {
  const API_KEY = process.env.INSEE_API_KEY;
  const params  = event.queryStringParameters || {};
  const nafCodes = (params.naf || '').split(',').filter(Boolean);
  const dept     = (params.dept || '').trim();
  const cp       = (params.cp   || '').trim();

  if (!nafCodes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'naf manquant' }) };
  }

  const results = [];
  let totalGlobal = 0;

  for (const naf of nafCodes) {
    let geoFilter = '';
    if (cp) {
      geoFilter = ` AND codePostalEtablissement:${cp}`;
    } else if (dept) {
      const d = dept.length === 1 ? '0' + dept : dept;
      geoFilter = ` AND codePostalEtablissement:[${d}000 TO ${d}999]`;
    }

    const q = `activitePrincipaleEtablissement:${naf.trim()} AND etatAdministratifEtablissement:A${geoFilter}`;
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
        console.error(`INSEE ${resp.status} NAF ${naf}:`, txt.slice(0,300));
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
          ||
