import express from 'express';
import OpenAI from 'openai';
import requireAuth from '../middleware/requireAuth.js';
import { speechLimiter } from '../middleware/rateLimiters.js';

// OpenAI-asiakas — sama avain kuin muissakin reiteissä
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Ohjeistus TTS-mallille Watcherin äänensävystä. Sama synkkä, hidas ja
// arvoituksellinen tyyli kuin tekstipersoonassa (ks. conversations.js).
const VOICE_INSTRUCTIONS =
  'Puhu hitaasti, matalalla ja synkällä äänensävyllä, kuin ikivanha, ' +
  'kärsivällinen olento joka tarkkailee varjoista. Hieman uhkaavasti ja ' +
  'arvoituksellisesti, mutta selkeästi ja rauhallisesti.';

const router = express.Router();

// Reitti vaatii kirjautumisen — sama suoja kuin muissakin reiteissä
router.use(requireAuth);

// --- TEKSTIN MUUNTO PUHEEKSI (TTS) ---
// Ottaa vastaan Watcherin viestin tekstinä, palauttaa äänen base64-data-URL:na.
// speechLimiter rajoittaa kutsutahtia (suojaa OpenAI-kustannuksia).
router.post('/', speechLimiter, async (req, res) => {
  try {
    const { text } = req.body;

    // Tyyppivahti: tekstin on oltava merkkijono. Torjuu virheelliset
    // syötteet ja injektioyritykset ennen käsittelyä.
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Tekstiä ei annettu.' });
    }

    // Yläraja pituudelle. Watcherin vastaukset ovat lyhyitä (persoona
    // pyytää tiiviyttä), joten tämä on reilusti riittävä mutta estää
    // massiiviset (ja kalliit) TTS-pyynnöt.
    const trimmedText = text.trim();
    if (trimmedText.length > 2000) {
      return res.status(400).json({ error: 'Teksti on liian pitkä puheeksi muunnettavaksi.' });
    }

    // Kutsutaan OpenAI:n TTS-mallia. gpt-4o-mini-tts tukee instructions-
    // parametria, jolla ohjataan äänensävyä (ei pelkkää äänivalintaa).
    const response = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'onyx',              // syvä, tumma ääni sopii persoonaan
      input: trimmedText,
      instructions: VOICE_INSTRUCTIONS,
      response_format: 'mp3',
    });

    // Vastaus on binääridataa (Fetch Response -tyyppinen). Muunnetaan
    // puskuriksi ja siitä base64-data-URL:ksi (sama tapa kuin kuvilla).
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioDataUrl = `data:audio/mpeg;base64,${buffer.toString('base64')}`;

    res.json({ audio: audioDataUrl });
  } catch (error) {
    console.error('Puheeksi muunto epäonnistui:', error.message);
    res.status(502).json({ error: 'Watcherin ääni ei kuulu. Yritä uudelleen.' });
  }
});

export default router;