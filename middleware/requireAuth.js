import jwt from 'jsonwebtoken';

// Middleware joka tarkistaa onko käyttäjä kirjautunut.
// Ajetaan ennen suojattuja reittejä.
export default function requireAuth(req, res, next) {
  try {
    // Luetaan token evästeestä (cookie-parser asetti sen req.cookiesiin)
    const token = req.cookies.token;

    // Jos tokenia ei ole, käyttäjä ei ole kirjautunut
    if (!token) {
      return res.status(401).json({ error: 'Kirjautuminen vaaditaan.' });
    }

    // Tarkistetaan ja puretaan token JWT_SECRETillä
    // Jos token on väärennetty tai vanhentunut, tämä heittää virheen
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Tallennetaan käyttäjän id pyyntöön, jotta reitit pääsevät siihen käsiksi
    req.userId = payload.userId;

    // Päästetään pyyntö eteenpäin varsinaiseen reittiin
    next();
  } catch (error) {
    // Token oli virheellinen tai vanhentunut
    return res.status(401).json({ error: 'Istunto on vanhentunut tai virheellinen.' });
  }
}