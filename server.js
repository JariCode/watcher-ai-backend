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

// Luodaan Express-sovellus
const app = express();

// --- Middlewaret (väliohjelmat jotka käsittelevät jokaisen pyynnön) ---

// Turvallisuusotsakkeet
app.use(helmet());

// Sallitaan frontendin kutsut ja evästeiden lähetys
app.use(cors({
  origin: 'http://localhost:5173', // Viten kehitysosoite
  credentials: true,                // sallii evästeet (JWT-token)
}));

// Muuttaa pyyntöjen JSON-rungon käytettäväksi (req.body)
app.use(express.json());

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