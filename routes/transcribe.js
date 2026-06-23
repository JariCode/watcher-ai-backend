import express from 'express';
import OpenAI from 'openai';
import { toFile } from 'openai';
import requireAuth from '../middleware/requireAuth.js';
import { messageLimiter } from '../middleware/rateLimiters.js';

// OpenAI-asiakas — lukee avaimen .env:stä (sama avain kuin chatissa)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const router = express.Router();

// Reitti vaatii kirjautumisen — sama suoja kuin chatissa
router.use(requireAuth);

// --- PUHEEN MUUNTO TEKSTIKSI (Whisper) ---
// Ottaa vastaan äänileikkeen base64-muodossa, lähettää sen OpenAI Whisperille
// ja palauttaa tunnistetun tekstin. messageLimiter rajoittaa kutsutahtia
// (suojaa OpenAI-kustannuksia, sama kuin viestien lähetyksessä).
router.post('/', messageLimiter, async (req, res) => {
  try {
    const { audio } = req.body;

    // Tyyppivahti: äänen on oltava merkkijono (base64 data-URL).
    // Torjuu virheelliset syötteet ja injektioyritykset ennen käsittelyä.
    if (typeof audio !== 'string' || !audio) {
      return res.status(400).json({ error: 'Äänidataa ei annettu.' });
    }

    // Hyväksytään data-URL jonka MIME-tyyppi on joko audio/* TAI
    // application/octet-stream. Firefox ei aina merkitse MediaRecorderin
    // tuotosta audio-tyypillä vaan käyttää yleistä octet-streamia, vaikka
    // sisältö on oikeasti ääntä. Sallitaan myös koodekkiparametrit (;codecs=...).
    const match = audio.match(/^data:(audio\/[a-zA-Z0-9.+-]+|application\/octet-stream)(;[^;,]+)*;base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Virheellinen äänimuoto.' });
    }

    // match[1] = MIME-tyyppi, match[3] = base64-data
    const mimeType = match[1];
    const base64Data = match[3];

    // Muunnetaan base64 binääripuskuriksi
    const buffer = Buffer.from(base64Data, 'base64');

    // Kokoraja: enintään 10 Mt (vastaa useita minuutteja puhetta).
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Äänileike on liian pitkä.' });
    }

    // Päätetään tiedostopääte. Jos MIME-tyyppi on epämääräinen octet-stream,
    // katsotaan tiedoston ensimmäiset tavut (taikatavut): Ogg-tiedosto alkaa
    // merkeillä "OggS", webm/matroska tavuilla 0x1A45DFA3.
    let ext;
    if (mimeType.includes('webm')) {
      ext = 'webm';
    } else if (mimeType.includes('ogg')) {
      ext = 'ogg';
    } else if (mimeType.includes('mp4')) {
      ext = 'mp4';
    } else {
      // octet-stream tai tuntematon: päätellään sisällöstä
      const header = buffer.subarray(0, 4);
      if (header.toString('ascii') === 'OggS') {
        ext = 'ogg';
      } else if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
        ext = 'webm';
      } else {
        ext = 'webm';   // varmin oletus jos ei tunnistettu
      }
    }

    // toFile tarvitsee oikean tyypin. Annetaan ext-pohjainen audio-tyyppi,
    // jotta Whisper tunnistaa muodon (ei octet-stream).
    const fileType = `audio/${ext}`;

    // Tehdään puskurista tiedosto-olio jonka OpenAI-kirjasto ymmärtää
    const file = await toFile(buffer, `aani.${ext}`, { type: fileType });

    // Lähetetään Whisperille tunnistettavaksi (suomi)
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'fi',
      prompt: 'Tämä on suomenkielinen puheviesti.',
      temperature: 0,
    });

    // Palautetaan tunnistettu teksti frontendille
    res.json({ text: transcription.text });
  } catch (error) {
    console.error('Puheentunnistus epäonnistui:', error.message);
    res.status(502).json({ error: 'Puheentunnistus epäonnistui. Yritä uudelleen.' });
  }
});

export default router;