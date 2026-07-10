# Pubblicazione diretta su GitHub

Il pulsante **Pubblica** aggiorna il JSON del viaggio nella repository unica `rigelpd/Atlante-di-viaggio`. Non è più necessario scaricare e caricare manualmente il file.

## Configurazione iniziale

1. Su GitHub apri **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Crea un token con una scadenza breve o ragionevole.
3. Limita l'accesso alla sola repository `rigelpd/Atlante-di-viaggio`.
4. Assegna esclusivamente **Repository permissions → Contents: Read and write**.
5. Copia il token: GitHub lo mostra una sola volta.

Il token viene richiesto al momento della pubblicazione, resta esclusivamente nella memoria della scheda e scompare chiudendo o ricaricando la pagina. Non viene scritto in `localStorage`, nei JSON o nei sorgenti.

## Uso quotidiano

1. Accedi come amministratore.
2. Modifica e salva l'itinerario.
3. Premi **Pubblica**.
4. Incolla il token se è la prima pubblicazione della sessione.
5. Controlla repository, branch e percorso e premi **Pubblica ora**.

Prima dell'aggiornamento viene letta la versione corrente da GitHub. Se è cambiata dopo il caricamento locale, il sito chiede conferma prima di sovrascriverla. Dopo il commit, lo stato passa a **Pubblicato** e viene mostrato il collegamento al commit.

## Destinazioni configurate

- Giappone: `data/giappone.json`
- Filippine: `data/filippine.json`
- Rajasthan–Maldive: `data/rajasthan-maldive.json`

Tutte le destinazioni usano la branch `main` della repository `rigelpd/Atlante-di-viaggio`. GitHub Pages pubblica un solo sito all'indirizzo `https://rigelpd.github.io/Atlante-di-viaggio/`.

Le destinazioni non sono segrete e si trovano in `publish-config.json`. I campi restano visibili nella finestra Pubblica per permettere un controllo prima del commit; eventuali modifiche permanenti vanno fatte nel file di configurazione.

## Aggiornamenti tramite prompt

Con la repository collegata al plugin GitHub puoi chiedere, per esempio:

> Nel progetto Atlante di viaggio, aggiungi una visita al mercato di Nishiki al giorno 12 del Giappone e pubblica.

L'assistente può leggere il JSON corrente dalla repository, modificarlo, validarlo e creare direttamente il commit. La pubblicazione GitHub Pages parte automaticamente dopo il commit.
