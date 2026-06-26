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

// Middleware de sécurité - vérifie la clé secrète pour les routes sensibles
function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Clé API invalide ou manquante' });
  }
  next();
}

// GET /pharmacies - récupérer toutes les pharmacies
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

// GET /pharmacies/:id - récupérer une pharmacie précise
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

// POST /pharmacies - ajouter une pharmacie
app.post('/pharmacies', verifyApiKey, async (req, res) => {
  try {
    const data = req.body;
    const docRef = await db.collection('pharmacies').add(data);
    res.status(201).json({ id: docRef.id, ...data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /pharmacies/:id - modifier une pharmacie
app.put('/pharmacies/:id', verifyApiKey, async (req, res) => {
  try {
    const data = req.body;
    await db.collection('pharmacies').doc(req.params.id).update(data);
    res.json({ id: req.params.id, ...data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /pharmacies/:id - supprimer une pharmacie
app.delete('/pharmacies/:id', verifyApiKey, async (req, res) => {
  try {
    await db.collection('pharmacies').doc(req.params.id).delete();
    res.json({ message: 'Pharmacie supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route de test
app.get('/', (req, res) => {
  res.json({ message: 'API PharmaDakar fonctionne !' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});