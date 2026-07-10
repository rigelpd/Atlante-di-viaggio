# Aggiornamenti via prompt

Questa repository è la fonte unica del sito Atlante di viaggio.

## File dati

- `data/giappone.json`
- `data/filippine.json`
- `data/rajasthan-maldive.json`

## Flusso richiesto all'assistente

Quando l'utente chiede di aggiornare un viaggio:

1. leggere il JSON corrente dalla branch `main`;
2. modificare esclusivamente i campi richiesti, preservando le informazioni non coinvolte;
3. validare la sintassi JSON e lo schema minimo (`main`, `itinerary`, `flights`, `tours`, `budget`, `usefulLinks`, `route`);
4. segnalare chiaramente eventuali orari, prezzi o prenotazioni non verificabili;
5. creare un commit descrittivo sulla branch `main` solo quando l'utente chiede anche di pubblicare;
6. verificare l'esito del workflow GitHub Pages.

## Esempi di prompt

- `Nel progetto Atlante di viaggio modifica il giorno 8 delle Filippine aggiungendo ... e pubblica.`
- `Aggiorna l'orario del volo di ritorno del Giappone, ma non pubblicare ancora.`
- `Aggiungi un nuovo viaggio in data/portogallo.json e collegalo al selettore del sito.`

Se l'utente chiede soltanto una modifica senza dire “pubblica”, preparare la modifica e chiedere conferma prima del commit esterno.
