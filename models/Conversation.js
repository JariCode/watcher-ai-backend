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
  },

  // Mahdollinen kuva base64-muodossa (data-URL). Tyhjä jos ei kuvaa.
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

  // Keskustelun otsikko (esim. ensimmäisestä viestistä lyhennetty)
  title: {
    type: String,
    default: 'Uusi keskustelu',
  },

  // Lista viestejä — käyttää yllä määriteltyä messageSchemaa
  messages: [messageSchema],
}, {
  // createdAt ja updatedAt keskustelulle
  timestamps: true,
});

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;