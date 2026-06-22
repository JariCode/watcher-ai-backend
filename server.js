// Tuodaan tarvittavat kirjastot
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import requireAuth from './middleware/requireAuth.js';
import conversationRoutes from './routes/conversations.js';
import adminRoutes from './routes/admin.js';

// Luodaan Express-sovellus
const app = express();

// Render on välityspalvelimen (proxy) takana. Tämä kertoo Expressille että se
// saa luottaa proxyn otsakkeisiin, jotta secure-eväste toimii tuotannossa.
app.set('trust proxy', 1);

// --- Middlewaret (väliohjelmat jotka käsittelevät jokaisen pyynnön) ---

// Turvallisuusotsakkeet
app.use(helmet());

// Sallitut originit luetaan ympäristömuuttujasta (pilkulla eroteltuna).
// Näin oikeat osoitteet eivät päädy koodiin eivätkä GitHubiin.
// Esim. .env: ALLOWED_ORIGINS=http://localhost:5173
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

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
// Nostettu raja, jotta base64-kuvat mahtuvat pyynnön runkoon
app.use(express.json({ limit: '10mb' }));

// Lukee evästeet (JWT-token tulee evästeestä)
app.use(cookieParser());

// --- Testireitti: tarkistaa että palvelin vastaa ---
app.get('/api/test', (req, res) => {
  res.json({ message: 'Watcher näkee sinut. Palvelin toimii.' });
});

// --- Reitit ---
// Auth-reitit (rekisteröinti, kirjautuminen, uloskirjautuminen)
app.use('/api/auth', authRoutes);

// Keskustelureitit (vaativat kirjautumisen)
app.use('/api/conversations', conversationRoutes);

// Admin-reitit (vaativat admin-roolin)
app.use('/api/admin', adminRoutes);

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