import User from '../models/User.js';

// Middleware joka varmistaa että kirjautunut käyttäjä on admin.
// HUOM: tämä ajetaan AINA requireAuth:n JÄLKEEN (joka asettaa req.userId).
export default async function requireAdmin(req, res, next) {
  try {
    // Haetaan käyttäjä ja katsotaan rooli
    const user = await User.findById(req.userId).select('role');

    if (!user || user.role !== 'admin') {
      // Ei admin → ei pääsyä, ei paljasteta tarkkaa syytä
      return res.status(403).json({ error: 'Ei käyttöoikeutta.' });
    }

    // Admin → päästetään eteenpäin
    next();
  } catch (error) {
    console.error('Admin-tarkistus epäonnistui:', error.message);
    return res.status(500).json({ error: 'Tarkistus epäonnistui.' });
  }
}