# Watcher AI, taustapalvelu

Tämä on Watcher AI -sovelluksen taustapalvelu eli backend. Se hoitaa käyttäjien tunnistautumisen, keskustelujen tallennuksen, puheentunnistuksen, tekstin muuttamisen puheeksi sekä ylläpidon toiminnot. Käyttöliittymä eli frontend on omassa repossaan.

## Mikä Watcher AI on

Watcher AI on tekoälyavustaja, jonka kanssa käyttäjä voi keskustella tekstillä tai puheella. Keskustelut tallennetaan käyttäjäkohtaisesti ja niitä voidaan hakea myöhemmin. Sovellus tukee myös puheen muuttamista tekstiksi OpenAI Whisperilla sekä tekstin muuttamista puheeksi OpenAI:n TTS-mallilla.

## Tekniikka

Palvelu on toteutettu seuraavilla tekniikoilla:

- **Node.js ja Express** toteuttavat palvelimen ja API-reitit
- **MongoDB Atlas ja Mongoose** tallentavat käyttäjät ja keskustelut
- **JSON Web Token (JWT)** hoitaa kirjautumisen
- **bcrypt** suojaa salasanat
- **Helmet** lisää turvalliset HTTP-otsakkeet
- **express-rate-limit** rajoittaa pyyntöjen määrää
- **OpenAI Whisper** tunnistaa puheen tekstiksi
- **OpenAI Text-to-Speech (TTS)** muuntaa vastaukset puheeksi

## Kansiot ja tiedostot

- `server.js` käynnistää palvelimen ja yhdistää kaikki osat

### routes/

- `auth.js` rekisteröinti, kirjautuminen, uloskirjautuminen ja käyttäjän tunnistaminen
- `conversations.js` keskustelujen tallennus, haku ja poisto
- `transcribe.js` puheen tunnistus Whisperilla
- `speech.js` tekstin muuttaminen puheeksi
- `admin.js` ylläpitotoiminnot

### models/

- `User.js` käyttäjät
- `Conversation.js` tallennetut keskustelut

### middleware/

- `requireAuth.js` suojaa kirjautumista vaativat reitit
- `requireAdmin.js` suojaa ylläpitoreitit
- `rateLimiters.js` sisältää API:n ja kirjautumisen pyyntörajoitukset

## Asennus

1. Asenna riippuvuudet

```
npm install
```

2. Luo projektin juureen `.env`-tiedosto.

3. Lisää tarvittavat ympäristömuuttujat.

4. Käynnistä kehitysympäristö

```
npm run dev
```

tai tuotantotilassa

```
npm start
```

## Ympäristömuuttujat

Palvelu käyttää `.env`-tiedostoa.

- `PORT` palvelimen portti
- `MONGO_URI` MongoDB Atlas -tietokannan yhteysosoite
- `JWT_SECRET` satunnainen pitkä merkkijono JWT-tokenien allekirjoittamiseen
- `JWT_EXPIRES_IN` tokenin voimassaoloaika, esimerkiksi `7d`
- `ALLOWED_ORIGINS` pilkuilla erotettu lista sallituista frontend-osoitteista
- `OPENAI_API_KEY` OpenAI API -avain
- `NODE_ENV` käyttöympäristö (`development` tai `production`)

Voit luoda vahvan JWT_SECRET-arvon esimerkiksi komennolla

```
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Reitit

Kaikki reitit alkavat osoitteella `/api`.

### Tunnistautuminen (`/api/auth`)

- `POST /register` luo uuden käyttäjän
- `POST /login` kirjautuu sisään
- `POST /logout` kirjautuu ulos
- `GET /me` palauttaa kirjautuneen käyttäjän tiedot

### Keskustelut (`/api/conversations`)

- keskustelujen tallennus
- keskustelujen haku
- keskustelujen poistaminen

### Puheentunnistus (`/api/transcribe`)

- vastaanottaa äänitiedoston
- palauttaa tunnistetun tekstin OpenAI Whisperilla

### Puheeksi muunnos (`/api/speech`)

- vastaanottaa tekstin
- palauttaa puheäänen OpenAI:n TTS-mallilla

### Ylläpito (`/api/admin`)

- käyttäjien hallinta
- keskustelujen hallinta
- ylläpitotoiminnot

## Tietoturva

Palvelussa on huomioitu useita tietoturvaominaisuuksia:

- salasanat tallennetaan vain bcrypt-tiivisteinä
- kirjautuminen käyttää turvallista JWT-tunnistautumista
- JWT tallennetaan HttpOnly-evästeeseen
- CORS sallii vain määritellyt frontend-osoitteet
- Helmet lisää turvalliset HTTP-otsakkeet
- kirjautumisyrityksiä rajoitetaan brute force -hyökkäysten estämiseksi
- koko API:n pyyntömäärää rajoitetaan palvelun väärinkäytön estämiseksi
- vain kirjautunut käyttäjä pääsee omiin keskusteluihinsa
- ylläpitoreitit ovat käytettävissä vain ylläpitäjille

## Ensimmäinen ylläpitäjä

Ensimmäinen ylläpitäjä luodaan muuttamalla käyttäjän `role`-kentän arvoksi `admin` MongoDB Atlas -tietokannassa. Tämän jälkeen käyttäjä voi käyttää ylläpitotoimintoja.