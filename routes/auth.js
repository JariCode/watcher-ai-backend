import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import requireAuth from '../middleware/requireAuth.js';
import Conversation from '../models/Conversation.js';

// Luodaan reititin johon kerätään auth-reitit
const router = express.Router();

// Evästeen asetukset. Tuotannossa eväste kulkee Electronista Renderiin eri
// originien välillä, joten sameSite on 'none' ja secure pakollinen.
// Kehityksessä (localhost) käytetään 'lax' ilman securea.
const isProduction = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,                              // JS ei pääse käsiksi (suoja XSS:ää vastaan)
  secure: isProduction,                        // HTTPS-vaatimus tuotannossa (Render on HTTPS)
  sameSite: isProduction ? 'none' : 'lax',     // 'none' sallii cross-origin tuotannossa
  partitioned: isProduction,                   // CHIPS: vaaditaan cross-origin-evästeelle uusissa selaimissa
  maxAge: 7 * 24 * 60 * 60 * 1000,             // 7 päivää millisekunteina
};

// Apufunktio: luo JWT-token ja asettaa sen httpOnly-evästeeseen
function setTokenCookie(res, userId) {
  // Allekirjoitetaan token. Payloadina käyttäjän id, salaisuus .env-tiedostosta.
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  
  // Asetetaan eväste vastaukseen
  res.cookie('token', token, cookieOptions);
}

// --- REKISTERÖINTI ---
// Luo uuden käyttäjän. Tunnuksen on oltava uniikki ja salasanan vähintään 8 merkkiä.
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Tyyppivahdit: varmistetaan että syötteet ovat merkkijonoja.
    // Estää NoSQL-injektiot (esim. jos joku lähettäisi objektin tai taulukon).
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Virheelliset kentät.' });
    }

    // Siistitään käyttäjätunnus (poistetaan turhat välilyönnit alusta ja lopusta)
    const trimmedUsername = username.trim();

    // Validointi: pituusrajoitukset (sama kuin frontendissä)
    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      return res.status(400).json({ error: 'Käyttäjätunnuksen on oltava 3-30 merkkiä.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Salasanan on oltava vähintään 8 merkkiä.' });
    }

    // Tarkistetaan onko tunnus jo käytössä.
    // Hakuehdossa käytetään collation-asetusta (locale: 'fi', strength: 2),
    // mikä tekee hausta case-insensitive-haun (esim. "Matti" ja "matti" ovat sama asia).
    const existingUser = await User.findOne({ username: trimmedUsername })
      .collation({ locale: 'fi', strength: 2 });
      
    if (existingUser) {
      return res.status(400).json({ error: 'Käyttäjätunnus on jo varattu.' });
    }

    // Hashataan salasana ennen tallennusta. Salt rounds = 12 (turvallinen ja vahva).
    const hashedPassword = await bcrypt.hash(password, 12);

    // Luodaan uusi käyttäjä tietokantaan. Ensimmäinen käyttäjä saa defaultina roolin 'user'.
    const newUser = new User({
      username: trimmedUsername,
      password: hashedPassword,
    });

    await newUser.save();

    // Kirjataan käyttäjä suoraan sisään luomalla token-eväste
    setTokenCookie(res, newUser._id);

    // Palautetaan käyttäjän tiedot (ei salasanaa!) frontendille
    res.status(201).json({
      id: newUser._id,
      username: newUser.username,
      role: newUser.role,
    });
  } catch (error) {
    console.error('Rekisteröinti epäonnistui:', error.message);
    res.status(500).json({ error: 'Rekisteröinti epäonnistui.' });
  }
});

// --- KIRJAUTUMINEN ---
// Tarkistaa tunnuksen ja salasanan, asettaa evästeen.
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Tyyppivahdit NoSQL-injektioiden estämiseksi
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Virheelliset kentät.' });
    }

    const trimmedUsername = username.trim();

    // Haetaan käyttäjä tunnuksella (case-insensitive)
    const user = await User.findOne({ username: trimmedUsername })
      .collation({ locale: 'fi', strength: 2 });

    // Jos käyttäjää ei löydy, älä paljasta sitä erikseen tietoturvasyistä
    if (!user) {
      return res.status(401).json({ error: 'Väärä käyttäjätunnus tai salasana.' });
    }

    // Verrataan annettua salasanaa hashattuun salasanaan
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Väärä käyttäjätunnus tai salasana.' });
    }

    // Salasana oikein → luodaan token-eväste
    setTokenCookie(res, user._id);

    // Palautetaan käyttäjätiedot frontendille
    res.json({
      id: user._id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    console.error('Kirjautuminen epäonnistui:', error.message);
    res.status(500).json({ error: 'Kirjautuminen epäonnistui.' });
  }
});

// --- ULOSKIRJAUTUMINEN ---
// Poistaa token-evästeen selaimesta.
router.post('/logout', (req, res) => {
  // Tyhjennetään eväste samoilla asetuksilla kuin se luotiin
  res.clearCookie('token', cookieOptions);
  res.json({ message: 'Kirjattu ulos.' });
});

// --- HAE OMAT TIEDOT (ME) ---
// Palauttaa kirjautuneen käyttäjän tiedot (käytetään kun sivu ladataan uudestaan).
router.get('/me', requireAuth, async (req, res) => {
  try {
    // requireAuth asetti req.userId:n, haetaan sillä käyttäjä
    const user = await User.findById(req.userId).select('username role');
    if (!user) {
      return res.status(401).json({ error: 'Käyttäjää ei löydy.' });
    }

    res.json({
      id: user._id,
      username: user.username,
      role: user.role,
    });
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

    // Tyyppivahti myös tässä: salasanan on oltava merkkijono
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Salasana vaaditaan tilin poistoon.' });
    }

    // Haetaan käyttäjä
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });
    }

    // ESTO: Estetään admin-käyttäjää poistamasta omaa tiliään,
    // jotta sovellus ei jää vahingossakaan ilman ylläpitäjää.
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Admin-käyttäjä ei voi poistaa omaa tiliään.' });
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

    // Poistetaan token-eväste samoilla asetuksilla kuin se asetettiin
    res.clearCookie('token', cookieOptions);

    res.json({ message: 'Tili ja kaikki keskustelut poistettu.' });
  } catch (error) {
    console.error('Tilin poisto epäonnistui:', error.message);
    res.status(500).json({ error: 'Tilin poisto epäonnistui.' });
  }
});

export default router;