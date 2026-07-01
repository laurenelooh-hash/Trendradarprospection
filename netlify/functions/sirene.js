exports.handler = async function (event) {
  const params  = event.queryStringParameters || {};
  const nafCodes = (params.naf || '').split(',').filter(Boolean);
  const dept     = (params.dept || '').trim();
  const cp       = (params.cp   || '').trim();

  if (!nafCodes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'naf manquant' }) };
  }

  const results = [];
  let totalGlobal = 0;

  for (const naf of nafCodes.slice(0, 3)) {
    const p = new URLSearchParams({
      activite_principale: naf.trim(),
      per_page: '25',
      page: '1',
    });
    if (cp)        p.set('code_postal', cp);
    else if (dept) p.set('departement', dept.padStart(2, '0'));

    const url = `https://recherche-entreprises.api.gouv.fr/search?${p}`;
    console.log('URL:', url);

    try {
      const resp = await fetch(url);
      if (!resp.ok) { console.error(`Erreur ${resp.status} NAF ${naf}`); continue; }
      const data = await resp.json();
      totalGlobal += data.total_results || 0;

      (data.results || []).forEach(r => {
        results.push({
          nom:      r.nom_complet || r.nom_raison_sociale || '—',
          siren:    r.siren || '',
          siret:    r.siege?.siret || '',
          adresse:  buildAddr(r.siege),
          ville:    r.siege?.libelle_commune || '',
          cp:       r.siege?.code_postal || '',
          naf:      r.activite_principale || naf,
          effectif: r.tranche_effectif_salarie || '—',
        });
      });
    } catch(err) { console.error('Erreur:', err.message); }
  }

  const seen = new Set();
  const unique = results.filter(r => {
    if (!r.siren || seen.has(r.siren)) return false;
    seen.add(r.siren); return true;
  }).sort((a,b) => a.nom.localeCompare(b.nom,'fr'));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ total: totalGlobal, results: unique }),
  };
};

function buildAddr(s) {
  if (!s) return '—';
  return [s.numero_voie, s.type_voie, s.libelle_voie, s.code_postal, s.libelle_commune].filter(Boolean).join(' ') || '—';
}
