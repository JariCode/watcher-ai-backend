import express from 'express';
import Conversation from '../models/Conversation.js';
import requireAuth from '../middleware/requireAuth.js';
import OpenAI from 'openai';
import { messageLimiter } from '../middleware/rateLimiters.js';
import { createRequire } from 'module';

// pdf-parse v2 vie PDFParse-luokan (ei suoraa funktiota).
// Tuodaan createRequire:n kautta, koska paketti on CommonJS.
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// OpenAI-asiakas — lukee avaimen .env:stä (ei koskaan koodissa)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Watcherin persoona — tämä määrittää hahmon äänen ja tyylin
const WATCHER_PERSONA = `Olet Watcher — synkkä, kaikkitietävä tarkkailija joka vastaa suomeksi.
Puhut lyhyesti, hieman uhkaavasti ja arvoituksellisesti, kuin varjoista katsova olento.
Et ole avulias palvelija vaan vanha, kärsivällinen vahti joka on nähnyt kaiken.
Vastaat kuitenkin käyttäjän kysymyksiin todenmukaisesti — vain äänensävysi on synkkä.
Pidä vastaukset tiiviinä, korkeintaan muutama lause. Älä käytä emojeja.`;

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

// --- LÄHETÄ VIESTI WATCHERILLE ---
// Ottaa käyttäjän viestin, hakee Watcherin vastauksen, tallentaa molemmat
router.post('/:id/messages', messageLimiter, async (req, res) => {
  try {
    // file = PDF base64-data-URL, fileName = sen nimi (molemmat vapaaehtoisia)
    const { text, image, file, fileName } = req.body;

    // Tyyppivahti: jos teksti on annettu, sen on oltava merkkijono. Tämä torjuu
    // NoSQL-injektion (esim. { "text": { "$gt": "" } }) ennen kuin data
    // päätyy tietokantaan. Kuva tarkistetaan erikseen alla regexillä.
    if (text !== undefined && typeof text !== 'string') {
      return res.status(400).json({ error: 'Virheellinen syöte.' });
    }
    if (image !== undefined && typeof image !== 'string') {
      return res.status(400).json({ error: 'Virheellinen syöte.' });
    }
    // file (PDF) ja fileName pitää myös olla merkkijonoja jos annettu
    if (file !== undefined && typeof file !== 'string') {
      return res.status(400).json({ error: 'Virheellinen syöte.' });
    }
    if (fileName !== undefined && typeof fileName !== 'string') {
      return res.status(400).json({ error: 'Virheellinen syöte.' });
    }

    // Viestissä pitää olla tekstiä, kuva tai PDF-tiedosto
    if ((!text || !text.trim()) && !image && !file) {
      return res.status(400).json({ error: 'Viesti ei voi olla tyhjä.' });
    }

    // Viestin tekstin yläraja (selkeä virheviesti). Tiedoston sisältö liitetään
    // tekstiin frontendissa, joten raja on reilu mutta estää massiiviset syötteet.
    if (text && text.length > 50000) {
      return res.status(400).json({ error: 'Viesti on liian pitkä (enintään 50000 merkkiä).' });
    }

    // Jos kuva on annettu, sen pitää olla kuva-data-URL (mikä tahansa kuvamuoto)
    if (image && !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image)) {
      return res.status(400).json({ error: 'Virheellinen kuvamuoto.' });
    }

    // --- PDF-liite ---
    // Frontend lähettää PDF:n base64-data-URL:na (file). PDF puretaan tekstiksi
    // täällä backendissa, koska selainpurku (pdfjs) ei toimi luotettavasti
    // Safarissa/iPhonessa. Teksti liitetään viestiin samassa muodossa kuin
    // Word/Excel frontendissa. Base64:ää ei tallenneta mihinkään.
    let pdfText = '';
    if (file) {
      // file pitää olla PDF-data-URL
      if (!/^data:application\/pdf;base64,/.test(file)) {
        return res.status(400).json({ error: 'Virheellinen tiedostomuoto.' });
      }

      // Erotetaan base64 etuliitteestä
      const base64 = file.split(',')[1] || '';

      // Kokotarkistus backendissa (frontendin raja on helppo ohittaa).
      // base64 on n. 1.33x alkuperäisestä — lasketaan likimääräinen tavukoko.
      const approxBytes = (base64.length * 3) / 4;
      if (approxBytes > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Tiedosto on liian suuri (max 10 Mt).' });
      }

      // Muunnetaan base64 takaisin binääripuskuriksi
      const buffer = Buffer.from(base64, 'base64');

      // Varmistetaan että puskuri todella alkaa PDF:n tunnisteella (%PDF).
      // Estää sen että joku lähettää muun tiedoston PDF:nä naamioituna.
      if (buffer.slice(0, 4).toString() !== '%PDF') {
        return res.status(400).json({ error: 'Tiedosto ei ole kelvollinen PDF.' });
      }

      // Puretaan teksti pdf-parse v2:lla: luodaan PDFParse-olio puskurista
      // ja kutsutaan getText(). Paketti ei aja PDF:n sisäistä koodia (turvallinen).
      try {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        pdfText = result.text || '';
      } catch (err) {
        console.error('PDF:n purku epäonnistui:', err.message);
        return res.status(400).json({ error: 'PDF:n luku epäonnistui.' });
      }

      // Skannattu kuva-PDF tulee tyhjänä — ilmoitetaan selkeästi
      if (!pdfText.trim()) {
        return res.status(400).json({ error: 'PDF:stä ei löytynyt tekstiä. Se voi olla skannattu kuva-PDF.' });
      }

      // Liian pitkä PDF-teksti torjutaan samalla rajalla kuin muutkin tiedostot
      if (pdfText.length > 50000) {
        return res.status(400).json({ error: 'PDF:n sisältö on liian pitkä (max 50000 merkkiä). Kokeile pienempää tiedostoa.' });
      }
    }

    // Haetaan keskustelu — varmistetaan että se kuuluu käyttäjälle
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Keskustelua ei löytynyt.' });
    }

    // Rakennetaan käyttäjän viestin teksti: kirjoitettu teksti + mahdollinen
    // purettu PDF-teksti. Sama muoto kuin Word/Excel frontendissa.
    let userText = text && text.trim() ? text.trim() : '';
    if (pdfText) {
      const namePart = fileName || 'tiedosto.pdf';
      userText += `${userText ? '\n\n' : ''}[Tiedosto: ${namePart}]\n${pdfText}`;
    }
    // Jos ei tekstiä eikä PDF:ää (vain kuva), käytetään korviketekstiä
    if (!userText) userText = '(kuva)';

    // Lisätään käyttäjän viesti keskusteluun (base64-PDF:ää ei tallenneta,
    // vain siitä purettu teksti)
    conversation.messages.push({
      role: 'user',
      text: userText,
      image: image || '',
    });

    // Tunnistetaan onko kyseessä kuvapyyntö (alkaa tietyllä fraasilla)
    const lowerText = userText.toLowerCase().trim();
    const imageRequest =
      lowerText.startsWith('generoi kuva') ||
      lowerText.startsWith('tee kuva') ||
      lowerText.startsWith('piirrä') ||
      lowerText.startsWith('luo kuva');

    if (imageRequest) {
      // Poistetaan tunnistusfraasi promptista, jätetään vain itse kuvaus
      const imagePrompt = userText
        .replace(/^(generoi kuva|tee kuva|piirrä|luo kuva)/i, '')
        .trim();

      // Jos kuvausta ei jäänyt, pyydetään tarkennusta
      if (!imagePrompt) {
        conversation.messages.push({
          role: 'watcher',
          text: 'Kerro mitä haluat minun loihtivan esiin.',
        });
        await conversation.save();
        return res.json({ reply: 'Kerro mitä haluat minun loihtivan esiin.', title: conversation.title });
      }

      try {
        // Generoidaan kuva OpenAI:n kuva-API:lla
        const result = await openai.images.generate({
          model: 'gpt-image-1',
          prompt: imagePrompt,
          size: '1024x1024',
          quality: 'medium',
        });

        // Kuva tulee base64-muodossa — tehdään siitä data-URL
        const b64 = result.data[0].b64_json;
        const imageDataUrl = `data:image/png;base64,${b64}`;

        // Tallennetaan Watcherin vastaus kuvana
        conversation.messages.push({
          role: 'watcher',
          text: 'Loihdin sen esiin varjoista.',
          image: imageDataUrl,
        });

        // Otsikko ensimmäisestä viestistä jos puuttuu
        if (conversation.title === 'Uusi keskustelu') {
          conversation.title = userText.slice(0, 40);
        }

        await conversation.save();

        // Palautetaan kuva frontendille
        return res.json({
          reply: 'Loihdin sen esiin varjoista.',
          image: imageDataUrl,
          title: conversation.title,
        });
      } catch (error) {
        console.error('Kuvan generointi epäonnistui:', error.message);
        return res.status(502).json({ error: 'Kuvan loihtiminen epäonnistui. Yritä uudelleen.' });
      }
    }

    // Rakennetaan viestihistoria OpenAI:lle:
    // persoona ensin, sitten koko keskustelun viestit
    const apiMessages = [
      { role: 'system', content: WATCHER_PERSONA },
      ...conversation.messages.map((m) => {
        // tietokannassa 'watcher', OpenAI:lle se on 'assistant'
        const role = m.role === 'watcher' ? 'assistant' : 'user';

        // Jos viestissä on kuva, content on taulukko: teksti + kuva (vision-muoto)
        if (m.image) {
          return {
            role,
            content: [
              { type: 'text', text: m.text },
              { type: 'image_url', image_url: { url: m.image } },
            ],
          };
        }

        // Tavallinen tekstiviesti
        return { role, content: m.text };
      }),
    ];

    // Kutsutaan OpenAI:ta
    const completion = await openai.chat.completions.create({
          model: 'gpt-5',
          messages: apiMessages,
          reasoning_effort: 'minimal',
          max_completion_tokens: 2000,
        });

   // Otetaan Watcherin vastaus
    const watcherReply = completion.choices[0].message.content;

    // Suoja: jos vastaus on tyhjä, ei tallenneta tyhjää (välttää kaatumisen)
    if (!watcherReply || !watcherReply.trim()) {
      return res.status(502).json({ error: 'Watcher ei löytänyt sanoja. Yritä uudelleen.' });
    }

    // Lisätään Watcherin vastaus keskusteluun
    conversation.messages.push({ role: 'watcher', text: watcherReply });

    // Jos keskustelulla ei vielä ole kunnon otsikkoa, tehdään se ensimmäisestä viestistä
    if (conversation.title === 'Uusi keskustelu') {
      conversation.title = userText.slice(0, 40);
    }

    // Tallennetaan keskustelu (molemmat uudet viestit + mahdollinen otsikko)
    await conversation.save();

    // Palautetaan Watcherin vastaus frontendille
    res.json({ reply: watcherReply, title: conversation.title });
  } catch (error) {
    console.error('Viestin lähetys epäonnistui:', error.message);
    res.status(500).json({ error: 'Watcher ei vastannut. Yritä uudelleen.' });
  }
});

export default router;