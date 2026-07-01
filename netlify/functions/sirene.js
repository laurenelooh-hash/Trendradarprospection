exports.handler = async function (event) {
  const API_KEY = process.env.INSEE_API_KEY;
  const params  = event.queryStringParameters || {};
  const nafCodes = (params.naf || '').split(',').filter(Boolean);

  if (!nafCodes.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'naf manquant' }) };
  }

  // Test sans filtre geo pour isoler le problème
  const q = `activitePrincipaleEtablissement:${nafCodes[0].trim()} AND etatAdministratifEtablissement:A`;
  const url = `https://api.insee.fr/api-sirene/3.11/siret?q=${encodeURIComponent(q)}&nombre=5`;

  console.log('URL testée:', url);

  try {
    const resp = await fetch(url, {
      headers: {
        'X-INSEE-Api-Key-Integration': API_KEY,
        'Accept': 'application/json',
      },
    });

    const txt = await resp.text();
    console.log(`Statut: ${resp.status}`, txt.slice(0, 500));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ statut: resp.status, reponse: txt.slice(0, 500) }),
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
