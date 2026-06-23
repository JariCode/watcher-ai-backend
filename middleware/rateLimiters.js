// Pyyntörajoittimet (rate limit). Suojaavat kahdelta asialta:
// 1) brute force kirjautumisessa (salasanan arvaaminen)
// 2) API:n liikakäyttö ja kustannusten karkaaminen (OpenAI-kutsut)
import rateLimit from 'express-rate-limit';

// --- Kirjautumis- ja rekisteröintisuoja (brute force) ---
// Tiukka raja: harva ihminen kirjautuu kymmeniä kertoja 15 minuutissa.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,            // 15 minuuttia
  max: 10,                             // enintään 10 yritystä / IP / ikkuna
  message: { error: 'Liikaa kirjautumisyrityksiä. Yritä myöhemmin uudelleen.' },
  standardHeaders: true,               // lisää RateLimit-* otsakkeet
  legacyHeaders: false,                // ei vanhoja X-RateLimit-* otsakkeita
});

// --- Yleinen API-suoja (liikakäyttö) ---
// Kevyt katto kaikelle /api-liikenteelle. Estää spämmin mutta ei haittaa
// normaalia käyttöä.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,                 // 1 minuutti
  max: 100,                            // enintään 100 pyyntöä / IP / minuutti
  message: { error: 'Liikaa pyyntöjä. Hidasta hetkeksi.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Viestien lähetyssuoja (OpenAI-kustannukset) ---
// Jokainen viesti on OpenAI-kutsu, joten tämä on tiukempi kuin yleinen raja.
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,                 // 1 minuutti
  max: 20,                             // enintään 20 viestiä / IP / minuutti
  message: { error: 'Lähetät viestejä liian nopeasti. Hetki.' },
  standardHeaders: true,
  legacyHeaders: false,
});