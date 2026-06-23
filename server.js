// Tuodaan tarvittavat kirjastot
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversations.js';
import adminRoutes from './routes/admin.js';
import transcribeRoutes from './routes/transcribe.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiters.js';

// Luodaan Express-sovellus
const app = express();

// Render on välityspalvelimen (proxy) takana. Tämä kertoo Expressille että se
// saa luottaa proxyn otsakkeisiin, jotta secure-eväste ja oikea IP toimivat.
// Oikean IP:n saaminen on tärkeää myös rate limitille (muuten kaikki pyynnöt
// näyttäisivät tulevan samasta osoitteesta).
app.set('trust proxy', 1);

// --- Middlewaret (väliohjelmat jotka käsittelevät jokaisen pyynnön) ---

// Turvallisuusotsakkeet. Tämä on JSON-API, joten viritetään helmet:
// - HSTS pakottaa selaimen käyttämään HTTPS:ää (1 vuosi, myös alidomainit)
// - referrerPolicy ei vuoda täyttä osoitetta ulkopuolisille
app.use(helmet({
  hsts: {
    maxAge: 31536000,        // 1 vuosi sekunteina
    includeSubDomains: true,
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
}));

// Yleinen pyyntöraja koko API:lle (liikakäytön suoja).
// Asetetaan ennen reittejä, jotta se kattaa kaiken /api-liikenteen.
app.use('/api', apiLimiter);

// Sallitut originit ympäristömuuttujasta. Tuotannossa ei ole localhost-oletusta
// (origin on pakko asettaa), kehityksessä localhost on oletus jos muuttujaa ei ole.
const defaultOrigins = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:5173';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);   // poistaa tyhjät (jos lista on tyhjä)

// Sallitaan frontendin kutsut ja evästeiden lähetys
app.use(cors({
  origin: (origin, callback) => {
    // Sallitaan myös pyynnöt ilman originia (esim. Electronin paikallinen palvelin
    // tai palvelinten väliset kutsut), sekä listalla olevat originit
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin ei ole sallittu'));
    }
  },
  credentials: true,                // sallii evästeet (JWT-token)
}));

// Muuttaa pyyntöjen JSON-rungon käytettäväksi (req.body)
// Nostettu raja, jotta base64-kuvat ja äänileikkeet mahtuvat pyynnön runkoon
app.use(express.json({ limit: '10mb' }));

// Lukee evästeet (JWT-token tulee evästeestä)
app.use(cookieParser());

// --- Testireitti: tarkistaa että palvelin vastaa ---
app.get('/api/test', (req, res) => {
  res.json({ message: 'Watcher näkee sinut. Palvelin toimii.' });
});

// --- Reitit ---
// Auth-reitit (rekisteröinti, kirjautuminen, uloskirjautuminen).
// authLimiter suojaa brute force -arvailulta (tiukempi kuin yleinen raja).
app.use('/api/auth', authLimiter, authRoutes);

// Keskustelureitit (vaativat kirjautumisen)
app.use('/api/conversations', conversationRoutes);

// Admin-reitit (vaativat admin-roolin)
app.use('/api/admin', adminRoutes);

// Puheentunnistusreitti (vaatii kirjautumisen). Ottaa äänileikkeen ja
// palauttaa tekstin OpenAI Whisperin avulla.
app.use('/api/transcribe', transcribeRoutes);

// --- Yhteys MongoDB Atlasiin ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Yhteys MongoDB Atlasiin onnistui');

    // Käynnistetään palvelin vasta kun tietokantayhteys on valmis
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Palvelin käynnissä portissa ${PORT}`);
    });
  })
  .catch((error) => {
    // Jos yhteys epäonnistuu, tulostetaan virhe eikä käynnistetä palvelinta
    console.error('Tietokantayhteys epäonnistui:', error.message);
  });