# Aggiornamenti via prompt

Questa repository è la fonte unica del sito Atlante di viaggio.

## File dati

- `data/giappone.json`
- `data/filippine.json`
- `data/rajasthan-maldive.json`

## Flusso richiesto all'assistente

Quando l'utente chiede di aggiornare un viaggio:

1. eseguire `git pull --ff-only origin main` prima di leggere o modificare i file, così le modifiche pubblicate dal pannello admin del sito vengono incorporate nella cartella locale;
2. verificare che non esistano modifiche locali in conflitto e leggere il JSON corrente dalla branch `main`;
3. modificare esclusivamente i campi richiesti, preservando le informazioni non coinvolte;
4. validare la sintassi JSON e lo schema minimo (`main`, `itinerary`, `flights`, `tours`, `budget`, `usefulLinks`, `route`);
5. segnalare chiaramente eventuali orari, prezzi o prenotazioni non verificabili;
6. creare un commit descrittivo sulla branch `main` solo quando l'utente chiede anche di pubblicare;
7. verificare l'esito del workflow GitHub Pages.

## Convenzione budget

Per una spesa già prenotata ma non ancora pagata, registrare comunque l'importo noto, impostare `status: "booked"`, indicare il responsabile e mantenere `onSplid: false` finché non è stata aggiunta a Splid. Nel sito questa condizione deve comparire come **Prenotata**, non come “Da fare”, e l'importo deve contribuire al totale impegnato senza essere conteggiato come pagato. Per gli alloggi aggiungere anche `stayStart` e `stayEnd` (checkout escluso): alimentano automaticamente il riepilogo delle sistemazioni e l'icona casa nel calendario.

## Esempi di prompt

- `Nel progetto Atlante di viaggio modifica il giorno 8 delle Filippine aggiungendo ... e pubblica.`
- `Aggiorna l'orario del volo di ritorno del Giappone, ma non pubblicare ancora.`
- `Aggiungi un nuovo viaggio in data/portogallo.json e collegalo al selettore del sito.`

Se l'utente chiede soltanto una modifica senza dire “pubblica”, preparare la modifica e chiedere conferma prima del commit esterno.
