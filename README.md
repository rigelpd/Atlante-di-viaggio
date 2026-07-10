# Atlante di viaggio

Un solo sito per consultare e aggiornare tutti gli itinerari: Giappone, Hong Kong e Filippine, Rajasthan e Maldive.

Apri `avvia-sito.bat` per avviare il sito su `http://localhost:8787`.

## Password

- Accesso visitatore: `Atlante2026`
- Modalità amministratore: `Kerrickleo`

## Dati

I tre file in `data/` sono indipendenti. Le modifiche fatte nell'editor vengono salvate nel browser; usa **JSON** per scaricare la versione aggiornata.

Per aggiornare direttamente le repository pubbliche usa il pulsante **Pubblica**. La configurazione e la creazione del token GitHub sono descritte in [PUBBLICAZIONE.md](PUBBLICAZIONE.md).

Le date e gli orari dei voli del viaggio Rajasthan–Maldive non presenti nella traccia originale sono lasciati volutamente da confermare, senza inventare operativi.

## Sito pubblico

Repository: `rigelpd/Atlante-di-viaggio`

Indirizzo previsto: `https://rigelpd.github.io/Atlante-di-viaggio/`

Ogni push sulla branch `main` avvia il workflow GitHub Pages in `.github/workflows/pages.yml`.
