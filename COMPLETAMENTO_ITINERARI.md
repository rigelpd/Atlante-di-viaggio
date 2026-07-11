# Flusso guidato di completamento

Quando viene richiesto di completare un itinerario, leggere il relativo file in `data/` e usare il Centro di completamento dell’app come fonte delle aree mancanti.

## Modalità di lavoro

1. Presentare la percentuale attuale e i punti mancanti.
2. Affrontare un gruppo omogeneo alla volta, con poche domande specifiche.
3. Quando utile, offrire 2–3 alternative concrete oltre alla risposta libera.
4. Non inventare prenotazioni, importi, documenti, contatti o orari.
5. Inserire direttamente le risposte nel JSON dell’itinerario.
6. Validare JSON e JavaScript, controllare l’anteprima, creare un commit e pubblicare su `main` soltanto dopo conferma dell’utente.

## Aree controllate

- copertina e presentazione;
- date, località, attività, alloggi e immagini delle giornate;
- coordinate e ordine della rotta;
- voli e relativi orari;
- esperienze e prenotazioni;
- budget e spese;
- link, documenti e checklist;
- informazioni pratiche e contatti di emergenza.

I campi strutturati non ancora disponibili vivono in `planning.documents`, `planning.emergency` e `planning.notes`. Gli array vuoti rappresentano intenzionalmente contenuti da completare, non errori.
