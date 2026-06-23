import mongoose from 'mongoose';

// Yksittäisen viestin rakenne keskustelun sisällä
const messageSchema = new mongoose.Schema({
  // Kuka viestin lähetti: käyttäjä vai Watcher
  role: {
    type: String,
    enum: ['user', 'watcher'],   // sallitaan vain nämä kaksi arvoa
    required: true,
  },

  // Viestin teksti
  text: {
    type: String,
    required: true,
    maxlength: 10000,   // yläraja estää kohtuuttoman pitkät viestit
                        // (tiedoston sisältö liitetään tekstiin, joten raja on reilu)
  },

  // Mahdollinen kuva base64-muodossa (data-URL). Tyhjä jos ei kuvaa.
  // EI pituusrajaa: base64-kuva on satojatuhansia merkkejä. Koko on jo
  // rajattu muualla (express.json 10mb -raja + kuvan data-URL -validointi).
  image: {
    type: String,
    default: '',
  },
}, {
  // Jokainen viesti saa createdAt-aikaleiman
  timestamps: true,
});

// Keskustelun rakenne
const conversationSchema = new mongoose.Schema({
  // Kenelle keskustelu kuuluu — viittaus käyttäjään
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Keskustelun otsikko (esim. ensimmäisestä viestistä lyhennetty).
  // Otsikko tehdään viestin alusta (slice 0,40), joten raja on varmuuden vuoksi.
  title: {
    type: String,
    default: 'Uusi keskustelu',
    maxlength: 100,
  },

  // Lista viestejä — käyttää yllä määriteltyä messageSchemaa
  messages: [messageSchema],
}, {
  // createdAt ja updatedAt keskustelulle
  timestamps: true,
});

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;