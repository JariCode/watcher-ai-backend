import express from 'express';
import Conversation from '../models/Conversation.js';
import requireAuth from '../middleware/requireAuth.js';

const router = express.Router();

// Kaikki tämän tiedoston reitit vaativat kirjautumisen
router.use(requireAuth);

// --- HAE KAIKKI KÄYTTÄJÄN KESKUSTELUT (lista) ---
router.get('/', async (req, res) => {
  try {
    // Haetaan vain kirjautuneen käyttäjän keskustelut, uusimmat ensin
    // Ei haeta viestejä mukaan (vain otsikko ja aika) — kevyempi lista
    const conversations = await Conversation
      .find({ userId: req.userId })
      .select('title createdAt updatedAt')
      .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (error) {
    console.error('Keskustelujen haku epäonnistui:', error.message);
    res.status(500).json({ error: 'Keskustelujen haku epäonnistui.' });
  }
});

// --- HAE YKSI KESKUSTELU VIESTEINEEN ---
router.get('/:id', async (req, res) => {
  try {
    // Haetaan keskustelu jonka id JA userId täsmäävät
    // userId-ehto estää toisen käyttäjän keskustelun avaamisen
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Keskustelua ei löytynyt.' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Keskustelun haku epäonnistui:', error.message);
    res.status(500).json({ error: 'Keskustelun haku epäonnistui.' });
  }
});

// --- LUO UUSI KESKUSTELU ---
router.post('/', async (req, res) => {
  try {
    // Luodaan tyhjä keskustelu kirjautuneelle käyttäjälle
    const conversation = await Conversation.create({
      userId: req.userId,
      messages: [],
    });

    res.status(201).json(conversation);
  } catch (error) {
    console.error('Keskustelun luonti epäonnistui:', error.message);
    res.status(500).json({ error: 'Keskustelun luonti epäonnistui.' });
  }
});

// --- POISTA KESKUSTELU ---
router.delete('/:id', async (req, res) => {
  try {
    // Poistetaan vain jos keskustelu kuuluu kirjautuneelle käyttäjälle
    const result = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!result) {
      return res.status(404).json({ error: 'Keskustelua ei löytynyt.' });
    }

    res.json({ message: 'Keskustelu poistettu.' });
  } catch (error) {
    console.error('Keskustelun poisto epäonnistui:', error.message);
    res.status(500).json({ error: 'Keskustelun poisto epäonnistui.' });
  }
});

export default router;