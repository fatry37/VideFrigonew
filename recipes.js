// api/recipes.js — Proxy sécurisé Vercel · Google Gemini 2.0 Flash (FREE TIER)
// La clé GEMINI_API_KEY reste côté serveur, jamais exposée au navigateur.
// Free tier : 1 500 requêtes/jour · 15 req/min · totalement gratuit

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Méthode non autorisée.' });

  const { ingredients, mode, goal, recomp, systemPrompt, userMsg } = req.body;

  if (!ingredients || ingredients.length < 2) {
    return res.status(400).json({ error: 'Minimum 2 ingrédients requis.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé API Gemini manquante. Vérifiez vos variables d\'environnement Vercel.' });
  }

  // Gemini 2.0 Flash — modèle gratuit le plus capable
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // System instruction séparée (meilleure qualité que de la mettre dans le user message)
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userMsg }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          // Force la réponse en JSON pur — Gemini respecte ça très bien
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errBody);

      // Message d'erreur lisible selon le code HTTP
      if (geminiRes.status === 429) {
        return res.status(429).json({ error: 'Limite gratuite atteinte (15 req/min). Réessayez dans une minute.' });
      }
      if (geminiRes.status === 400) {
        return res.status(400).json({ error: 'Requête invalide. Vérifiez les ingrédients saisis.' });
      }
      return res.status(502).json({ error: `Erreur API Gemini (${geminiRes.status}).` });
    }

    const data = await geminiRes.json();

    // Extraire le texte de la réponse Gemini
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      console.error('Gemini empty response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Réponse vide de Gemini.' });
    }

    // Avec responseMimeType: 'application/json', Gemini renvoie du JSON pur
    // On nettoie quand même les éventuelles balises markdown au cas où
    const clean  = raw.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);

  } catch (e) {
    console.error('Server error:', e);
    if (e instanceof SyntaxError) {
      return res.status(502).json({ error: 'Réponse JSON invalide de Gemini. Réessayez.' });
    }
    return res.status(500).json({ error: 'Erreur serveur interne.' });
  }
}
