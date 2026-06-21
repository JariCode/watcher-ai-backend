import express from 'express';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import requireAuth from '../middleware/requireAuth.js';
import requireAdmin from '../middleware/requireAdmin.js';

const router = express.Router();

// Kaikki admin-reitit vaativat: 1) kirjautumisen, 2) admin-roolin
// Järjestys on tärkeä: requireAuth asettaa req.userId, jota requireAdmin käyttää
router.use(requireAuth);
router.use(requireAdmin);

// --- HAE KAIKKI KÄYTTÄJÄT ---
router.get('/users', async (req, res) => {
  try {
    // Haetaan kaikki käyttäjät, EI salasanoja
    const users = await User.find().select('username role createdAt').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Käyttäjien haku epäonnistui:', error.message);
    res.status(500).json({ error: 'Käyttäjien haku epäonnistui.' });
  }
});

// --- POISTA KÄYTTÄJÄ (ja hänen keskustelunsa) ---
router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = req.params.id;

    // Admin ei voi poistaa itseään (estää vahingon)
    if (targetId === req.userId) {
      return res.status(400).json({ error: 'Et voi poistaa omaa tiliäsi täältä.' });
    }

    // Tarkistetaan että käyttäjä on olemassa
    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });
    }

    // Poistetaan käyttäjän kaikki keskustelut (sama ehto kuin tilin poistossa)
    await Conversation.deleteMany({ userId: targetId });

    // Poistetaan käyttäjä
    await User.findByIdAndDelete(targetId);

    res.json({ message: 'Käyttäjä ja hänen keskustelunsa poistettu.' });
  } catch (error) {
    console.error('Käyttäjän poisto epäonnistui:', error.message);
    res.status(500).json({ error: 'Käyttäjän poisto epäonnistui.' });
  }
});

// --- VAIHDA KÄYTTÄJÄN ROOLI ---
router.patch('/users/:id/role', async (req, res) => {
  try {
    const targetId = req.params.id;
    const { role } = req.body;

    // Sallitaan vain kelvolliset roolit
    if (role !== 'user' && role !== 'admin') {
      return res.status(400).json({ error: 'Virheellinen rooli.' });
    }

    // Admin ei voi muuttaa omaa rooliaan (estää että poistaa vahingossa omat oikeutensa)
    if (targetId === req.userId) {
      return res.status(400).json({ error: 'Et voi muuttaa omaa rooliasi.' });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });
    }

    target.role = role;
    await target.save();

    res.json({ id: target._id, username: target.username, role: target.role });
  } catch (error) {
    console.error('Roolin vaihto epäonnistui:', error.message);
    res.status(500).json({ error: 'Roolin vaihto epäonnistui.' });
  }
});

export default router;