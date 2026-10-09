const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase-admin/app');
const { cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./serviceAccountKey.json');

require('dotenv').config();

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const app = express();

app.use(cors());
app.use(express.json());

// ─── Middleware sécurité ───────────────────────────────────────────
function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Clé API invalide ou manquante' });
  }
  next();
}

// ─── Haversine (distance en km entre 2 coordonnées GPS) ───────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GET /pharmacies/nearby ────────────────────────────────────────
// ⚠️ DOIT être placée AVANT GET /pharmacies/:id sinon Express
// interprétera "nearby" comme un :id
app.get('/pharmacies/nearby', async (req, res) => {
  try {
    let { lat, lng, radius = 5 } = req.query;
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    radius = parseFloat(radius);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'lat et lng sont requis' });
    }

    // Récupère toutes les pharmacies depuis Firestore
    const snapshot = await db.collection('pharmacies').get();
    const allPharmacies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filtre + calcule distance pour chaque pharmacie
    const withDistance = allPharmacies
      .filter(p => p.latitude && p.longitude) // ignore les docs sans coords
      .map(p => ({
        ...p,
        distance: haversineDistance(lat, lng, p.latitude, p.longitude),
      }));

    let nearby = withDistance
      .filter(p => p.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    // Auto-élargissement si moins de 3 résultats
    let expanded = false;
    if (nearby.length < 3 && radius < 20) {
      radius = radius * 2;
      nearby = withDistance
        .filter(p => p.distance <= radius)
        .sort((a, b) => a.distance - b.distance);
      expanded = true;
    }

    res.json({
      data: nearby,
      radiusUsed: radius,
      expanded,
      total: nearby.length,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /pharmacies ───────────────────────────────────────────────
app.get('/pharmacies', async (req, res) => {
  try {
    const snapshot = await db.collection('pharmacies').get();
    const pharmacies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(pharmacies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /pharmacies/:id ───────────────────────────────────────────
app.get('/pharmacies/:id', async (req, res) => {
  try {
    const doc = await db.collection('pharmacies').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Pharmacie non trouvée' });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /pharmacies ──────────────────────────────────────────────
app.post('/pharmacies', verifyApiKey, async (req, res) => {
  try {
    const data = req.body;
    const docRef = await db.collection('pharmacies').add(data);
    res.status(201).json({ id: docRef.id, ...data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PUT /pharmacies/:id ───────────────────────────────────────────
app.put('/pharmacies/:id', verifyApiKey, async (req, res) => {
  try {
    const data = req.body;
    await db.collection('pharmacies').doc(req.params.id).update(data);
    res.json({ id: req.params.id, ...data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── DELETE /pharmacies/:id ────────────────────────────────────────
app.delete('/pharmacies/:id', verifyApiKey, async (req, res) => {
  try {
    await db.collection('pharmacies').doc(req.params.id).delete();
    res.json({ message: 'Pharmacie supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Route de test ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'API PharmaDakar fonctionne !' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});