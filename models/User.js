import mongoose from 'mongoose';

// Käyttäjän rakenne tietokannassa
const userSchema = new mongoose.Schema({
  // Käyttäjätunnus — pakollinen ja uniikki (ei kahta samaa)
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,        // poistaa välilyönnit alusta ja lopusta
    minlength: 3,
    maxlength: 30,     // yläraja estää kohtuuttoman pitkät tunnukset
  },

  // Salasana — tallennetaan AINA bcrypt-hashattuna, ei koskaan selkokielisenä.
  // HUOM: pituusrajaa ei aseteta tähän, koska tähän tallennetaan jo hashattu
  // salasana (aina 60 merkkiä). Selkokielisen salasanan pituus tarkistetaan
  // reitissä (auth.js) ennen hashausta.
  password: {
    type: String,
    required: true,
  },
   role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
}, {
  // Lisää automaattisesti createdAt- ja updatedAt-kentät
  timestamps: true,
});

// Luodaan malli ja viedään se käyttöön muualla
const User = mongoose.model('User', userSchema);

export default User;