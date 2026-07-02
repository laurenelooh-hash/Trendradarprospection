exports.handler = async function (event) {
  const params   = event.queryStringParameters || {};
  const nafCodes = (params.naf || '').split(',').filter(Boolean);
  const dept     = (params.dept || '').trim();
  const cp       = (params.cp   || '').trim();

  if (!nafCodes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'naf manquant' }) };
  }

  const results = [];
  let totalGlobal = 0;

  for (const naf of nafCodes.slice(0, 3)) {
    // Paginer pour récupérer jusqu'à 200 résultats (8 pages x 25)
    for (let page = 1; page <= 8; page++) {
      const p = new URLSearchParams({
        activite_principale: naf.trim(),
        per_page: '25',
        page: String(page),
      });
      if (cp)        p.set('code_postal', cp);
      else if (dept) p.set('departement', dept.padStart(2, '0'));

      const url = `https://recherche-entreprises.api.gouv.fr/search?${p}`;

      try {
        const resp = await fetch(url);
        if (!resp.ok) break;
        const data = await resp.json();

        const pageResults = data.results || [];
        if (pageResults.length === 0) break; // plus de résultats

        if (page === 1) totalGlobal += data.total_results || 0;

        pageResults.forEach(r => {
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

        // Si on a moins de 25 résultats c'est la dernière page
        if (pageResults.length < 25) break;

      } catch(err) {
        console.error('Erreur:', err.message);
        break;
      }
    }
  }

  // Dédupliquer par SIREN
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
