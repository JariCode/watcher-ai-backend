import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import requireAuth from '../middleware/requireAuth.js';
import Conversation from '../models/Conversation.js';

// Luodaan reititin johon kerätään auth-reitit
const router = express.Router();

// Apufunktio: luo JWT-token ja asettaa sen httpOnly-evästeeseen
function setTokenCookie(res, userId) {
  // Allekirjoitetaan token käyttäjän id:llä
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN, // esim. 7d
  });

  // Asetetaan token evästeeseen jota selaimen JS ei pääse lukemaan
  res.cookie('token', token, {
    httpOnly: true,                                  // JS ei pääse käsiksi (suoja XSS:ää vastaan)
    secure: process.env.NODE_ENV === 'production',   // vain HTTPS tuotannossa
    sameSite: 'lax',                                 // suoja CSRF:ää vastaan
    maxAge: 7 * 24 * 60 * 60 * 1000,                 // 7 päivää millisekunteina
  });
}

// --- REKISTERÖINTI ---
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Tarkistetaan että molemmat kentät on annettu
    if (!username || !password) {
      return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan.' });
    }

    // Salasanan minimipituus tarkistetaan myös täällä (ei vain frontendissa)
    if (password.length < 8) {
      return res.status(400).json({ error: 'Salasanan on oltava vähintään 8 merkkiä.' });
    }

    // Tarkistetaan ettei käyttäjätunnus ole jo varattu
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Käyttäjätunnus on jo käytössä.' });
    }

    // Hashataan salasana — ei koskaan tallenneta selkokielisenä
    const hashedPassword = await bcrypt.hash(password, 10);

    // Luodaan käyttäjä tietokantaan
    const user = await User.create({ username, password: hashedPassword });

    // Kirjataan käyttäjä heti sisään (token evästeeseen)
    setTokenCookie(res, user._id);

    // Palautetaan käyttäjän tiedot (EI salasanaa)
    res.status(201).json({ id: user._id, username: user.username, role: user.role });
  } catch (error) {
    console.error('Rekisteröintivirhe:', error.message);
    res.status(500).json({ error: 'Rekisteröinti epäonnistui.' });
  }
});

// --- KIRJAUTUMINEN ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan.' });
    }

    // Etsitään käyttäjä
    const user = await User.findOne({ username });

    // Tarkistetaan käyttäjä JA salasana — sama virheviesti molempiin
    // (ei paljasteta kumpi meni väärin, turvallisuussyy)
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Väärä käyttäjätunnus tai salasana.' });
    }

    // Kirjataan sisään
    setTokenCookie(res, user._id);

    res.json({ id: user._id, username: user.username, role: user.role });
  } catch (error) {
    console.error('Kirjautumisvirhe:', error.message);
    res.status(500).json({ error: 'Kirjautuminen epäonnistui.' });
  }
});

// --- ULOSKIRJAUTUMINEN ---
router.post('/logout', (req, res) => {
  // Poistetaan token-eväste
  res.clearCookie('token');
  res.json({ message: 'Uloskirjautuminen onnistui.' });
});

// --- KUKA ON KIRJAUTUNUT ---
// Frontend kutsuu tätä latautuessaan: jos token on voimassa, palautetaan käyttäjä
router.get('/me', requireAuth, async (req, res) => {
  try {
    // Haetaan käyttäjä, mukaan myös rooli
    const user = await User.findById(req.userId).select('username role');

    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });
    }

    res.json({ id: user._id, username: user.username, role: user.role });
  } catch (error) {
    console.error('Käyttäjän haku epäonnistui:', error.message);
    res.status(500).json({ error: 'Käyttäjän haku epäonnistui.' });
  }
});

// --- TILIN POISTO ---
// Vaatii salasanan varmistukseksi. Poistaa käyttäjän JA kaikki hänen keskustelunsa.
router.delete('/delete', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Salasana vaaditaan tilin poistoon.' });
    }

    // Haetaan käyttäjä
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });
    }

    // Varmistetaan salasana ennen poistoa
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Väärä salasana.' });
    }

    // Poistetaan kaikki käyttäjän keskustelut
    await Conversation.deleteMany({ userId: req.userId });

    // Poistetaan käyttäjä
    await User.findByIdAndDelete(req.userId);

    // Poistetaan token-eväste (kirjaudutaan ulos)
    res.clearCookie('token');

    res.json({ message: 'Tili ja kaikki keskustelut poistettu.' });
  } catch (error) {
    console.error('Tilin poisto epäonnistui:', error.message);
    res.status(500).json({ error: 'Tilin poisto epäonnistui.' });
  }
});

export default router;