const FOGLI = {
  giocatori: "GIOCATORI",
  import: "IMPORT_PARTITA",
  distinte: "DISTINTE",
  veo: "VEO_RAW",
  stats: "PLAYER_STATS",
  medie: "MEDIE_GIOCATORI"
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚽ VILLANOVESE")
    .addItem("🔄 Sincronizza partite Veo", "sincronizzaPartiteVeo")
    .addItem("📥 Importa statistiche Veo", "importaTuttePartiteVeo")
    .addItem("👤 Crea PLAYER_STATS", "creaPlayerStatsDaVeo")
    .addItem("👤 Crea le medie dei giocatori", "creaMedieGiocatori")
    .addSeparator()
    .addItem("📊 Analisi giocatori", "creaAnalisiGiocatori")
    .addItem("📋 Analisi partite", "creaAnalisiPartite")
    .addSeparator()
    .addItem("🔍 Verifica import Veo", "verificaImportVeo")
    .addItem("🔍 Verifica coerenza database", "verificaCoerenzaDatabase")
    .addSeparator()
    .addItem("🗑️ Rimuovi partita", "rimuoviPartita")
    .addSeparator()
    .addItem("📄 Importa report YouCoach", "importaReportYouCoach")
    .addSeparator()
    .addItem("🚀 Aggiorna solo nuovi dati", "aggiornaSoloNuoviDati")
    .addItem("🔄 Sincronizza Supabase", "sincronizzaSupabaseIncrementale")
    .addToUi();
}

const VEO_API = 'https://app.veo.co/api/app/analysis/stats/';
const VEO_TEAM_ID = '8952fdd4-1ecb-4cf8-ad86-37ca7d90c1c4';

function getVeoAccessToken_() {
  const token = String(
    PropertiesService
      .getScriptProperties()
      .getProperty('VEO_ACCESS_TOKEN') || ''
  )
    .trim()
    .replace(/^Bearer\s+/i, '');

  if (!token) {
    throw new Error(
      'VEO_ACCESS_TOKEN non configurato nelle Proprietà script.'
    );
  }

  return token;
}


function sincronizzaPartiteVeo() {

  const token = getVeoAccessToken_();


  const ss =
    SpreadsheetApp.getActive();

  const sheetDistinte =
    ss.getSheetByName('DISTINTE');


  if (!sheetDistinte) {
    throw new Error(
      'Foglio DISTINTE non trovato'
    );
  }


  // ==========================================
  // VEO_MATCHES
  // ==========================================

  let veoSheet =
    ss.getSheetByName('VEO_MATCHES');


  const headersOutput = [

    'Match_ID',
    'Data',
    'Partita',
    'Veo_Match_ID',
    'Veo_Start',
    'Veo_Title',
    'Veo_Avversario',
    'Casa_Trasferta',
    'Stato'

  ];


  if (!veoSheet) {

    veoSheet =
      ss.insertSheet(
        'VEO_MATCHES'
      );

    veoSheet
      .getRange(
        1,
        1,
        1,
        headersOutput.length
      )
      .setValues([
        headersOutput
      ]);

  }


  // ==========================================
  // MATCH_ID GIÀ PRESENTI
  // ==========================================

  const matchEsistenti =
    new Set();


  if (veoSheet.getLastRow() > 1) {

    const existingData =
      veoSheet
        .getDataRange()
        .getValues();

    const existingHeaders =
      existingData.shift();

    const iExistingMatch =
      existingHeaders.indexOf(
        'Match_ID'
      );


    if (iExistingMatch === -1) {

      throw new Error(
        'VEO_MATCHES non contiene Match_ID'
      );

    }


    existingData.forEach(row => {

      const matchId =
        String(
          row[iExistingMatch] || ''
        ).trim();

      if (matchId) {
        matchEsistenti.add(
          matchId
        );
      }

    });

  }


  Logger.log(
    'Match già presenti in VEO_MATCHES: ' +
    matchEsistenti.size
  );


  // ==========================================
  // LETTURA DISTINTE
  // ==========================================

  const data =
    sheetDistinte
      .getDataRange()
      .getValues();

  const headers =
    data.shift();


  const iMatch =
    headers.indexOf(
      'Match_ID'
    );

  const iData =
    headers.indexOf(
      'Data'
    );

  const iPartita =
    headers.indexOf(
      'Partita'
    );


  if (
    iMatch === -1 ||
    iData === -1 ||
    iPartita === -1
  ) {

    throw new Error(
      'DISTINTE deve contenere Match_ID, Data e Partita'
    );

  }


  // ==========================================
  // PARTITE UNICHE
  // ==========================================

  const partite = {};


  data.forEach(row => {

    const matchId =
      String(
        row[iMatch] || ''
      ).trim();

    const dataPartita =
      row[iData];

    const partita =
      String(
        row[iPartita] || ''
      ).trim();


    if (
      !matchId ||
      !dataPartita
    ) {
      return;
    }


    // ------------------------------------------
    // GIÀ SINCRONIZZATA → SALTA
    // ------------------------------------------

    if (
      matchEsistenti.has(
        matchId
      )
    ) {

      return;

    }


    if (!partite[matchId]) {

      partite[matchId] = {

        matchId,
        data: dataPartita,
        partita

      };

    }

  });


  const nuovePartite =
    Object.values(partite);


  Logger.log(
    'Nuove partite da cercare su Veo: ' +
    nuovePartite.length
  );


  // ==========================================
  // NIENTE DA FARE
  // ==========================================

  if (
    nuovePartite.length === 0
  ) {

    Logger.log(
      'Nessuna nuova partita da sincronizzare.'
    );


    SpreadsheetApp
      .getActive()
      .toast(
        'Nessuna nuova partita da sincronizzare.',
        'Villanovese',
        5
      );


    return;

  }


  // ==========================================
  // OUTPUT SOLO NUOVE PARTITE
  // ==========================================

  const output = [];


  nuovePartite.forEach(p => {

    try {

      // ======================================
      // FINESTRA DATA ±1 GIORNO
      // ======================================

      const d =
        new Date(p.data);


      if (
        isNaN(
          d.getTime()
        )
      ) {

        output.push([

          p.matchId,
          p.data,
          p.partita,

          '',
          '',
          '',
          '',
          '',

          'DATA NON VALIDA'

        ]);

        return;

      }


      const start =
        new Date(d);

      start.setDate(
        start.getDate() - 1
      );

      start.setHours(
        0,
        0,
        0,
        0
      );


      const end =
        new Date(d);

      end.setDate(
        end.getDate() + 1
      );

      end.setHours(
        23,
        59,
        59,
        999
      );


      const dateStart =
        start.toISOString();

      const dateEnd =
        end.toISOString();


      // ======================================
      // API VEO
      // ======================================

      const url =

        'https://app.veo.co/api/app/matches/' +

        '?fields=id' +
        '&fields=identifier' +
        '&fields=title' +
        '&fields=start' +
        '&fields=opponent_team_name' +
        '&fields=own_team_home_or_away' +
        '&fields=slug' +

        '&team=asd-villanovese-prima-squadra' +
        '&club=primo-maggio-2' +
        '&analytics_version=2' +

        '&date_start=' +
        encodeURIComponent(
          dateStart
        ) +

        '&date_end=' +
        encodeURIComponent(
          dateEnd
        );


      Logger.log(
        '--------------------------------'
      );

      Logger.log(
        'Cerco Veo | ' +
        p.matchId +
        ' | ' +
        p.partita
      );


      const response =
        UrlFetchApp.fetch(
          url,
          {

            method: 'get',

            headers: {

              Authorization:
                'Bearer ' +
                token,

              'veo-agent':
                'veo:svc:web-app'

            },

            muteHttpExceptions:
              true

          }
        );


      const status =
        response.getResponseCode();


      Logger.log(
        'HTTP Veo: ' +
        status
      );


      // ======================================
      // HTTP ERROR
      // ======================================

      if (status !== 200) {

        output.push([

          p.matchId,
          p.data,
          p.partita,

          '',
          '',
          '',
          '',
          '',

          'HTTP ' +
          status

        ]);

        return;

      }


      // ======================================
      // RISPOSTA
      // ======================================

      const json =
        JSON.parse(
          response.getContentText()
        );


      const matches =
        Array.isArray(json)

          ? json

          : (
              json.results ||
              json.items ||
              []
            );


      Logger.log(
        'Match Veo trovati: ' +
        matches.length
      );


      // ======================================
      // NON TROVATA
      // ======================================

      if (
        matches.length === 0
      ) {

        output.push([

          p.matchId,
          p.data,
          p.partita,

          '',
          '',
          '',
          '',
          '',

          'NON TROVATA'

        ]);

        return;

      }


      // ======================================
      // RISULTATI
      // ======================================

      matches.forEach(m => {

        output.push([

          p.matchId,

          p.data,

          p.partita,

          m.id || '',

          m.start || '',

          m.title || '',

          m.opponent_team_name ||
            '',

          m.own_team_home_or_away ||
            '',

          matches.length === 1
            ? 'OK'
            : 'PIÙ RISULTATI'

        ]);


        Logger.log(
          'VEO → ' +
          (m.title || '') +
          ' | ' +
          (m.id || '')
        );

      });


    } catch (e) {

      Logger.log(
        'ERRORE ' +
        p.matchId +
        ': ' +
        e.message
      );


      output.push([

        p.matchId,
        p.data,
        p.partita,

        '',
        '',
        '',
        '',
        '',

        'ERRORE: ' +
        e.message

      ]);

    }

  });


  // ==========================================
  // APPEND
  // NON CANCELLIAMO PIÙ VEO_MATCHES
  // ==========================================

  if (output.length) {

    veoSheet
      .getRange(
        veoSheet.getLastRow() + 1,
        1,
        output.length,
        headersOutput.length
      )
      .setValues(
        output
      );

  }


  // ==========================================
  // RIEPILOGO
  // ==========================================

  const ok =
    output.filter(
      r =>
        r[8] === 'OK'
    ).length;


  const nonTrovate =
    output.filter(
      r =>
        r[8] ===
        'NON TROVATA'
    ).length;


  const errori =
    output.filter(
      r =>
        String(r[8])
          .startsWith(
            'HTTP'
          ) ||
        String(r[8])
          .startsWith(
            'ERRORE'
          )
    ).length;


  Logger.log(
    '=============================='
  );

  Logger.log(
    'SYNC VEO INCREMENTALE'
  );

  Logger.log(
    'Nuove partite: ' +
    nuovePartite.length
  );

  Logger.log(
    'OK: ' + ok
  );

  Logger.log(
    'Non trovate: ' +
    nonTrovate
  );

  Logger.log(
    'Errori: ' +
    errori
  );

  Logger.log(
    '=============================='
  );


  SpreadsheetApp
    .getActive()
    .toast(
      'Veo: ' +
      nuovePartite.length +
      ' nuove partite elaborate.',
      'Villanovese',
      5
    );

}

function importaTuttePartiteVeo() {

  const token = getVeoAccessToken_();

  const TEAM_ID = VEO_TEAM_ID;
  const API = VEO_API;

  const ss = SpreadsheetApp.getActive();
  const matchSheet = ss.getSheetByName('VEO_MATCHES');

  if (!matchSheet) {
    throw new Error('Foglio VEO_MATCHES non trovato');
  }

  const data = matchSheet.getDataRange().getValues();
  const headers = data.shift();

  const iMatch = headers.indexOf('Match_ID');
  const iVeo = headers.indexOf('Veo_Match_ID');
  const iStato = headers.indexOf('Stato');

  if (iMatch === -1 || iVeo === -1) {
    throw new Error(
      'VEO_MATCHES deve contenere Match_ID e Veo_Match_ID'
    );
  }

  let raw = ss.getSheetByName('VEO_RAW');

  if (!raw) {
    raw = ss.insertSheet('VEO_RAW');
  }

  if (raw.getLastRow() === 0) {
    raw.getRange(1, 1, 1, 5).setValues([[
      'Veo_Match_ID',
      'Numero',
      'Stat_Type',
      'Value',
      'Unit'
    ]]);
  }

  const rawData = raw.getDataRange().getValues();
  const rawHeaders = rawData.length ? rawData[0] : [];
  const rVeo = rawHeaders.indexOf('Veo_Match_ID');
  const veoGiaImportati = new Set();

  if (rVeo >= 0) {
    rawData.slice(1).forEach(row => {
      const id = String(row[rVeo] || '').trim();
      if (id) veoGiaImportati.add(id);
    });
  }

  const partiteNuove = [];
  const visti = new Set();

  data.forEach(row => {
    const matchId = String(row[iMatch] || '').trim();
    const veoMatchId = String(row[iVeo] || '').trim();
    const stato = iStato >= 0
      ? String(row[iStato] || '').trim()
      : '';

    if (!veoMatchId) return;
    if (stato === 'NON TROVATA') return;
    if (veoGiaImportati.has(veoMatchId)) return;
    if (visti.has(veoMatchId)) return;

    visti.add(veoMatchId);
    partiteNuove.push({ matchId, veoMatchId });
  });

  if (!partiteNuove.length) {
    Logger.log('VEO_RAW: nessuna nuova partita da importare.');
    return { partite: 0, righe: 0 };
  }

  const output = [];
  let partiteCompletate = 0;

  partiteNuove.forEach(p => {
    Logger.log(
      'Importazione nuova partita Veo ' +
      p.matchId + ' → ' + p.veoMatchId
    );

    const rowsMatch = [];
    let erroriMatch = 0;

    for (let numero = 1; numero <= 30; numero++) {
      const payload = {
        type: 'cross_match_jersey',
        jersey_number: String(numero),
        team_id: TEAM_ID,
        match_ids: [p.veoMatchId]
      };

      try {
        const response = UrlFetchApp.fetch(API, {
          method: 'post',
          contentType: 'application/json',
          headers: {
            Authorization: 'Bearer ' + token,
            'veo-agent': 'veo:svc:web-app'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 200) {
          erroriMatch++;
          Logger.log(
            'Errore ' + p.matchId +
            ' numero ' + numero +
            ': HTTP ' + response.getResponseCode()
          );
          continue;
        }

        const json = JSON.parse(response.getContentText());

        (json.items || []).forEach(item => {
          (item.stats || []).forEach(stat => {
            rowsMatch.push([
              p.veoMatchId,
              numero,
              stat.type,
              stat.value,
              stat.unit
            ]);
          });
        });

      } catch (e) {
        erroriMatch++;
        Logger.log(
          'Errore partita ' + p.matchId +
          ' numero ' + numero + ': ' + e.message
        );
      }
    }

    /*
     * Se ci sono errori HTTP non consideriamo la partita completata:
     * non salviamo un import parziale che poi verrebbe saltato per sempre.
     */
    if (erroriMatch > 0) {
      Logger.log(
        '⚠️ VEO_RAW non salvato per ' + p.matchId +
        ': ' + erroriMatch + ' richieste fallite.'
      );
      return;
    }

    if (rowsMatch.length) {
      output.push(...rowsMatch);
      partiteCompletate++;
    } else {
      Logger.log(
        '⚠️ Nessuna statistica Veo trovata per ' + p.matchId +
        '. La partita resterà da riprovare.'
      );
    }
  });

  if (output.length) {
    raw.getRange(
      raw.getLastRow() + 1,
      1,
      output.length,
      5
    ).setValues(output);
  }

  Logger.log(
    'VEO_RAW incrementale: ' +
    partiteCompletate + ' nuove partite, ' +
    output.length + ' righe.'
  );

  return {
    partite: partiteCompletate,
    righe: output.length
  };
}

function testVeoPettorazzaIacovino() {

  const token = getVeoAccessToken_();
  const TEAM_ID = VEO_TEAM_ID;
  const API = VEO_API;

  const MATCH_ID = '4027317';
  const NUMERO = '6';

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('VEO_MATCHES');

  if (!sheet) {
    throw new Error('Foglio VEO_MATCHES non trovato');
  }

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const iMatch = headers.indexOf('Match_ID');
  const iVeo = headers.indexOf('Veo_Match_ID');

  if (iMatch === -1 || iVeo === -1) {
    throw new Error(
      'VEO_MATCHES deve contenere Match_ID e Veo_Match_ID'
    );
  }

  const row = data.find(r =>
    String(r[iMatch]).trim() === MATCH_ID
  );

  if (!row) {
    throw new Error(
      'Match_ID ' + MATCH_ID + ' non trovato in VEO_MATCHES'
    );
  }

  const veoMatchId = String(row[iVeo]).trim();

  if (!veoMatchId) {
    throw new Error(
      'Veo_Match_ID vuoto per Match_ID ' + MATCH_ID
    );
  }

  Logger.log('===== TEST IACOVINO =====');
  Logger.log('Match_ID: ' + MATCH_ID);
  Logger.log('Veo_Match_ID: ' + veoMatchId);
  Logger.log('Numero: ' + NUMERO);

  const payload = {
    type: 'cross_match_jersey',
    jersey_number: NUMERO,
    team_id: TEAM_ID,
    match_ids: [veoMatchId]
  };

  Logger.log(
    'Payload: ' + JSON.stringify(payload)
  );

  const response = UrlFetchApp.fetch(API, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      'veo-agent': 'veo:svc:web-app'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  Logger.log('HTTP STATUS: ' + status);
  Logger.log('RISPOSTA RAW: ' + body);

  if (status !== 200) {
    Logger.log('❌ Veo ha restituito errore HTTP');
    return;
  }

  const json = JSON.parse(body);

  Logger.log(
    'Numero items: ' +
    (json.items ? json.items.length : 0)
  );

  if (!json.items || json.items.length === 0) {
    Logger.log(
      '❌ NESSUN ITEM restituito da Veo per il numero 6'
    );
    return;
  }

  let totaleStats = 0;

  json.items.forEach((item, index) => {

    Logger.log('--- ITEM ' + (index + 1) + ' ---');

    if (!item.stats || item.stats.length === 0) {
      Logger.log('Nessuna statistica nell item');
      return;
    }

    item.stats.forEach(stat => {

      totaleStats++;

      Logger.log(
        stat.type +
        ' = ' +
        stat.value +
        ' ' +
        (stat.unit || '')
      );

    });

  });

  Logger.log(
    '✅ TOTALE STATISTICHE RESTITUITE: ' +
    totaleStats
  );

  Logger.log('===== FINE TEST =====');
}

function verificaImportVeo() {

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('VEO_RAW');

  if (!sheet) {
    throw new Error('Foglio VEO_RAW non trovato');
  }

  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    Logger.log('VEO_RAW è vuoto');
    return;
  }

  const headers = data[0];

  const iMatch = headers.indexOf('Veo_Match_ID');
  const iNumero = headers.indexOf('Numero');
  const iStat = headers.indexOf('Stat_Type');

  if (iMatch === -1 || iNumero === -1 || iStat === -1) {
    throw new Error('Intestazioni VEO_RAW non riconosciute');
  }

  const partite = {};

  for (let i = 1; i < data.length; i++) {

    const veoMatchId = String(data[i][iMatch]).trim();

    if (!veoMatchId) continue;

    if (!partite[veoMatchId]) {
      partite[veoMatchId] = {
        righe: 0,
        numeri: new Set()
      };
    }

    partite[veoMatchId].righe++;
    partite[veoMatchId].numeri.add(
      String(data[i][iNumero])
    );
  }

  Logger.log('==============================');
  Logger.log('VERIFICA VEO_RAW');
  Logger.log('Righe dati: ' + (data.length - 1));
  Logger.log('Partite Veo: ' + Object.keys(partite).length);
  Logger.log('==============================');

  Object.keys(partite).forEach(id => {

    Logger.log(
      id +
      ' → ' +
      partite[id].righe +
      ' righe, ' +
      partite[id].numeri.size +
      ' numeri'
    );

  });

}
function creaPlayerStatsDaVeo() {

  const ss = SpreadsheetApp.getActive();

  const rawSheet = ss.getSheetByName('VEO_RAW');
  const mapSheet = ss.getSheetByName('VEO_MATCHES');
  const distSheet = ss.getSheetByName('DISTINTE');

  if (!rawSheet || !mapSheet || !distSheet) {
    throw new Error(
      'Servono VEO_RAW, VEO_MATCHES e DISTINTE'
    );
  }

  // ==========================================
  // VEO_MATCHES: Veo_Match_ID -> Match_ID
  // ==========================================

  const mapData = mapSheet.getDataRange().getValues();
  const mapHeaders = mapData.shift();
  const iMatch = mapHeaders.indexOf('Match_ID');
  const iVeoMatch = mapHeaders.indexOf('Veo_Match_ID');

  if (iMatch === -1 || iVeoMatch === -1) {
    throw new Error(
      'VEO_MATCHES deve contenere Match_ID e Veo_Match_ID'
    );
  }

  const veoToMatch = {};

  mapData.forEach(row => {
    const matchId = String(row[iMatch] || '').trim();
    const veoId = String(row[iVeoMatch] || '').trim();
    if (matchId && veoId) veoToMatch[veoId] = matchId;
  });

  // ==========================================
  // DISTINTE: Match_ID + Numero -> giocatore
  // ==========================================

  const distData = distSheet.getDataRange().getValues();
  const distHeaders = distData.shift();

  const dMatch = distHeaders.indexOf('Match_ID');
  const dNumero = distHeaders.indexOf('Numero');
  const dPlayerId = distHeaders.indexOf('Player_ID');
  const dGiocatore = distHeaders.indexOf('Giocatore');
  const dData = distHeaders.indexOf('Data');
  const dPartita = distHeaders.indexOf('Partita');

  if (
    dMatch === -1 ||
    dNumero === -1 ||
    dPlayerId === -1 ||
    dGiocatore === -1
  ) {
    throw new Error(
      'DISTINTE deve contenere Match_ID, Numero, Player_ID e Giocatore'
    );
  }

  const giocatori = {};

  distData.forEach(row => {
    const matchId = String(row[dMatch] || '').trim();
    const numero = String(row[dNumero] || '').trim();
    if (!matchId || !numero) return;

    giocatori[matchId + '|' + numero] = {
      playerId: row[dPlayerId],
      giocatore: row[dGiocatore],
      data: dData >= 0 ? row[dData] : '',
      partita: dPartita >= 0 ? row[dPartita] : ''
    };
  });

  // ==========================================
  // PLAYER_STATS esistente
  // ==========================================

  let sheet = ss.getSheetByName('PLAYER_STATS');

  const headersOutput = [
    'Match_ID',
    'Data',
    'Partita',
    'Player_ID',
    'Giocatore',
    'Numero',
    'Veo_Match_ID',
    'Stat_Type',
    'Value',
    'Unit'
  ];

  if (!sheet) {
    sheet = ss.insertSheet('PLAYER_STATS');
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headersOutput.length)
      .setValues([headersOutput]);
  }

  const matchGiaCreati = new Set();
  const existing = sheet.getDataRange().getValues();

  if (existing.length > 1) {
    const eh = existing[0];
    const eMatch = eh.indexOf('Match_ID');
    if (eMatch >= 0) {
      existing.slice(1).forEach(row => {
        const id = String(row[eMatch] || '').trim();
        if (id) matchGiaCreati.add(id);
      });
    }
  }

  // ==========================================
  // VEO_RAW: solo Match_ID non ancora creati
  // ==========================================

  const rawData = rawSheet.getDataRange().getValues();
  const rawHeaders = rawData.shift();

  const rVeoMatch = rawHeaders.indexOf('Veo_Match_ID');
  const rNumero = rawHeaders.indexOf('Numero');
  const rStat = rawHeaders.indexOf('Stat_Type');
  const rValue = rawHeaders.indexOf('Value');
  const rUnit = rawHeaders.indexOf('Unit');

  if (
    rVeoMatch === -1 ||
    rNumero === -1 ||
    rStat === -1 ||
    rValue === -1 ||
    rUnit === -1
  ) {
    throw new Error('Intestazioni VEO_RAW non riconosciute');
  }

  const output = [];
  const nuoviMatch = new Set();
  let collegati = 0;
  let nonCollegati = 0;

  rawData.forEach(row => {
    const veoMatchId = String(row[rVeoMatch] || '').trim();
    const numero = String(row[rNumero] || '').trim();
    const matchId = veoToMatch[veoMatchId];

    if (!matchId) {
      nonCollegati++;
      return;
    }

    if (matchGiaCreati.has(matchId)) {
      return;
    }

    const player = giocatori[matchId + '|' + numero];

    if (!player) {
      nonCollegati++;
      return;
    }

    output.push([
      matchId,
      player.data,
      player.partita,
      player.playerId,
      player.giocatore,
      numero,
      veoMatchId,
      row[rStat],
      row[rValue],
      row[rUnit]
    ]);

    nuoviMatch.add(matchId);
    collegati++;
  });

  if (!output.length) {
    Logger.log('PLAYER_STATS: nessun nuovo Match_ID da creare.');
    return { partite: 0, righe: 0 };
  }

  sheet.getRange(
    sheet.getLastRow() + 1,
    1,
    output.length,
    headersOutput.length
  ).setValues(output);

  Logger.log('==============================');
  Logger.log('PLAYER_STATS INCREMENTALE');
  Logger.log('Nuove partite: ' + nuoviMatch.size);
  Logger.log('Righe create: ' + output.length);
  Logger.log('Collegamenti riusciti: ' + collegati);
  Logger.log('Non collegati: ' + nonCollegati);
  Logger.log('==============================');

  return {
    partite: nuoviMatch.size,
    righe: output.length
  };
}

function analizzaNonCollegatiVeo() {

  const ss = SpreadsheetApp.getActive();

  const rawSheet = ss.getSheetByName('VEO_RAW');
  const mapSheet = ss.getSheetByName('VEO_MATCHES');
  const distSheet = ss.getSheetByName('DISTINTE');

  const raw = rawSheet.getDataRange().getValues();
  const map = mapSheet.getDataRange().getValues();
  const dist = distSheet.getDataRange().getValues();

  const rh = raw.shift();
  const mh = map.shift();
  const dh = dist.shift();

  const rVeo = rh.indexOf('Veo_Match_ID');
  const rNum = rh.indexOf('Numero');

  const mMatch = mh.indexOf('Match_ID');
  const mVeo = mh.indexOf('Veo_Match_ID');

  const dMatch = dh.indexOf('Match_ID');
  const dNum = dh.indexOf('Numero');
  const dPlayer = dh.indexOf('Giocatore');

  const veoToMatch = {};

  map.forEach(row => {
    const match = String(row[mMatch]).trim();
    const veo = String(row[mVeo]).trim();

    if (match && veo) {
      veoToMatch[veo] = match;
    }
  });

  const distinte = {};

  dist.forEach(row => {

    const match = String(row[dMatch]).trim();
    const num = String(row[dNum]).trim();

    if (match && num) {
      distinte[match + '|' + num] =
        String(row[dPlayer]).trim();
    }

  });

  const nonCollegati = {};

  raw.forEach(row => {

    const veo = String(row[rVeo]).trim();
    const numero = String(row[rNum]).trim();

    const match = veoToMatch[veo];

    if (!match) return;

    const key = match + '|' + numero;

    if (!distinte[key]) {

      if (!nonCollegati[key]) {
        nonCollegati[key] = {
          match: match,
          numero: numero,
          righe: 0
        };
      }

      nonCollegati[key].righe++;

    }

  });

  Logger.log('==============================');
  Logger.log('STATISTICHE NON COLLEGATE');
  Logger.log('==============================');

  Object.values(nonCollegati).forEach(x => {

    Logger.log(
      'Match_ID: ' + x.match +
      ' | Numero: ' + x.numero +
      ' | Righe: ' + x.righe
    );

  });

  Logger.log(
    'Totale combinazioni non collegate: ' +
    Object.keys(nonCollegati).length
  );

}


function creaMedieGiocatori() {

  const ss = SpreadsheetApp.getActive();
  const source = ss.getSheetByName('PLAYER_STATS');

  if (!source) {
    throw new Error('Foglio PLAYER_STATS non trovato');
  }

  const data = source.getDataRange().getValues();
  const headers = data.shift();

  const iMatch = headers.indexOf('Match_ID');
  const iPlayer = headers.indexOf('Player_ID');
  const iGiocatore = headers.indexOf('Giocatore');
  const iStat = headers.indexOf('Stat_Type');
  const iValue = headers.indexOf('Value');

  if (
    iMatch === -1 ||
    iPlayer === -1 ||
    iGiocatore === -1 ||
    iStat === -1 ||
    iValue === -1
  ) {
    throw new Error('Struttura PLAYER_STATS non riconosciuta');
  }

  /*
   * Prima aggregazione:
   * giocatore + partita
   */

  const partite = {};

  data.forEach(row => {

    const match = String(row[iMatch]).trim();
    const playerId = String(row[iPlayer]).trim();
    const giocatore = String(row[iGiocatore]).trim();
    const stat = String(row[iStat]).trim();

    if (!match || !playerId || !stat) return;

    const key = playerId + '|' + match;

    if (!partite[key]) {
      partite[key] = {
        playerId: playerId,
        giocatore: giocatore,
        match: match,
        stats: {}
      };
    }

    const value = Number(row[iValue]);

    if (!isNaN(value)) {
      partite[key].stats[stat] = value;
    }

  });

  /*
   * Seconda aggregazione:
   * giocatore
   */

  const giocatori = {};

  Object.values(partite).forEach(p => {

    const id = p.playerId;

    if (!giocatori[id]) {
      giocatori[id] = {
        playerId: id,
        giocatore: p.giocatore,
        presenze: 0,
        minuti: 0,
        gol: 0,
        tiri: 0,
        passaggi: 0,
        passaggiCompletati: 0,
        distanza: 0,
        sprint: 0,
        corseIntense: 0,
        velocitaMassima: 0,
        velocitaMediaPonderata: 0,
        secondi: 0
      };
    }

    const g = giocatori[id];
    const s = p.stats;

    const secondi = Number(s.seconds_played_total || 0);

    if (secondi > 0) {
      g.presenze++;
      g.secondi += secondi;
      g.minuti += secondi / 60;
    }

    g.gol += Number(s.football_goal_total || 0);
    g.tiri += Number(s.football_shots_total || 0);

    g.passaggi += Number(s.football_passes_total || 0);

    g.passaggiCompletati +=
      Number(s.football_passes_completed_total || 0);

    g.distanza +=
      Number(s.distance_total_meters || 0);

    g.sprint +=
      Number(s.sprints_total || 0);

    g.corseIntense +=
      Number(s.high_intensity_runs_total || 0);

    g.velocitaMassima = Math.max(
      g.velocitaMassima,
      Number(s.top_speed_kmh || 0)
    );

    g.velocitaMediaPonderata +=
      Number(s.average_speed_kmh || 0) * secondi;

  });

  /*
   * Creazione output
   */

  const output = [];

  Object.values(giocatori).forEach(g => {

    const minuti = g.minuti;

    const distanzaKm = g.distanza / 1000;

    const velocitaMedia =
      g.secondi > 0
        ? g.velocitaMediaPonderata / g.secondi
        : 0;

    const passaggioPercentuale =
      g.passaggi > 0
        ? (g.passaggiCompletati / g.passaggi) * 100
        : 0;

    output.push([
      g.playerId,
      g.giocatore,
      g.presenze,
      minuti,
      g.gol,
      g.tiri,
      g.passaggi,
      g.passaggiCompletati,
      passaggioPercentuale,
      distanzaKm,
      g.sprint,
      g.corseIntense,
      g.velocitaMassima,
      velocitaMedia,
      g.gol / Math.max(g.presenze, 1),
      g.tiri / Math.max(g.presenze, 1),
      distanzaKm / Math.max(g.presenze, 1)
    ]);

  });

  /*
   * Scrittura foglio
   */

  let sheet = ss.getSheetByName('MEDIE_GIOCATORI');

  if (!sheet) {
    sheet = ss.insertSheet('MEDIE_GIOCATORI');
  }

  sheet.clearContents();

  const outputHeaders = [
    'Player_ID',
    'Giocatore',
    'Presenze',
    'Minuti',
    'Gol',
    'Tiri',
    'Passaggi',
    'Passaggi_Completati',
    'Passaggi_%',
    'Distanza_km',
    'Sprint',
    'Corse_Alta_Intensita',
    'Velocita_Max_kmh',
    'Velocita_Media_kmh',
    'Gol_per_Presenza',
    'Tiri_per_Presenza',
    'Distanza_km_per_Presenza'
  ];

  sheet
    .getRange(1, 1, 1, outputHeaders.length)
    .setValues([outputHeaders]);

  if (output.length) {
    sheet
      .getRange(2, 1, output.length, outputHeaders.length)
      .setValues(output);
  }

  Logger.log('==============================');
  Logger.log('MEDIE_GIOCATORI');
  Logger.log('Giocatori elaborati: ' + output.length);
  Logger.log('==============================');
}

function verificaStatPassaggi() {

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('VEO_RAW');

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const iStat = headers.indexOf('Stat_Type');

  const stats = {};

  data.forEach(row => {

    const stat = String(row[iStat]).trim();

    if (
      stat.toLowerCase().includes('pass')
    ) {
      stats[stat] = true;
    }

  });

  Logger.log('==============================');
  Logger.log('STATISTICHE PASSAGGI PRESENTI');
  Logger.log('==============================');

  Object.keys(stats).sort().forEach(stat => {
    Logger.log(stat);
  });

}
function verificaCoerenzaDatabase() {

  const ss = SpreadsheetApp.getActive();

  const distSheet = ss.getSheetByName('DISTINTE');
  const statsSheet = ss.getSheetByName('PLAYER_STATS');
  const medieSheet = ss.getSheetByName('MEDIE_GIOCATORI');

  if (!distSheet || !statsSheet || !medieSheet) {
    throw new Error(
      'Servono DISTINTE, PLAYER_STATS e MEDIE_GIOCATORI'
    );
  }

  // =========================
  // DISTINTE
  // =========================

  const distData = distSheet.getDataRange().getValues();
  const distHeaders = distData.shift();

  const dMatch = distHeaders.indexOf('Match_ID');
  const dPlayer = distHeaders.indexOf('Player_ID');
  const dGiocatore = distHeaders.indexOf('Giocatore');

  const distinte = {};
  const giocatoriDistinte = {};

  distData.forEach(row => {

    const match = String(row[dMatch]).trim();
    const player = String(row[dPlayer]).trim();
    const nome = String(row[dGiocatore]).trim();

    if (!match || !player) return;

    const key = player + '|' + match;

    distinte[key] = true;

    giocatoriDistinte[player] = nome;

  });

  // =========================
  // PLAYER_STATS
  // =========================

  const statsData = statsSheet.getDataRange().getValues();
  const statsHeaders = statsData.shift();

  const sMatch = statsHeaders.indexOf('Match_ID');
  const sPlayer = statsHeaders.indexOf('Player_ID');
  const sStat = statsHeaders.indexOf('Stat_Type');
  const sValue = statsHeaders.indexOf('Value');

  const partiteVeo = {};
  const giocatoriStats = {};

  statsData.forEach(row => {

    const match = String(row[sMatch]).trim();
    const player = String(row[sPlayer]).trim();
    const stat = String(row[sStat]).trim();
    const value = Number(row[sValue]);

    if (!match || !player) return;

    const key = player + '|' + match;

    if (!partiteVeo[key]) {
      partiteVeo[key] = {
        secondi: 0
      };
    }

    if (stat === 'seconds_played_total') {
      partiteVeo[key].secondi = value;
    }

    giocatoriStats[player] = true;

  });

  // =========================
  // MEDIE
  // =========================

  const medieData = medieSheet.getDataRange().getValues();
  const medieHeaders = medieData.shift();

  const mPlayer = medieHeaders.indexOf('Player_ID');
  const mPresenze = medieHeaders.indexOf('Presenze');

  const giocatoriMedie = {};

  medieData.forEach(row => {

    const player = String(row[mPlayer]).trim();

    if (!player) return;

    giocatoriMedie[player] = {
      nome: row[medieHeaders.indexOf('Giocatore')],
      presenze: Number(row[mPresenze])
    };

  });

  // =========================
  // CONTROLLO
  // =========================

  const anomalie = [];

  Object.keys(giocatoriDistinte).forEach(player => {

    if (!giocatoriMedie[player]) {

      anomalie.push(
        'MANCANTE DA MEDIE_GIOCATORI → ' +
        player +
        ' ' +
        giocatoriDistinte[player]
      );

    }

  });

  Object.keys(giocatoriMedie).forEach(player => {

    if (!giocatoriDistinte[player]) {

      anomalie.push(
        'PRESENTE IN MEDIE MA NON IN DISTINTE → ' +
        player +
        ' ' +
        giocatoriMedie[player].nome
      );

    }

  });

  // =========================
  // REPORT
  // =========================

  Logger.log('==============================');
  Logger.log('CONTROLLO COERENZA DATABASE');
  Logger.log('==============================');

  Logger.log(
    'Giocatori distinti: ' +
    Object.keys(giocatoriDistinte).length
  );

  Logger.log(
    'Giocatori in PLAYER_STATS: ' +
    Object.keys(giocatoriStats).length
  );

  Logger.log(
    'Giocatori in MEDIE_GIOCATORI: ' +
    Object.keys(giocatoriMedie).length
  );

  Logger.log(
    'Coppie giocatore/partita in DISTINTE: ' +
    Object.keys(distinte).length
  );

  Logger.log(
    'Coppie giocatore/partita in PLAYER_STATS: ' +
    Object.keys(partiteVeo).length
  );

  Logger.log('------------------------------');

  if (anomalie.length === 0) {

    Logger.log('NESSUNA ANOMALIA TROVATA');

  } else {

    Logger.log(
      'ANOMALIE TROVATE: ' +
      anomalie.length
    );

    anomalie.forEach(a => Logger.log(a));

  }

  Logger.log('==============================');

}
function creaAnalisiGiocatori() {

  const ss = SpreadsheetApp.getActive();

  const source =
    ss.getSheetByName('ANALISI_PARTITE');

  if (!source) {
    throw new Error(
      'Foglio ANALISI_PARTITE non trovato'
    );
  }

  const data =
    source.getDataRange().getValues();

  if (data.length <= 1) {
    throw new Error(
      'ANALISI_PARTITE è vuoto'
    );
  }

  const headers = data.shift();

  const idx = {};

  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });


  // ==========================================
  // COLONNE NECESSARIE
  // ==========================================

  const richiesti = [

    'Match_ID',
    'Player_ID',
    'Giocatore',

    'Minuti',

    'Gol',
    'Assist',
    'Ammonizioni',
    'Espulsioni',

    'Tiri',
    'Tiri_Totali',

    'Passaggi',
    'Passaggi_Completati',

    'Distanza_km',

    'Sprint',
    'Corse_Alta_Intensita',

    'Velocita_Max_kmh',
    'Velocita_Media_kmh',

    'Contrasti',
    'Falli',
    'Coinvolgimenti_Gol'

  ];


  richiesti.forEach(h => {

    if (idx[h] === undefined) {

      throw new Error(
        'ANALISI_PARTITE: colonna mancante: ' + h
      );

    }

  });


  // ==========================================
  // AGGREGAZIONE PER GIOCATORE
  // ==========================================

  const giocatori = {};
  const presenzeUfficiali = new Set();
  const presenzeContate = new Set();

  const lineupSheet =
    ss.getSheetByName('YOUCOACH_LINEUPS');

  if (lineupSheet) {
    sheetToObjects(lineupSheet).forEach(row => {
      const matchId = String(row.Match_ID || '').trim();
      const playerId = String(row.Player_ID || '').trim();
      const titolare =
        row.Titolare === true ||
        String(row.Titolare).toLowerCase() === 'true';

      if (matchId && playerId && titolare) {
        presenzeUfficiali.add(matchId + '|' + playerId);
      }
    });
  }

  const substitutionsSheet =
    ss.getSheetByName('YOUCOACH_SUBSTITUTIONS');

  if (substitutionsSheet) {
    sheetToObjects(substitutionsSheet).forEach(row => {
      const matchId = String(row.Match_ID || '').trim();
      const playerOutId = String(row.Player_Out_ID || '').trim();
      const playerInId = String(row.Player_In_ID || '').trim();

      if (matchId && playerOutId) {
        presenzeUfficiali.add(matchId + '|' + playerOutId);
      }

      if (matchId && playerInId) {
        presenzeUfficiali.add(matchId + '|' + playerInId);
      }
    });
  }


  data.forEach(row => {

    const matchId =
      String(
        row[idx.Match_ID] || ''
      ).trim();

    const playerId =
      String(
        row[idx.Player_ID] || ''
      ).trim();

    const giocatore =
      String(
        row[idx.Giocatore] || ''
      ).trim();


    if (
      !matchId ||
      !playerId ||
      !giocatore
    ) {
      return;
    }


    if (!giocatori[playerId]) {

      giocatori[playerId] = {

        playerId,
        giocatore,

        presenze: 0,
        minuti: 0,

        gol: 0,
        assist: 0,

        ammonizioni: 0,
        espulsioni: 0,

        tiri: 0,
        tiriTotali: 0,

        passaggi: 0,
        passaggiCompletati: 0,

        distanza: 0,

        sprint: 0,
        corseIntense: 0,

        velocitaMax: 0,

        sommaVelocitaMediaPesata: 0,
        minutiVelocitaMedia: 0,

        contrasti: 0,
        falli: 0,
        coinvolgimentiGol: 0

      };

    }


    const g =
      giocatori[playerId];


    const minuti =
      Number(
        row[idx.Minuti]
      ) || 0;


    // ==========================================
    // PRESENZA
    // ==========================================

    const presenzaKey =
      matchId + '|' + playerId;

    if (
      (minuti > 0 || presenzeUfficiali.has(presenzaKey)) &&
      !presenzeContate.has(presenzaKey)
    ) {
      g.presenze++;
      presenzeContate.add(presenzaKey);
    }


    // ==========================================
    // DATI UFFICIALI
    // ==========================================

    g.minuti += minuti;

    g.gol +=
      Number(row[idx.Gol]) || 0;

    g.assist +=
      Number(row[idx.Assist]) || 0;

    g.ammonizioni +=
      Number(row[idx.Ammonizioni]) || 0;

    g.espulsioni +=
      Number(row[idx.Espulsioni]) || 0;


    // ==========================================
    // VEO
    // ==========================================

    g.tiri +=
      Number(row[idx.Tiri]) || 0;

    g.tiriTotali +=
      Number(row[idx.Tiri_Totali]) || 0;

    g.passaggi +=
      Number(row[idx.Passaggi]) || 0;

    g.passaggiCompletati +=
      Number(row[idx.Passaggi_Completati]) || 0;

    g.distanza +=
      Number(row[idx.Distanza_km]) || 0;

    g.sprint +=
      Number(row[idx.Sprint]) || 0;

    g.corseIntense +=
      Number(row[idx.Corse_Alta_Intensita]) || 0;

    g.contrasti +=
      Number(row[idx.Contrasti]) || 0;

    g.falli +=
      Number(row[idx.Falli]) || 0;

    g.coinvolgimentiGol +=
      Number(row[idx.Coinvolgimenti_Gol]) || 0;


    // ==========================================
    // VELOCITÀ MASSIMA
    // ==========================================

    const velocitaMax =
      Number(
        row[idx.Velocita_Max_kmh]
      ) || 0;

    if (velocitaMax > g.velocitaMax) {
      g.velocitaMax = velocitaMax;
    }


    // ==========================================
    // VELOCITÀ MEDIA PESATA
    // ==========================================

    const velocitaMedia =
      Number(
        row[idx.Velocita_Media_kmh]
      ) || 0;

    if (
      minuti > 0 &&
      velocitaMedia > 0
    ) {

      g.sommaVelocitaMediaPesata +=
        velocitaMedia * minuti;

      g.minutiVelocitaMedia +=
        minuti;

    }

  });


  // ==========================================
  // CREAZIONE OUTPUT
  // ==========================================

  const output = [];


  Object.values(giocatori).forEach(g => {

    const minuti =
      g.minuti;

    const fattore90 =
      minuti > 0
        ? 90 / minuti
        : 0;


    // ==========================================
    // /90
    // ==========================================

    const gol90 =
      g.gol * fattore90;

    const assist90 =
      g.assist * fattore90;

    const tiri90 =
      g.tiri * fattore90;

    const tiriTotali90 =
      g.tiriTotali * fattore90;

    const passaggi90 =
      g.passaggi * fattore90;

    const passaggiCompletati90 =
      g.passaggiCompletati * fattore90;

    const distanza90 =
      g.distanza * fattore90;

    const sprint90 =
      g.sprint * fattore90;

    const corseIntense90 =
      g.corseIntense * fattore90;

    const contrasti90 =
      g.contrasti * fattore90;

    const falli90 =
      g.falli * fattore90;

    const coinvolgimentiGol90 =
      g.coinvolgimentiGol * fattore90;


    // ==========================================
    // PASSAGGI %
    // ==========================================

    const passaggiPercentuale =
      g.passaggi > 0
        ? (
            g.passaggiCompletati /
            g.passaggi
          ) * 100
        : 0;


    // ==========================================
    // VELOCITÀ MEDIA
    // ==========================================

    const velocitaMedia =
      g.minutiVelocitaMedia > 0
        ? (
            g.sommaVelocitaMediaPesata /
            g.minutiVelocitaMedia
          )
        : 0;


    // ==========================================
    // RAPPORTI
    // ==========================================

    const minutiPerPresenza =
      g.presenze > 0
        ? minuti / g.presenze
        : 0;

    const sprintPerKm =
      g.distanza > 0
        ? g.sprint / g.distanza
        : 0;

    const corseIntensePerKm =
      g.distanza > 0
        ? g.corseIntense / g.distanza
        : 0;

    const golPerTiro =
      g.tiri > 0
        ? g.gol / g.tiri
        : 0;

    const minutiPerGol =
      g.gol > 0
        ? minuti / g.gol
        : 0;

    const minutiPerAssist =
      g.assist > 0
        ? minuti / g.assist
        : 0;

    const minutiPerTiro =
      g.tiri > 0
        ? minuti / g.tiri
        : 0;


    // ==========================================
    // OUTPUT
    // ==========================================

    output.push([

      g.playerId,
      g.giocatore,

      g.presenze,
      minuti,

      g.gol,
      gol90,

      g.assist,
      assist90,

      g.ammonizioni,
      g.espulsioni,

      g.tiri,
      tiri90,

      g.tiriTotali,
      tiriTotali90,

      g.passaggi,
      passaggi90,

      g.passaggiCompletati,
      passaggiCompletati90,

      passaggiPercentuale,

      g.distanza,
      distanza90,

      g.sprint,
      sprint90,

      g.corseIntense,
      corseIntense90,

      g.velocitaMax,
      velocitaMedia,

      g.contrasti,
      contrasti90,

      g.falli,
      falli90,

      g.coinvolgimentiGol,
      coinvolgimentiGol90,

      minutiPerPresenza,

      sprintPerKm,

      corseIntensePerKm,

      golPerTiro,

      minutiPerGol,

      minutiPerAssist,

      minutiPerTiro

    ]);

  });


  // ==========================================
  // ORDINE PLAYER_ID
  // ==========================================

  output.sort((a, b) =>
    String(a[0]).localeCompare(
      String(b[0]),
      undefined,
      { numeric: true }
    )
  );


  // ==========================================
  // FOGLIO OUTPUT
  // ==========================================

  let sheet =
    ss.getSheetByName(
      'ANALISI_GIOCATORI'
    );

  if (!sheet) {

    sheet =
      ss.insertSheet(
        'ANALISI_GIOCATORI'
      );

  }

  sheet.clearContents();


  const outputHeaders = [

    'Player_ID',
    'Giocatore',

    'Presenze',
    'Minuti',

    'Gol',
    'Gol_per_90',

    'Assist',
    'Assist_per_90',

    'Ammonizioni',
    'Espulsioni',

    'Tiri',
    'Tiri_per_90',

    'Tiri_Totali',
    'Tiri_Totali_per_90',

    'Passaggi',
    'Passaggi_per_90',

    'Passaggi_Completati',
    'Passaggi_Completati_per_90',

    'Passaggi_%',

    'Distanza_km',
    'Distanza_km_per_90',

    'Sprint',
    'Sprint_per_90',

    'Corse_Alta_Intensita',
    'Corse_Alta_Intensita_per_90',

    'Velocita_Max_kmh',
    'Velocita_Media_kmh',

    'Contrasti',
    'Contrasti_per_90',

    'Falli',
    'Falli_per_90',

    'Coinvolgimenti_Gol',
    'Coinvolgimenti_Gol_per_90',

    'Minuti_per_Presenza',

    'Sprint_per_km',

    'Corse_Alta_Intensita_per_km',

    'Gol_per_Tiro',

    'Minuti_per_Gol',

    'Minuti_per_Assist',

    'Minuti_per_Tiro'

  ];


  sheet
    .getRange(
      1,
      1,
      1,
      outputHeaders.length
    )
    .setValues([
      outputHeaders
    ]);


  if (output.length) {

    sheet
      .getRange(
        2,
        1,
        output.length,
        outputHeaders.length
      )
      .setValues(
        output
      );

  }


  // ==========================================
  // LOG
  // ==========================================

  Logger.log(
    '=============================='
  );

  Logger.log(
    'ANALISI_GIOCATORI'
  );

  Logger.log(
    'Fonte: ANALISI_PARTITE'
  );

  Logger.log(
    'Giocatori analizzati: ' +
    output.length
  );

  Logger.log(
    '=============================='
  );

}
function creaAnalisiPartite() {

  const ss = SpreadsheetApp.getActive();

  const playerStatsSheet =
    ss.getSheetByName('PLAYER_STATS');

  const youcoachSheet =
    ss.getSheetByName('YOUCOACH_STATS');

  const veoReportSheet =
    ss.getSheetByName('VEO_REPORT_STATS');


  if (!playerStatsSheet) {
    throw new Error(
      'Foglio PLAYER_STATS non trovato'
    );
  }


  // ==================================================
  // 1. CARICAMENTO PLAYER_STATS / VEO API
  // ==================================================

  const veoData =
    playerStatsSheet
      .getDataRange()
      .getValues();

  const veoHeaders =
    veoData.shift();

  const vIdx = {};

  veoHeaders.forEach((h, i) => {
    vIdx[String(h).trim()] = i;
  });


  [
    'Match_ID',
    'Data',
    'Partita',
    'Player_ID',
    'Giocatore',
    'Stat_Type',
    'Value'
  ].forEach(h => {

    if (vIdx[h] === undefined) {

      throw new Error(
        'PLAYER_STATS: colonna mancante: ' + h
      );

    }

  });


  // ==================================================
  // 2. AGGREGAZIONE VEO API
  // ==================================================

  const veoMap = {};


  veoData.forEach(row => {

    const matchId =
      String(
        row[vIdx.Match_ID] || ''
      ).trim();

    const playerId =
      String(
        row[vIdx.Player_ID] || ''
      ).trim();


    if (!matchId || !playerId) {
      return;
    }


    const key =
      matchId + '|' + playerId;


    if (!veoMap[key]) {

      veoMap[key] = {

        matchId: matchId,

        data:
          row[vIdx.Data],

        partita:
          row[vIdx.Partita],

        playerId: playerId,

        giocatore:
          row[vIdx.Giocatore],

        stats: {}

      };

    }


    const stat =
      String(
        row[vIdx.Stat_Type] || ''
      ).trim();

    const value =
      Number(
        row[vIdx.Value]
      );


    if (
      stat &&
      !isNaN(value)
    ) {

      veoMap[key]
        .stats[stat] = value;

    }

  });


  // ==================================================
  // 3. CARICAMENTO YOUCOACH
  // ==================================================

  const ycMap = {};


  if (youcoachSheet) {

    const ycData =
      youcoachSheet
        .getDataRange()
        .getValues();


    if (ycData.length > 1) {

      const ycHeaders =
        ycData.shift();

      const yIdx = {};


      ycHeaders.forEach((h, i) => {
        yIdx[String(h).trim()] = i;
      });


      [
        'Match_ID',
        'Player_ID',
        'Giocatore',
        'Competizione',
        'Minuti',
        'Gol',
        'Assist',
        'Ammonizioni',
        'Espulsioni'
      ].forEach(h => {

        if (yIdx[h] === undefined) {

          throw new Error(
            'YOUCOACH_STATS: colonna mancante: ' + h
          );

        }

      });


      ycData.forEach(row => {

        const matchId =
          String(
            row[yIdx.Match_ID] || ''
          ).trim();

        const playerId =
          String(
            row[yIdx.Player_ID] || ''
          ).trim();


        if (
          !matchId ||
          !playerId
        ) {
          return;
        }


        const key =
          matchId +
          '|' +
          playerId;


        ycMap[key] = {

          matchId: matchId,

          playerId: playerId,

          giocatore:
            String(
              row[yIdx.Giocatore] || ''
            ).trim(),

          competizione:
            String(
              row[yIdx.Competizione] || ''
            ).trim(),

          minuti:
            Number(
              row[yIdx.Minuti] || 0
            ),

          gol:
            Number(
              row[yIdx.Gol] || 0
            ),

          assist:
            Number(
              row[yIdx.Assist] || 0
            ),

          ammonizioni:
            Number(
              row[yIdx.Ammonizioni] || 0
            ),

          espulsioni:
            Number(
              row[yIdx.Espulsioni] || 0
            )

        };

      });

    }

  }


  // ==================================================
  // 4. CARICAMENTO VEO REPORT MHTML
  // ==================================================

  const veoReportMap = {};


  if (veoReportSheet) {

    const reportData =
      veoReportSheet
        .getDataRange()
        .getValues();


    if (reportData.length > 1) {

      const reportHeaders =
        reportData.shift();

      const rIdx = {};


      reportHeaders.forEach((h, i) => {
        rIdx[String(h).trim()] = i;
      });


      [
        'Match_ID',
        'Player_ID',
        'Giocatore',
        'Tiri_Totali',
        'Contrasti',
        'Falli',
        'Coinvolgimenti_Gol'
      ].forEach(h => {

        if (rIdx[h] === undefined) {

          throw new Error(
            'VEO_REPORT_STATS: colonna mancante: ' + h
          );

        }

      });


      reportData.forEach(row => {

        const matchId =
          String(
            row[rIdx.Match_ID] || ''
          ).trim();

        const playerId =
          String(
            row[rIdx.Player_ID] || ''
          ).trim();


        if (
          !matchId ||
          !playerId
        ) {
          return;
        }


        const key =
          matchId +
          '|' +
          playerId;


        veoReportMap[key] = {

          matchId: matchId,

          playerId: playerId,

          giocatore:
            String(
              row[rIdx.Giocatore] || ''
            ).trim(),

          tiriTotali:
            Number(
              row[rIdx.Tiri_Totali] || 0
            ),

          contrasti:
            Number(
              row[rIdx.Contrasti] || 0
            ),

          falli:
            Number(
              row[rIdx.Falli] || 0
            ),

          coinvolgimentiGol:
            Number(
              row[rIdx.Coinvolgimenti_Gol] || 0
            )

        };

      });

    }

  }


  // ==================================================
  // 5. METADATI PARTITA
  // ==================================================

  const matchInfo = {};


  Object.values(veoMap)
    .forEach(v => {

      if (!matchInfo[v.matchId]) {

        matchInfo[v.matchId] = {

          data: v.data,
          partita: v.partita

        };

      }

    });


  // ================================================
  // Integrazione metadati da VEO_REPORT_STATS
  // ================================================

  if (veoReportSheet) {

    const reportObjects =
      sheetToObjects(
        veoReportSheet
      );


    reportObjects.forEach(row => {

      const matchId =
        String(
          row.Match_ID || ''
        ).trim();


      if (
        !matchId ||
        matchInfo[matchId]
      ) {
        return;
      }


      matchInfo[matchId] = {

        data:
          row.Data || '',

        partita:
          row.Partita || ''

      };

    });

  }


  // ==================================================
  // 6. UNIONE CHIAVI
  //
  // Il report Veo NON crea da solo una presenza.
  //
  // Deve esistere almeno:
  // - PLAYER_STATS
  // oppure
  // - YOUCOACH_STATS
  // ==================================================

  const allKeys =
    new Set([

      ...Object.keys(veoMap),

      ...Object.keys(ycMap)

    ]);


  // ==================================================
  // 7. CREAZIONE ANALISI_PARTITE
  // ==================================================

  const output = [];


  let righeYouCoach = 0;

  let righeSoloVeo = 0;

  let giocatoriSenzaVeo = 0;

  let veoIgnoratoZeroMinuti = 0;

  let righeConVeoReport = 0;

  let veoReportIgnoratoZeroMinuti = 0;


  allKeys.forEach(key => {

    const veo =
      veoMap[key] || null;

    const yc =
      ycMap[key] || null;

    const report =
      veoReportMap[key] || null;


    // -----------------------------------------------
    // IDENTIFICAZIONE
    // -----------------------------------------------

    const matchId =
      yc
        ? yc.matchId
        : veo.matchId;


    const playerId =
      yc
        ? yc.playerId
        : veo.playerId;


    const giocatore =

      yc &&
      yc.giocatore

        ? yc.giocatore

        : (
            veo &&
            veo.giocatore

              ? veo.giocatore

              : (
                  report
                    ? report.giocatore
                    : ''
                )
          );


    const info =
      matchInfo[matchId] || {};


    const data =

      veo

        ? veo.data

        : (
            info.data || ''
          );


    const partita =

      veo

        ? veo.partita

        : (
            info.partita || ''
          );


    // -----------------------------------------------
    // COMPETIZIONE
    //
    // Fonte ufficiale: YOUCOACH
    // -----------------------------------------------

    const competizione =

      yc &&
      yc.competizione

        ? yc.competizione

        : '';


    // -----------------------------------------------
    // PRESENZA YOUCOACH
    // -----------------------------------------------

    const haYouCoach =
      yc !== null;


    if (haYouCoach) {

      righeYouCoach++;

    } else {

      righeSoloVeo++;

    }


    // -----------------------------------------------
    // MINUTI
    //
    // PRIORITÀ ASSOLUTA YOUCOACH
    // -----------------------------------------------

    const minutiVeo =

      veo

        ? Number(
            veo.stats
              .seconds_played_total || 0
          ) / 60

        : 0;


    const minuti =

      haYouCoach

        ? yc.minuti

        : minutiVeo;


    // -----------------------------------------------
    // VALIDITÀ VEO API
    // -----------------------------------------------

    let usaVeo =
      veo !== null;


    if (
      haYouCoach &&
      yc.minuti === 0
    ) {

      if (veo !== null) {
        veoIgnoratoZeroMinuti++;
      }

      usaVeo = false;

    }


    if (
      haYouCoach &&
      yc.minuti > 0 &&
      veo === null
    ) {

      giocatoriSenzaVeo++;

    }


    const s =

      usaVeo

        ? veo.stats

        : {};


    // -----------------------------------------------
    // VALIDITÀ VEO REPORT
    // -----------------------------------------------

    let usaVeoReport =
      report !== null;


    if (
      haYouCoach &&
      yc.minuti === 0
    ) {

      if (report !== null) {
        veoReportIgnoratoZeroMinuti++;
      }

      usaVeoReport = false;

    }


    if (usaVeoReport) {
      righeConVeoReport++;
    }


    const vr =

      usaVeoReport

        ? report

        : null;


    // -----------------------------------------------
    // EVENTI UFFICIALI
    //
    // Fonte: YOUCOACH
    // -----------------------------------------------

    const gol =

      haYouCoach

        ? yc.gol

        : Number(
            s.football_goal_total || 0
          );


    const assist =

      haYouCoach

        ? yc.assist

        : 0;


    const ammonizioni =

      haYouCoach

        ? yc.ammonizioni

        : 0;


    const espulsioni =

      haYouCoach

        ? yc.espulsioni

        : 0;


    // -----------------------------------------------
    // STATISTICHE VEO API
    // -----------------------------------------------

    const tiri =

      Number(
        s.football_shots_total || 0
      );


    const passaggi =

      Number(
        s.football_passes_total || 0
      );


    const passaggiCompletati =

      Number(
        s.football_passes_completed_total || 0
      );


    const distanza =

      Number(
        s.distance_total_meters || 0
      ) / 1000;


    const sprint =

      Number(
        s.sprints_total || 0
      );


    const corseIntense =

      Number(
        s.high_intensity_runs_total || 0
      );


    const velocitaMax =

      Number(
        s.top_speed_kmh || 0
      );


    const velocitaMedia =

      Number(
        s.average_speed_kmh || 0
      );


    // -----------------------------------------------
    // STATISTICHE VEO REPORT MHTML
    // -----------------------------------------------

    const tiriTotali =

      vr

        ? Number(
            vr.tiriTotali || 0
          )

        : 0;


    const contrasti =

      vr

        ? Number(
            vr.contrasti || 0
          )

        : 0;


    const falli =

      vr

        ? Number(
            vr.falli || 0
          )

        : 0;


    const coinvolgimentiGol =

      vr

        ? Number(
            vr.coinvolgimentiGol || 0
          )

        : 0;


    // -----------------------------------------------
    // CALCOLI
    // -----------------------------------------------

    const fattore90 =

      minuti > 0

        ? 90 / minuti

        : 0;


    const passaggiPercentuale =

      passaggi > 0

        ? (
            passaggiCompletati /
            passaggi
          ) * 100

        : 0;


    // -----------------------------------------------
    // OUTPUT
    // -----------------------------------------------

    output.push([

      matchId,

      data,

      partita,

      competizione,

      playerId,

      giocatore,

      minuti,

      // GOL
      gol,
      gol * fattore90,

      // ASSIST / CARTELLINI
      assist,
      ammonizioni,
      espulsioni,

      // TIRI
      tiri,
      tiri * fattore90,

      // TIRI TOTALI REPORT
      tiriTotali,
      tiriTotali * fattore90,

      // PASSAGGI
      passaggi,
      passaggiCompletati,
      passaggiPercentuale,

      // DISTANZA
      distanza,
      distanza * fattore90,

      // SPRINT
      sprint,
      sprint * fattore90,

      // ALTA INTENSITÀ
      corseIntense,
      corseIntense * fattore90,

      // VELOCITÀ
      velocitaMax,
      velocitaMedia,

      // CONTRASTI
      contrasti,
      contrasti * fattore90,

      // FALLI
      falli,
      falli * fattore90,

      // COINVOLGIMENTI GOL
      coinvolgimentiGol,
      coinvolgimentiGol * fattore90

    ]);

  });


  // ==================================================
  // 8. SCRITTURA FOGLIO
  // ==================================================

  let sheet =
    ss.getSheetByName(
      'ANALISI_PARTITE'
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        'ANALISI_PARTITE'
      );

  }


  sheet.clearContents();


  const outputHeaders = [

    'Match_ID',

    'Data',

    'Partita',

    'Competizione',

    'Player_ID',

    'Giocatore',

    'Minuti',

    'Gol',

    'Gol_per_90',

    'Assist',

    'Ammonizioni',

    'Espulsioni',

    'Tiri',

    'Tiri_per_90',

    'Tiri_Totali',

    'Tiri_Totali_per_90',

    'Passaggi',

    'Passaggi_Completati',

    'Passaggi_%',

    'Distanza_km',

    'Distanza_km_per_90',

    'Sprint',

    'Sprint_per_90',

    'Corse_Alta_Intensita',

    'Corse_Alta_Intensita_per_90',

    'Velocita_Max_kmh',

    'Velocita_Media_kmh',

    'Contrasti',

    'Contrasti_per_90',

    'Falli',

    'Falli_per_90',

    'Coinvolgimenti_Gol',

    'Coinvolgimenti_Gol_per_90'

  ];


  sheet
    .getRange(
      1,
      1,
      1,
      outputHeaders.length
    )
    .setValues([
      outputHeaders
    ]);


  if (output.length) {

    sheet
      .getRange(
        2,
        1,
        output.length,
        outputHeaders.length
      )
      .setValues(
        output
      );

  }


  // ==================================================
  // 9. LOG CONTROLLO
  // ==================================================

  Logger.log(
    '=============================='
  );

  Logger.log(
    'ANALISI_PARTITE'
  );

  Logger.log(
    'Righe create: ' +
    output.length
  );

  Logger.log(
    'Righe con YouCoach: ' +
    righeYouCoach
  );

  Logger.log(
    'Righe solo Veo: ' +
    righeSoloVeo
  );

  Logger.log(
    'Giocatori impiegati senza dati Veo API: ' +
    giocatoriSenzaVeo
  );

  Logger.log(
    'Dati Veo API ignorati perché YouCoach = 0 minuti: ' +
    veoIgnoratoZeroMinuti
  );

  Logger.log(
    'Righe con Veo Report: ' +
    righeConVeoReport
  );

  Logger.log(
    'Dati Veo Report ignorati perché YouCoach = 0 minuti: ' +
    veoReportIgnoratoZeroMinuti
  );

  Logger.log(
    '=============================='
  );

}

function rimuoviPartita() {
  const ui = SpreadsheetApp.getUi();

  const risposta = ui.prompt(
    '🗑️ RIMUOVI PARTITA',
    'Inserisci il Match_ID della partita da eliminare:',
    ui.ButtonSet.OK_CANCEL
  );

  if (risposta.getSelectedButton() !== ui.Button.OK) return;

  const matchId = risposta.getResponseText().trim();

  if (!matchId) {
    ui.alert('❌ Match_ID non inserito.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Recuperiamo PRIMA i Veo_Match_ID
  const veoMatchIds = getVeoMatchIdsPerMatchId_(ss, matchId);

  const fogli = [
    'DISTINTE',
    'YOUCOACH_STATS',
    'YOUCOACH_LINEUPS',
    'YOUCOACH_SUBSTITUTIONS',
    'VEO_MATCHES',
    'PLAYER_STATS',
    'VEO_REPORT_STATS',
    'VEO_POSITION_STATS',
    'VEO_EVENT_POSITIONS',
    'ANALISI_PARTITE'
  ];

  let riepilogo = [];
  let trovata = false;

  fogli.forEach(nomeFoglio => {
    const sheet = ss.getSheetByName(nomeFoglio);

    if (!sheet) return;

    const result = trovaRighePerMatchId_(sheet, matchId);

    if (result.count > 0) {
      trovata = true;
      riepilogo.push(`${nomeFoglio}: ${result.count} righe`);
    }
  });

  if (veoMatchIds.length > 0) {
    const rawCount = contaVeoRaw_(ss, veoMatchIds);

    if (rawCount > 0) {
      trovata = true;
      riepilogo.push(`VEO_RAW: ${rawCount} righe`);
    }
  }

  if (!trovata) {
    ui.alert(
      '⚠️ PARTITA NON TROVATA',
      `Nessun dato trovato per:\n\n${matchId}`,
      ui.ButtonSet.OK
    );
    return;
  }

  const conferma = ui.alert(
    '⚠️ CONFERMA',
    `Partita:\n${matchId}\n\n` +
    riepilogo.join('\n') +
    `\n\nEliminare definitivamente questi dati?`,
    ui.ButtonSet.YES_NO
  );

  if (conferma !== ui.Button.YES) {
    ui.alert('Operazione annullata.');
    return;
  }

  // =====================================================
  // ELIMINAZIONE IN BLOCCO
  // =====================================================

  eliminaVeoRawPerVeoIds_(ss, veoMatchIds);

  fogli.forEach(nomeFoglio => {
    eliminaRighePerMatchId_(
      ss.getSheetByName(nomeFoglio),
      matchId
    );
  });

  SpreadsheetApp.flush();

  // =====================================================
  // RICALCOLO
  // =====================================================

  creaAnalisiPartite();
  creaAnalisiGiocatori();

  SpreadsheetApp.flush();

  ui.alert(
    '✅ PARTITA RIMOSSA',
    `${matchId}\n\n` +
    `Dati eliminati e statistiche ricalcolate.`,
    ui.ButtonSet.OK
  );
}

function eliminaRighePerMatchId_(sheet, matchId) {
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return 0;

  const headers = data[0].map(String);
  const matchIdCol = headers.indexOf('Match_ID');

  if (matchIdCol === -1) return 0;

  const nuoveRighe = [data[0]];
  let eliminate = 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][matchIdCol]).trim() === String(matchId).trim()) {
      eliminate++;
    } else {
      nuoveRighe.push(data[i]);
    }
  }

  if (eliminate === 0) return 0;

  // Riscrive il foglio in blocco
  sheet.clearContents();

  sheet
    .getRange(1, 1, nuoveRighe.length, headers.length)
    .setValues(nuoveRighe);

  return eliminate;
}

function getVeoMatchIdsPerMatchId_(ss, matchId) {
  const sheet = ss.getSheetByName('VEO_MATCHES');

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return [];

  const headers = data[0].map(String);

  const matchCol = headers.indexOf('Match_ID');
  const veoCol = headers.indexOf('Veo_Match_ID');

  if (matchCol === -1 || veoCol === -1) return [];

  const ids = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][matchCol]).trim() === matchId) {
      const veoId = String(data[i][veoCol]).trim();

      if (veoId && !ids.includes(veoId)) {
        ids.push(veoId);
      }
    }
  }

  return ids;
}


function contaVeoRaw_(ss, veoIds) {
  const sheet = ss.getSheetByName('VEO_RAW');

  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return 0;

  const headers = data[0].map(String);
  const col = headers.indexOf('Veo_Match_ID');

  if (col === -1) return 0;

  return data
    .slice(1)
    .filter(row => veoIds.includes(String(row[col]).trim()))
    .length;
}


function eliminaVeoRawPerVeoIds_(ss, veoIds) {
  if (!veoIds || veoIds.length === 0) return 0;

  const sheet = ss.getSheetByName('VEO_RAW');

  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return 0;

  const headers = data[0].map(String);
  const veoIdCol = headers.indexOf('Veo_Match_ID');

  if (veoIdCol === -1) return 0;

  const nuoveRighe = [data[0]];
  let eliminate = 0;

  for (let i = 1; i < data.length; i++) {
    const veoId = String(data[i][veoIdCol]).trim();

    if (veoIds.includes(veoId)) {
      eliminate++;
    } else {
      nuoveRighe.push(data[i]);
    }
  }

  if (eliminate === 0) return 0;

  sheet.clearContents();

  sheet
    .getRange(1, 1, nuoveRighe.length, headers.length)
    .setValues(nuoveRighe);

  return eliminate;
}

function trovaRighePerMatchId_(sheet, matchId) {
  if (!sheet) {
    return {
      count: 0,
      rows: []
    };
  }

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return {
      count: 0,
      rows: []
    };
  }

  const headers = data[0].map(String);
  const matchIdCol = headers.indexOf('Match_ID');

  if (matchIdCol === -1) {
    return {
      count: 0,
      rows: []
    };
  }

  const rows = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][matchIdCol]).trim() === String(matchId).trim()) {
      rows.push(i + 1);
    }
  }

  return {
    count: rows.length,
    rows: rows
  };
}


/*************************************************
 * IMPORT INCREMENTALI / PIPELINE AUTOMATICA
 *************************************************/

function leggiValoriUniciColonna_(ss, sheetName, columnName) {

  const result = new Set();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    return result;
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const index = headers.indexOf(columnName);

  if (index === -1) {
    return result;
  }

  values.slice(1).forEach(row => {
    const value = String(row[index] || '').trim();
    if (value) result.add(value);
  });

  return result;
}


function contaRigheDati_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}


function snapshotImport_(ss) {
  return {
    distinte: contaRigheDati_(ss, 'DISTINTE'),
    youcoach: contaRigheDati_(ss, 'YOUCOACH_STATS'),
    lineups: contaRigheDati_(ss, 'YOUCOACH_LINEUPS'),
    substitutions: contaRigheDati_(ss, 'YOUCOACH_SUBSTITUTIONS'),
    veoMatches: contaRigheDati_(ss, 'VEO_MATCHES'),
    veoRaw: contaRigheDati_(ss, 'VEO_RAW'),
    playerStats: contaRigheDati_(ss, 'PLAYER_STATS'),
    veoReport: contaRigheDati_(ss, 'VEO_REPORT_STATS'),
    veoPositions: contaRigheDati_(ss, 'VEO_POSITION_STATS'),
    veoEvents: contaRigheDati_(ss, 'VEO_EVENT_POSITIONS')
  };
}


function snapshotDiverso_(a, b) {
  return Object.keys(a).some(key => a[key] !== b[key]);
}


function aggiornaSoloNuoviDati() {

  const ss = SpreadsheetApp.getActive();
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    throw new Error(
      'È già in corso un aggiornamento. Riprova quando termina.'
    );
  }

  try {
    const prima = snapshotImport_(ss);

    Logger.log('================================');
    Logger.log('PIPELINE INCREMENTALE VILLANOVESE');
    Logger.log('================================');

    // 1. Fonte ufficiale: distinta, minuti, eventi, lineup, cambi
    importaReportYouCoach();

    // 2. Associazione nuova partita -> Veo
    sincronizzaPartiteVeo();

    // 3. Solo statistiche API delle partite Veo non ancora presenti
    importaTuttePartiteVeo();

    // 4. Solo PLAYER_STATS dei Match_ID non ancora presenti
    creaPlayerStatsDaVeo();

    // 5. Solo report Veo non ancora importati
    importaReportVeoMhtml();
    importaPosizioniMedieVeoMhtml();
    importaEventiPosizioneVeoMhtml();

    const dopoImport = snapshotImport_(ss);
    const ciSonoNovita = snapshotDiverso_(prima, dopoImport);

    if (ciSonoNovita) {
      /*
       * Queste due funzioni sono aggregazioni, non import.
       * Vengono ricalcolate SOLO quando è entrato almeno un dato nuovo,
       * perché una nuova partita modifica anche i totali stagionali.
       */
      creaAnalisiPartite();
      creaAnalisiGiocatori();
    } else {
      Logger.log(
        '⏭️ Nessun nuovo dato: ANALISI_PARTITE e ANALISI_GIOCATORI non ricalcolate.'
      );
    }

    // Il sync incrementale fa solo INSERT/UPSERT realmente necessari.
    sincronizzaSupabaseIncrementale();

    SpreadsheetApp.getActive().toast(
      ciSonoNovita
        ? 'Aggiornamento completato: importati solo i nuovi dati.'
        : 'Nessun nuovo dato da importare.',
      '⚽ Villanovese',
      6
    );

  } finally {
    lock.releaseLock();
  }
}


function sincronizzaSupabaseIncrementale() {

  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SECRET_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Mancano SUPABASE_URL o SUPABASE_SECRET_KEY nelle Proprietà script.'
    );
  }

  const ss = SpreadsheetApp.getActive();

  const distinteSheet = ss.getSheetByName('DISTINTE');
  const analisiSheet = ss.getSheetByName('ANALISI_PARTITE');

  if (!distinteSheet || !analisiSheet) {
    throw new Error(
      'Mancano i fogli DISTINTE o ANALISI_PARTITE.'
    );
  }

  const distinte = sheetToObjects(distinteSheet);
  const analisi = sheetToObjects(analisiSheet);

  // ==========================================
  // PLAYERS - solo mancanti
  // ==========================================

  const playersMap = {};

  distinte.forEach(row => {
    const playerId = String(row.Player_ID || '').trim();
    const nome = String(row.Giocatore || '').trim();
    if (playerId && nome) {
      playersMap[playerId] = {
        player_id: playerId,
        nome: nome
      };
    }
  });

  const remotePlayers = supabaseGet_(
    supabaseUrl,
    supabaseKey,
    'players?select=player_id'
  );

  const remotePlayerIds = new Set(
    remotePlayers.map(row => String(row.player_id || '').trim())
  );

  const nuoviPlayers = Object.values(playersMap)
    .filter(row => !remotePlayerIds.has(row.player_id));

  if (nuoviPlayers.length) {
    supabaseInsert_(
      supabaseUrl,
      supabaseKey,
      'players',
      nuoviPlayers
    );
  }

  // ==========================================
  // MATCHES - solo mancanti
  // ==========================================

  const matchesMap = {};

  analisi.forEach(row => {
    const matchId = String(row.Match_ID || '').trim();
    if (!matchId) return;

    let data = row.Data;

    if (data instanceof Date) {
      data = Utilities.formatDate(
        data,
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );
    } else if (data) {
      data = String(data).substring(0, 10);
    }

    matchesMap[matchId] = {
      match_id: matchId,
      data: data || null,
      partita: String(row.Partita || '').trim(),
      competizione: String(row.Competizione || '').trim()
    };
  });

  const remoteMatches = supabaseGet_(
    supabaseUrl,
    supabaseKey,
    'matches?select=match_id'
  );

  const remoteMatchIds = new Set(
    remoteMatches.map(row => String(row.match_id || '').trim())
  );

  const nuoviMatches = Object.values(matchesMap)
    .filter(row => !remoteMatchIds.has(row.match_id));

  if (nuoviMatches.length) {
    supabaseInsert_(
      supabaseUrl,
      supabaseKey,
      'matches',
      nuoviMatches
    );
  }

  // ==========================================
  // PLAYER_MATCH_STATS - chiave match+player
  // ==========================================

  const localStats = analisi
    .filter(row => row.Match_ID && row.Player_ID)
    .map(row => ({
      match_id: String(row.Match_ID).trim(),
      player_id: String(row.Player_ID).trim(),
      minuti: Number(row.Minuti || 0),
      gol: Number(row.Gol || 0),
      gol_per_90: Number(row.Gol_per_90 || 0),
      tiri: Number(row.Tiri || 0),
      tiri_per_90: Number(row.Tiri_per_90 || 0),
      passaggi: Number(row.Passaggi || 0),
      passaggi_completati: Number(row.Passaggi_Completati || 0),
      passaggi_percento: Number(row['Passaggi_%'] || 0),
      distanza_km: Number(row.Distanza_km || 0),
      distanza_km_per_90: Number(row.Distanza_km_per_90 || 0),
      sprint: Number(row.Sprint || 0),
      sprint_per_90: Number(row.Sprint_per_90 || 0),
      corse_alta_intensita: Number(row.Corse_Alta_Intensita || 0),
      corse_alta_intensita_per_90: Number(row.Corse_Alta_Intensita_per_90 || 0),
      velocita_max_kmh: Number(row.Velocita_Max_kmh || 0),
      velocita_media_kmh: Number(row.Velocita_Media_kmh || 0),
      assist: Number(row.Assist || 0),
      ammonizioni: Number(row.Ammonizioni || 0),
      espulsioni: Number(row.Espulsioni || 0),
      tiri_totali: Number(row.Tiri_Totali || 0),
      tiri_totali_per_90: Number(row.Tiri_Totali_per_90 || 0),
      contrasti: Number(row.Contrasti || 0),
      contrasti_per_90: Number(row.Contrasti_per_90 || 0),
      falli: Number(row.Falli || 0),
      falli_per_90: Number(row.Falli_per_90 || 0),
      coinvolgimenti_gol: Number(row.Coinvolgimenti_Gol || 0),
      coinvolgimenti_gol_per_90: Number(row.Coinvolgimenti_Gol_per_90 || 0)
    }));

  const remoteStats = supabaseGet_(
    supabaseUrl,
    supabaseKey,
    'player_match_stats?select=match_id,player_id'
  );

  const remoteStatsKeys = new Set(
    remoteStats.map(row =>
      String(row.match_id || '').trim() + '|' +
      String(row.player_id || '').trim()
    )
  );

  const nuoveStats = localStats.filter(row =>
    !remoteStatsKeys.has(row.match_id + '|' + row.player_id)
  );

  if (nuoveStats.length) {
    supabaseInsert_(
      supabaseUrl,
      supabaseKey,
      'player_match_stats',
      nuoveStats
    );
  }

  // ==========================================
  // PLAYER_SEASON_STATS
  //
  // È l'unica eccezione: se entra una nuova statistica
  // partita, i totali stagionali cambiano e devono essere
  // aggiornati. Se non entra nulla, non viene toccata.
  // ==========================================

  if (nuoveStats.length) {
    const seasonSheet = ss.getSheetByName('ANALISI_GIOCATORI');

    if (seasonSheet) {
      const season = sheetToObjects(seasonSheet)
        .filter(row => row.Player_ID && row.Giocatore)
        .map(row => ({
          player_id: String(row.Player_ID).trim(),
          presenze: Number(row.Presenze || 0),
          minuti: Number(row.Minuti || 0),
          gol: Number(row.Gol || 0),
          gol_per_90: Number(row.Gol_per_90 || 0),
          assist: Number(row.Assist || 0),
          assist_per_90: Number(row.Assist_per_90 || 0),
          ammonizioni: Number(row.Ammonizioni || 0),
          espulsioni: Number(row.Espulsioni || 0),
          tiri: Number(row.Tiri || 0),
          tiri_per_90: Number(row.Tiri_per_90 || 0),
          tiri_totali: Number(row.Tiri_Totali || 0),
          tiri_totali_per_90: Number(row.Tiri_Totali_per_90 || 0),
          passaggi: Number(row.Passaggi || 0),
          passaggi_per_90: Number(row.Passaggi_per_90 || 0),
          passaggi_completati: Number(row.Passaggi_Completati || 0),
          passaggi_completati_per_90: Number(row.Passaggi_Completati_per_90 || 0),
          passaggi_percento: Number(row['Passaggi_%'] || 0),
          distanza_km: Number(row.Distanza_km || 0),
          distanza_km_per_90: Number(row.Distanza_km_per_90 || 0),
          sprint: Number(row.Sprint || 0),
          sprint_per_90: Number(row.Sprint_per_90 || 0),
          corse_alta_intensita: Number(row.Corse_Alta_Intensita || 0),
          corse_alta_intensita_per_90: Number(row.Corse_Alta_Intensita_per_90 || 0),
          velocita_max_kmh: Number(row.Velocita_Max_kmh || 0),
          velocita_media_kmh: Number(row.Velocita_Media_kmh || 0),
          contrasti: Number(row.Contrasti || 0),
          contrasti_per_90: Number(row.Contrasti_per_90 || 0),
          falli: Number(row.Falli || 0),
          falli_per_90: Number(row.Falli_per_90 || 0),
          coinvolgimenti_gol: Number(row.Coinvolgimenti_Gol || 0),
          coinvolgimenti_gol_per_90: Number(row.Coinvolgimenti_Gol_per_90 || 0),
          minuti_per_presenza: Number(row.Minuti_per_Presenza || 0),
          sprint_per_km: Number(row.Sprint_per_km || 0),
          corse_alta_intensita_per_km: Number(row.Corse_Alta_Intensita_per_km || 0),
          gol_per_tiro: Number(row.Gol_per_Tiro || 0),
          minuti_per_gol: Number(row.Minuti_per_Gol || 0),
          minuti_per_assist: Number(row.Minuti_per_Assist || 0),
          minuti_per_tiro: Number(row.Minuti_per_Tiro || 0)
        }));

      if (season.length) {
        supabaseUpsert_(
          supabaseUrl,
          supabaseKey,
          'player_season_stats',
          season,
          'player_id'
        );
      }
    }
  }

  // ==========================================
  // VEO_POSITION_STATS - chiave match+numero
  // ==========================================

  let nuovePosizioni = [];
  const positionSheet = ss.getSheetByName('VEO_POSITION_STATS');

  if (positionSheet) {
    const localPositions = sheetToObjects(positionSheet)
      .filter(row => row.Match_ID && row.Numero)
      .map(row => ({
        match_id: String(row.Match_ID).trim(),
        numero: Number(row.Numero),
        player_id: row.Player_ID ? String(row.Player_ID).trim() : null,
        x_media_pct: Number(row.X_Media_Pct || 0),
        y_media_pct: Number(row.Y_Media_Pct || 0),
        zona_orizzontale: String(row.Zona_Orizzontale || '').trim(),
        zona_verticale: String(row.Zona_Verticale || '').trim(),
        fonte: String(row.Fonte || 'VEO_REPORT').trim()
      }));

    const remotePositions = supabaseGet_(
      supabaseUrl,
      supabaseKey,
      'veo_position_stats?select=match_id,numero'
    );

    const remotePositionKeys = new Set(
      remotePositions.map(row =>
        String(row.match_id || '').trim() + '|' +
        String(row.numero || '').trim()
      )
    );

    nuovePosizioni = localPositions.filter(row =>
      !remotePositionKeys.has(row.match_id + '|' + row.numero)
    );

    if (nuovePosizioni.length) {
      supabaseInsert_(
        supabaseUrl,
        supabaseKey,
        'veo_position_stats',
        nuovePosizioni
      );
    }
  }

  // ==========================================
  // VEO_EVENT_POSITIONS - chiave evento completa
  // ==========================================

  let nuoviEventi = [];
  const eventSheet = ss.getSheetByName('VEO_EVENT_POSITIONS');

  if (eventSheet) {
    const localEvents = sheetToObjects(eventSheet)
      .filter(row => row.Match_ID && row.Tipo_Evento)
      .map(row => ({
        match_id: String(row.Match_ID).trim(),
        player_id: row.Player_ID ? String(row.Player_ID).trim() : null,
        numero: Number(row.Numero || 0),
        tipo_evento: String(row.Tipo_Evento || '').trim(),
        minuto: Number(row.Minuto || 0),
        x_pct: Number(row.X_Pct || 0),
        y_pct: Number(row.Y_Pct || 0),
        zona_orizzontale: String(row.Zona_Orizzontale || '').trim(),
        zona_verticale: String(row.Zona_Verticale || '').trim(),
        fonte: String(row.Fonte || 'VEO_REPORT').trim()
      }));

    const remoteEvents = supabaseGet_(
      supabaseUrl,
      supabaseKey,
      'veo_event_positions?select=match_id,numero,tipo_evento,minuto,x_pct,y_pct'
    );

    const eventKey = row => [
      String(row.match_id || '').trim(),
      String(row.numero || ''),
      String(row.tipo_evento || '').trim(),
      String(row.minuto || ''),
      String(row.x_pct || ''),
      String(row.y_pct || '')
    ].join('|');

    const remoteEventKeys = new Set(remoteEvents.map(eventKey));
    nuoviEventi = localEvents.filter(row => !remoteEventKeys.has(eventKey(row)));

    if (nuoviEventi.length) {
      supabaseInsert_(
        supabaseUrl,
        supabaseKey,
        'veo_event_positions',
        nuoviEventi
      );
    }
  }

  // ==========================================
  // MATCH_LINEUPS - chiave match+player
  // ==========================================

  let nuoveLineups = [];
  const lineupSheet = ss.getSheetByName('YOUCOACH_LINEUPS');

  if (lineupSheet) {
    const localLineups = sheetToObjects(lineupSheet)
      .filter(row => row.Match_ID && row.Player_ID)
      .map(row => ({
        match_id: String(row.Match_ID).trim(),
        player_id: String(row.Player_ID).trim(),
        numero: youCoachNullForSupabase_(row.Numero),
        titolare: row.Titolare === true || String(row.Titolare).toLowerCase() === 'true',
        ordine: youCoachNullForSupabase_(row.Ordine)
      }));

    const remoteLineups = supabaseGet_(
      supabaseUrl,
      supabaseKey,
      'match_lineups?select=match_id,player_id'
    );

    const remoteLineupKeys = new Set(
      remoteLineups.map(row =>
        String(row.match_id || '').trim() + '|' +
        String(row.player_id || '').trim()
      )
    );

    nuoveLineups = localLineups.filter(row =>
      !remoteLineupKeys.has(row.match_id + '|' + row.player_id)
    );

    if (nuoveLineups.length) {
      supabaseInsert_(
        supabaseUrl,
        supabaseKey,
        'match_lineups',
        nuoveLineups
      );
    }
  }

  // ==========================================
  // MATCH_SUBSTITUTIONS - chiave logica
  // ==========================================

  let nuoveSostituzioni = [];
  const substitutionsSheet = ss.getSheetByName('YOUCOACH_SUBSTITUTIONS');

  if (substitutionsSheet) {
    const localSubs = sheetToObjects(substitutionsSheet)
      .filter(row => row.Match_ID && row.Player_Out_ID && row.Player_In_ID)
      .map(row => ({
        match_id: String(row.Match_ID).trim(),
        minuto: Number(row.Minuto || 0),
        recupero: row.Recupero === true || String(row.Recupero).toLowerCase() === 'true',
        player_out_id: String(row.Player_Out_ID).trim(),
        player_in_id: String(row.Player_In_ID).trim()
      }));

    const remoteSubs = supabaseGet_(
      supabaseUrl,
      supabaseKey,
      'match_substitutions?select=match_id,minuto,player_out_id,player_in_id'
    );

    const subKey = row => [
      String(row.match_id || '').trim(),
      String(row.minuto || ''),
      String(row.player_out_id || '').trim(),
      String(row.player_in_id || '').trim()
    ].join('|');

    const remoteSubKeys = new Set(remoteSubs.map(subKey));
    nuoveSostituzioni = localSubs.filter(row => !remoteSubKeys.has(subKey(row)));

    if (nuoveSostituzioni.length) {
      supabaseInsert_(
        supabaseUrl,
        supabaseKey,
        'match_substitutions',
        nuoveSostituzioni
      );
    }
  }

  Logger.log('================================');
  Logger.log('SUPABASE INCREMENTALE OK');
  Logger.log('Nuovi players: ' + nuoviPlayers.length);
  Logger.log('Nuovi matches: ' + nuoviMatches.length);
  Logger.log('Nuove stats partita: ' + nuoveStats.length);
  Logger.log('Nuove posizioni: ' + nuovePosizioni.length);
  Logger.log('Nuovi eventi: ' + nuoviEventi.length);
  Logger.log('Nuove lineup: ' + nuoveLineups.length);
  Logger.log('Nuove sostituzioni: ' + nuoveSostituzioni.length);
  Logger.log('================================');

  SpreadsheetApp.getActive().toast(
    'Supabase: ' +
    nuoviMatches.length + ' nuovi match, ' +
    nuoveStats.length + ' nuove stats, ' +
    nuoveLineups.length + ' lineup, ' +
    nuoveSostituzioni.length + ' cambi.',
    '⚽ Villanovese',
    5
  );
}


/*************************************************
 * SUPABASE SYNC
 * Google Sheets → Supabase
 *************************************************/

function sincronizzaSupabase() {
  const props = PropertiesService.getScriptProperties();

  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_SECRET_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Mancano SUPABASE_URL o SUPABASE_SECRET_KEY nelle Proprietà script.'
    );
  }

  const ss = SpreadsheetApp.getActive();

  const distinteSheet = ss.getSheetByName('DISTINTE');
  const analisiSheet = ss.getSheetByName('ANALISI_PARTITE');
  const veoPositionSheet =
    ss.getSheetByName('VEO_POSITION_STATS');

  const veoEventSheet =
    ss.getSheetByName('VEO_EVENT_POSITIONS');

  if (!distinteSheet || !analisiSheet) {
    throw new Error(
      'Mancano i fogli DISTINTE o ANALISI_PARTITE.'
    );
  }

  /*************************************************
   * 1. PLAYERS
   * Fonte: DISTINTE
   *************************************************/

  const distinte = sheetToObjects(distinteSheet);

  const playersMap = {};

  distinte.forEach(row => {
    const playerId = String(row.Player_ID || '').trim();
    const nome = String(row.Giocatore || '').trim();

    if (playerId && nome) {
      playersMap[playerId] = {
        player_id: playerId,
        nome: nome
      };
    }
  });

  const players = Object.values(playersMap);

  Logger.log(`Players da sincronizzare: ${players.length}`);

  if (players.length > 0) {
    supabaseUpsert_(
      supabaseUrl,
      supabaseKey,
      'players',
      players,
      'player_id'
    );
  }

  /*************************************************
   * 2. MATCHES
   * Fonte: ANALISI_PARTITE
   *************************************************/

  const analisi = sheetToObjects(analisiSheet);

  const matchesMap = {};

  analisi.forEach(row => {
    const matchId = String(row.Match_ID || '').trim();

    if (!matchId) return;

    let data = row.Data;

    if (data instanceof Date) {
      data = Utilities.formatDate(
        data,
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );
    } else if (data) {
      data = String(data).substring(0, 10);
    }

    matchesMap[matchId] = {
      match_id: matchId,
      data: data || null,
      partita: String(row.Partita || '').trim(),
      competizione: String(row.Competizione || '').trim()
    };
  });

  const matches = Object.values(matchesMap);

  Logger.log(`Matches da sincronizzare: ${matches.length}`);

  if (matches.length > 0) {
    supabaseUpsert_(
      supabaseUrl,
      supabaseKey,
      'matches',
      matches,
      'match_id'
    );
  }

  /*************************************************
   * 2B. YOUCOACH LINEUPS + SOSTITUZIONI
   * Fonte: YOUCOACH_LINEUPS / YOUCOACH_SUBSTITUTIONS
   *************************************************/

  const youCoachSync =
    sincronizzaYouCoachLineupsESostituzioniSupabase_(
      supabaseUrl,
      supabaseKey,
      new Set(matches.map(match => match.match_id))
    );

  /*************************************************
   * 3. PLAYER MATCH STATS
   * Fonte: ANALISI_PARTITE
   *************************************************/

  const stats = analisi
    .filter(row =>
      row.Match_ID &&
      row.Player_ID
    )
    .map(row => ({
      match_id: String(row.Match_ID).trim(),
      player_id: String(row.Player_ID).trim(),

      minuti: Number(row.Minuti || 0),
      gol: Number(row.Gol || 0),
      gol_per_90: Number(row.Gol_per_90 || 0),

      tiri: Number(row.Tiri || 0),
      tiri_per_90: Number(row.Tiri_per_90 || 0),

      passaggi: Number(row.Passaggi || 0),
      passaggi_completati: Number(row.Passaggi_Completati || 0),
      passaggi_percento: Number(row["Passaggi_%"] || 0),

      distanza_km: Number(row.Distanza_km || 0),
      distanza_km_per_90: Number(row.Distanza_km_per_90 || 0),

      sprint: Number(row.Sprint || 0),
      sprint_per_90: Number(row.Sprint_per_90 || 0),

      corse_alta_intensita: Number(row.Corse_Alta_Intensita || 0),
      corse_alta_intensita_per_90:
        Number(row.Corse_Alta_Intensita_per_90 || 0),

        velocita_max_kmh: Number(row.Velocita_Max_kmh || 0),
        velocita_media_kmh: Number(row.Velocita_Media_kmh || 0),

        assist: Number(row.Assist || 0),
        ammonizioni: Number(row.Ammonizioni || 0),
        espulsioni: Number(row.Espulsioni || 0),
        tiri_totali:
          Number(row.Tiri_Totali || 0),

        tiri_totali_per_90:
          Number(row.Tiri_Totali_per_90 || 0),

        contrasti:
          Number(row.Contrasti || 0),

        contrasti_per_90:
          Number(row.Contrasti_per_90 || 0),

        falli:
          Number(row.Falli || 0),

        falli_per_90:
          Number(row.Falli_per_90 || 0),

        coinvolgimenti_gol:
          Number(row.Coinvolgimenti_Gol || 0),

        coinvolgimenti_gol_per_90:
          Number(row.Coinvolgimenti_Gol_per_90 || 0),
    }));

  Logger.log(`Statistiche da sincronizzare: ${stats.length}`);

  /*************************************************
   * 3A. PULIZIA STATISTICHE PER MATCH
   *
   * Prima eliminiamo le statistiche del match
   * e poi le reinseriamo.
   *
   * Questo evita dati vecchi se cambia una distinta.
   *************************************************/

  const matchIds = [...new Set(
    stats.map(row => row.match_id)
  )];

  matchIds.forEach(matchId => {
    supabaseDelete_(
      supabaseUrl,
      supabaseKey,
      'player_match_stats',
      `match_id=eq.${encodeURIComponent(matchId)}`
    );
  });

  /*************************************************
   * 3B. INSERIMENTO STATISTICHE
   *************************************************/

  if (stats.length > 0) {
    supabaseInsert_(
      supabaseUrl,
      supabaseKey,
      'player_match_stats',
      stats
    );
  }

    /*************************************************
   * 3C. PLAYER SEASON STATS
   * Fonte: ANALISI_GIOCATORI
   *************************************************/

  const analisiGiocatoriSheet =
    ss.getSheetByName('ANALISI_GIOCATORI');

  if (!analisiGiocatoriSheet) {
    throw new Error(
      'Foglio ANALISI_GIOCATORI non trovato.'
    );
  }

  const analisiGiocatori =
    sheetToObjects(analisiGiocatoriSheet);

  const seasonStats = analisiGiocatori
    .filter(row =>
      row.Player_ID &&
      row.Giocatore
    )
    .map(row => ({
      player_id: String(row.Player_ID).trim(),

      presenze: Number(row.Presenze || 0),
      minuti: Number(row.Minuti || 0),

      gol: Number(row.Gol || 0),
      gol_per_90: Number(row.Gol_per_90 || 0),

      tiri: Number(row.Tiri || 0),
      tiri_per_90: Number(row.Tiri_per_90 || 0),

      passaggi: Number(row.Passaggi || 0),
      passaggi_per_90:
        Number(row.Passaggi_per_90 || 0),

      passaggi_completati:
        Number(row.Passaggi_Completati || 0),

      passaggi_completati_per_90:
        Number(row.Passaggi_Completati_per_90 || 0),

      passaggi_percento:
        Number(row["Passaggi_%"] || 0),

      distanza_km:
        Number(row.Distanza_km || 0),

      distanza_km_per_90:
        Number(row.Distanza_km_per_90 || 0),

      sprint:
        Number(row.Sprint || 0),

      sprint_per_90:
        Number(row.Sprint_per_90 || 0),

      corse_alta_intensita:
        Number(row.Corse_Alta_Intensita || 0),

      corse_alta_intensita_per_90:
        Number(
          row.Corse_Alta_Intensita_per_90 || 0
        ),

      velocita_max_kmh:
        Number(row.Velocita_Max_kmh || 0),

      velocita_media_kmh:
        Number(row.Velocita_Media_kmh || 0),

      minuti_per_presenza:
        Number(row.Minuti_per_Presenza || 0),

      sprint_per_km:
        Number(row.Sprint_per_km || 0),

      corse_alta_intensita_per_km:
        Number(
          row.Corse_Alta_Intensita_per_km || 0
        ),

      gol_per_tiro:
        Number(row.Gol_per_Tiro || 0),

      minuti_per_gol:
        Number(row.Minuti_per_Gol || 0),

      minuti_per_tiro:
        Number(row.Minuti_per_Tiro || 0),

      assist:
        Number(row.Assist || 0),

      assist_per_90:
        Number(row.Assist_per_90 || 0),

      ammonizioni:
        Number(row.Ammonizioni || 0),

      espulsioni:
        Number(row.Espulsioni || 0),

      minuti_per_assist:
        Number(row.Minuti_per_Assist || 0),
      
      tiri_totali:
        Number(row.Tiri_Totali || 0),

      tiri_totali_per_90:
        Number(row.Tiri_Totali_per_90 || 0),

      contrasti:
        Number(row.Contrasti || 0),

      contrasti_per_90:
        Number(row.Contrasti_per_90 || 0),

      falli:
        Number(row.Falli || 0),

      falli_per_90:
        Number(row.Falli_per_90 || 0),

      coinvolgimenti_gol:
        Number(row.Coinvolgimenti_Gol || 0),

      coinvolgimenti_gol_per_90:
        Number(row.Coinvolgimenti_Gol_per_90 || 0), 
    }));

  Logger.log(
    `Statistiche stagionali da sincronizzare: ${seasonStats.length}`
  );

  if (seasonStats.length > 0) {
    supabaseUpsert_(
      supabaseUrl,
      supabaseKey,
      'player_season_stats',
      seasonStats,
      'player_id'
    );
  }

/*************************************************
 * VEO POSITION STATS
 *
 * Fonte: VEO_POSITION_STATS
 *
 * La posizione Veo è identificata da:
 * Match_ID + Numero maglia
 *
 * Player_ID è opzionale perché Veo può rilevare
 * correttamente una maglia anche quando non riusciamo
 * ad associarla alla distinta.
 *************************************************/

if (veoPositionSheet) {

  const positionData =
    sheetToObjects(
      veoPositionSheet
    );


  // ==========================================
  // PREPARAZIONE POSIZIONI
  // ==========================================

  const positions =
    positionData

      // La chiave reale del dato Veo è:
      // Match_ID + Numero
      .filter(row =>
        row.Match_ID &&
        row.Numero
      )

      .map(row => ({

        // ======================================
        // IDENTIFICAZIONE
        // ======================================

        match_id:
          String(
            row.Match_ID
          ).trim(),


        numero:
          Number(
            row.Numero || 0
          ),


        // Player_ID NON è più obbligatorio
        player_id:
          row.Player_ID
            ? String(
                row.Player_ID
              ).trim()
            : null,


        // ======================================
        // COORDINATE
        // ======================================

        x_media_pct:
          Number(
            row.X_Media_Pct || 0
          ),


        y_media_pct:
          Number(
            row.Y_Media_Pct || 0
          ),


        // ======================================
        // ZONE
        // ======================================

        zona_orizzontale:
          String(
            row.Zona_Orizzontale || ''
          ).trim(),


        zona_verticale:
          String(
            row.Zona_Verticale || ''
          ).trim(),


        // ======================================
        // FONTE
        // ======================================

        fonte:
          String(
            row.Fonte || 'VEO_REPORT'
          ).trim()

      }));


  Logger.log(
    'Posizioni Veo da sincronizzare: ' +
    positions.length
  );


  // ==========================================
  // LOG DI CONTROLLO
  // ==========================================

  const senzaPlayerId =
    positions.filter(
      row =>
        !row.player_id
    );


  Logger.log(
    'Posizioni senza Player_ID: ' +
    senzaPlayerId.length
  );


  senzaPlayerId.forEach(row => {

    Logger.log(
      '⚠️ Posizione Veo non associata → ' +
      'Match: ' +
      row.match_id +
      ' | Maglia: #' +
      row.numero
    );

  });


  // ==========================================
  // MATCH DA AGGIORNARE
  // ==========================================

  const positionMatchIds =
    [
      ...new Set(
        positions.map(
          row =>
            row.match_id
        )
      )
    ];


  // ==========================================
  // CANCELLA POSIZIONI PRECEDENTI
  //
  // Per ogni partita presente nel foglio
  // eliminiamo le vecchie posizioni e
  // reinseriamo quelle aggiornate.
  // ==========================================

  positionMatchIds.forEach(
    matchId => {

      supabaseDelete_(

        supabaseUrl,

        supabaseKey,

        'veo_position_stats',

        `match_id=eq.${encodeURIComponent(
          matchId
        )}`

      );

    }
  );


  // ==========================================
  // INSERIMENTO NUOVE POSIZIONI
  // ==========================================

  if (
    positions.length > 0
  ) {

    supabaseInsert_(

      supabaseUrl,

      supabaseKey,

      'veo_position_stats',

      positions

    );

  }


  Logger.log(
    '✅ VEO_POSITION_STATS sincronizzato'
  );

}
/*************************************************
 * VEO EVENT POSITIONS
 *************************************************/

if (veoEventSheet) {

  const eventData =
    sheetToObjects(veoEventSheet);

  const events =
    eventData
      .filter(row =>
        row.Match_ID &&
        row.Tipo_Evento
      )
      .map(row => ({

        match_id:
          String(row.Match_ID).trim(),

        player_id:
          row.Player_ID
            ? String(row.Player_ID).trim()
            : null,

        numero:
          Number(row.Numero || 0),

        tipo_evento:
          String(
            row.Tipo_Evento || ''
          ).trim(),

        minuto:
          Number(row.Minuto || 0),

        x_pct:
          Number(row.X_Pct || 0),

        y_pct:
          Number(row.Y_Pct || 0),

        zona_orizzontale:
          String(
            row.Zona_Orizzontale || ''
          ).trim(),

        zona_verticale:
          String(
            row.Zona_Verticale || ''
          ).trim(),

        fonte:
          String(
            row.Fonte || 'VEO_REPORT'
          ).trim()

      }));


  Logger.log(
    `Eventi Veo da sincronizzare: ${events.length}`
  );


  const eventMatchIds =
    [...new Set(
      events.map(
        row => row.match_id
      )
    )];


  eventMatchIds.forEach(matchId => {

    supabaseDelete_(
      supabaseUrl,
      supabaseKey,
      'veo_event_positions',
      `match_id=eq.${encodeURIComponent(matchId)}`
    );

  });


  if (events.length > 0) {

    supabaseInsert_(
      supabaseUrl,
      supabaseKey,
      'veo_event_positions',
      events
    );

  }

}

  /*************************************************
   * 4. RIMOZIONE MATCH NON PIÙ PRESENTI
   *************************************************/

  const supabaseMatches = supabaseGet_(
    supabaseUrl,
    supabaseKey,
    'matches?select=match_id'
  );

  const currentMatchIds = new Set(
    matches.map(match => match.match_id)
  );

  const oldMatches = supabaseMatches.filter(row =>
    !currentMatchIds.has(String(row.match_id))
  );

  Logger.log(
    `Matches da eliminare da Supabase: ${oldMatches.length}`
  );

  oldMatches.forEach(row => {
    const matchId = String(row.match_id);

    supabaseDelete_(
      supabaseUrl,
      supabaseKey,
      'matches',
      `match_id=eq.${encodeURIComponent(matchId)}`
    );
  });

  Logger.log('================================');
  Logger.log('================================');
  Logger.log('SINCRONIZZAZIONE SUPABASE OK');
  Logger.log(`Players: ${players.length}`);
  Logger.log(`Matches: ${matches.length}`);
  Logger.log(`Stats partita: ${stats.length}`);
  Logger.log(`Stats stagionali: ${seasonStats.length}`);
  Logger.log(`Lineup YouCoach: ${youCoachSync.lineups}`);
  Logger.log(`Sostituzioni YouCoach: ${youCoachSync.substitutions}`);
  Logger.log(`Matches eliminati: ${oldMatches.length}`);
  Logger.log('================================');
  Logger.log('================================');

  SpreadsheetApp.getActive().toast(
    `Supabase sincronizzato: ${players.length} giocatori, ${matches.length} partite, ${stats.length} statistiche partita, ${youCoachSync.lineups} lineup, ${youCoachSync.substitutions} sostituzioni.`,
    '⚽ Villanovese',
    5
  );
}


/*************************************************
 * SUPABASE UPSERT
 *************************************************/

function supabaseUpsert_(
  baseUrl,
  apiKey,
  table,
  rows,
  conflictColumn
) {
  const url =
    `${baseUrl}/rest/v1/${table}` +
    `?on_conflict=${encodeURIComponent(conflictColumn)}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': apiKey,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      `Supabase UPSERT ${table} fallito (${code}): ${body}`
    );
  }
}


/*************************************************
 * SUPABASE INSERT
 *************************************************/

function supabaseInsert_(
  baseUrl,
  apiKey,
  table,
  rows
) {
  const url = `${baseUrl}/rest/v1/${table}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': apiKey,
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      `Supabase INSERT ${table} fallito (${code}): ${body}`
    );
  }
}


/*************************************************
 * SUPABASE GET
 *************************************************/

function supabaseGet_(
  baseUrl,
  apiKey,
  endpoint
) {
  const url = `${baseUrl}/rest/v1/${endpoint}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'apikey': apiKey
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      `Supabase GET fallito (${code}): ${body}`
    );
  }

  return JSON.parse(body);
}


/*************************************************
 * SUPABASE DELETE
 *************************************************/

function supabaseDelete_(
  baseUrl,
  apiKey,
  table,
  filter
) {
  const url =
    `${baseUrl}/rest/v1/${table}?${filter}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: {
      'apikey': apiKey,
      'Prefer': 'return=minimal'
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      `Supabase DELETE ${table} fallito (${code}): ${body}`
    );
  }
}
function importaReportYouCoach() {

  const ss = SpreadsheetApp.getActive();

  const folderId = PropertiesService
    .getScriptProperties()
    .getProperty('YOUCOACH_FOLDER_ID');

  if (!folderId) {

    throw new Error(
      'YOUCOACH_FOLDER_ID non configurato nelle Proprietà script.'
    );

  }


  const distinteSheet =
    ss.getSheetByName('DISTINTE');

  const statsSheet =
    ss.getSheetByName('YOUCOACH_STATS');


  if (!distinteSheet) {
    throw new Error(
      'Foglio DISTINTE non trovato.'
    );
  }


  if (!statsSheet) {
    throw new Error(
      'Foglio YOUCOACH_STATS non trovato.'
    );
  }


  const playerMap =
    creaMappaGiocatoriYouCoach_(ss);


  const folder =
    DriveApp.getFolderById(folderId);

  const files =
    folder.getFiles();


  let importate = 0;
  let saltate = 0;

  const matchStatsEsistenti =
    leggiValoriUniciColonna_(
      ss,
      'YOUCOACH_STATS',
      'Match_ID'
    );

  const matchLineupsEsistenti =
    leggiValoriUniciColonna_(
      ss,
      'YOUCOACH_LINEUPS',
      'Match_ID'
    );


  while (files.hasNext()) {

    const file =
      files.next();


    if (
      !file
        .getName()
        .toLowerCase()
        .endsWith('.mhtml')
    ) {
      continue;
    }


    Logger.log('');

    Logger.log(
      '=============================='
    );

    Logger.log(
      'FILE: ' + file.getName()
    );

    Logger.log(
      '=============================='
    );


    try {

      // ==========================================
      // LETTURA FILE
      // ==========================================

      const raw =
        file
          .getBlob()
          .getDataAsString('UTF-8');


      const html =
        raw.replace(
          /=\r?\n/g,
          ''
        );


      // ==========================================
      // PARSER REPORT
      // ==========================================

      const info =
        parseYouCoachMhtml_(html);


      if (!info.data) {

        throw new Error(
          'Data partita non trovata nel report.'
        );

      }


      if (!info.partita) {

        throw new Error(
          'Nome partita non trovato nel report.'
        );

      }


      const dataPartita =
        normalizzaDataYouCoach_(
          info.data
        );


      // ==========================================
      // COMPETIZIONE
      // ==========================================

      const competizione =
        String(
          info.competizione || ''
        ).trim();


      Logger.log(
        'Competizione YouCoach: [' +
        competizione +
        ']'
      );


      // ==========================================
      // MATCH_ID
      // ==========================================

      let matchId =
        trovaMatchIdPerData_(
          distinteSheet,
          dataPartita
        );


      /*
       * Se la partita non esiste ancora in DISTINTE,
       * generiamo un Match_ID interno stabile.
       *
       * NON usiamo il numero della distinta FIGC:
       * il nostro Match_ID è un identificatore interno.
       */

      if (!matchId) {

        matchId =
          generaMatchIdYouCoach_(
            dataPartita,
            info.partita
          );


        Logger.log(
          'Nuova partita → Match_ID: ' +
          matchId
        );

      } else {

        Logger.log(
          'Partita già presente → Match_ID: ' +
          matchId
        );

      }


      // ==========================================
      // GIÀ COMPLETAMENTE IMPORTATA → SALTA
      //
      // YOUCOACH_SUBSTITUTIONS può essere vuoto per
      // una gara senza cambi, quindi non viene usato
      // come criterio di completezza.
      // ==========================================

      if (
        matchStatsEsistenti.has(matchId) &&
        matchLineupsEsistenti.has(matchId)
      ) {

        Logger.log(
          '⏭️ YouCoach già importato: ' +
          matchId +
          ' | ' +
          info.partita
        );

        saltate++;
        continue;

      }


      // ==========================================
      // ROSA COMPLETA
      // ==========================================

      const rosa = [

        ...info.titolari,

        ...info.riserve

      ];


      if (rosa.length === 0) {

        throw new Error(
          'Nessun giocatore trovato nel report.'
        );

      }


      const giocatori = [];

      const nonRiconosciuti = [];


      rosa.forEach(p => {

        const key =
          normalizzaNomeYouCoach_(
            p.nome
          );


        const player =
          playerMap[key];


        if (!player) {

          nonRiconosciuti.push(
            p.numero +
            ' - ' +
            p.nome
          );

          return;

        }


        giocatori.push({

          numero:
            p.numero,

          nomeYouCoach:
            p.nome,

          playerId:
            player.playerId,

          nomeDatabase:
            player.nome,

          titolare:
            info.titolari.some(
              t =>
                t.youcoachId ===
                p.youcoachId
            )

        });

      });


      // ==========================================
      // BLOCCO SICUREZZA
      // ==========================================

      if (
        nonRiconosciuti.length > 0
      ) {

        throw new Error(
          'Giocatori non riconosciuti:\n' +
          nonRiconosciuti.join('\n')
        );

      }


      // ==========================================
      // STATISTICHE BASE
      // ==========================================

      const stats = {};


      giocatori.forEach(p => {

        stats[p.playerId] = {

          playerId:
            p.playerId,

          giocatore:
            p.nomeDatabase,

          /*
           * titolare = parte da 90
           * riserva = parte da 0
           */

          minuti:
            p.titolare
              ? 90
              : 0,

          gol: 0,

          assist: 0,

          ammonizioni: 0,

          espulsioni: 0

        };

      });


      // ==========================================
      // EVENTI
      // ==========================================

      info.eventi.forEach(e => {

        const tipo =
          String(
            e.tipo || ''
          ).toLowerCase();


        const nome1 =
          normalizzaNomeYouCoach_(
            e.giocatore
          );


        const nome2 =
          normalizzaNomeYouCoach_(
            e.giocatore2
          );


        const p1 =
          playerMap[nome1];

        const p2 =
          playerMap[nome2];


        const minuto =
          Math.max(
            0,
            Math.min(
              90,
              Number(
                e.minuto || 0
              )
            )
          );


        // ======================================
        // GOL + ASSIST
        // ======================================

        if (tipo === 'goal') {

          if (
            p1 &&
            stats[p1.playerId]
          ) {

            stats[p1.playerId]
              .gol++;

          }


          if (
            p2 &&
            stats[p2.playerId]
          ) {

            stats[p2.playerId]
              .assist++;

          }

        }


        // ======================================
        // SOSTITUZIONE
        // ======================================

        else if (
          tipo === 'substitution'
        ) {

          // giocatore1 = esce

          if (
            p1 &&
            stats[p1.playerId]
          ) {

            stats[p1.playerId]
              .minuti =
              minuto;

          }


          // giocatore2 = entra

          if (
            p2 &&
            stats[p2.playerId]
          ) {

            stats[p2.playerId]
              .minuti =
              90 - minuto;

          }

        }


        // ======================================
        // AMMONIZIONE
        // ======================================

        else if (
          tipo === 'yellow_card'
        ) {

          if (
            p1 &&
            stats[p1.playerId]
          ) {

            stats[p1.playerId]
              .ammonizioni++;

          }

        }


        // ======================================
        // ESPULSIONE
        // ======================================

        else if (

          tipo === 'red_card' ||

          tipo ===
            'second_yellow_card'

        ) {

          if (
            p1 &&
            stats[p1.playerId]
          ) {

            stats[p1.playerId]
              .espulsioni++;


            /*
             * Se espulso prima del 90',
             * il minutaggio termina lì.
             */

            if (
              minuto > 0 &&
              minuto <
                stats[p1.playerId]
                  .minuti
            ) {

              stats[p1.playerId]
                .minuti =
                minuto;

            }

          }

        }


        /*
         * injury e altri eventi
         * vengono volutamente ignorati.
         */

      });


      // ==========================================
      // PREPARA DISTINTE
      // ==========================================

      const righeDistinta =
        giocatori.map(p => ([

          matchId,

          dataPartita,

          info.partita,

          p.numero,

          p.playerId,

          p.nomeDatabase

        ]));


      // ==========================================
      // PREPARA YOUCOACH_STATS
      // ==========================================

      const righeStats =
        giocatori.map(p => {

          const s =
            stats[p.playerId];


          return [

            matchId,

            p.playerId,

            p.nomeDatabase,

            competizione,

            s.minuti,

            s.gol,

            s.assist,

            s.ammonizioni,

            s.espulsioni,

            'YOUCOACH'

          ];

        });


      // ==========================================
      // SCRITTURA IDEMPOTENTE
      // ==========================================

      sostituisciRigheMatch_(

        distinteSheet,

        matchId,

        righeDistinta

      );


      sostituisciRigheMatch_(

        statsSheet,

        matchId,

        righeStats

      );


      // ==========================================
      // FORMAZIONE + SOSTITUZIONI YOUCOACH
      // ==========================================

      salvaYouCoachLineupsESostituzioni_(
        matchId,
        info,
        playerMap
      );


      Logger.log(
        '✅ IMPORTATA: ' +
        info.partita +
        ' | ' +
        matchId +
        ' | competizione: ' +
        (
          competizione ||
          'NON TROVATA'
        ) +
        ' | giocatori: ' +
        giocatori.length
      );


      importate++;
      matchStatsEsistenti.add(matchId);
      matchLineupsEsistenti.add(matchId);


    } catch (e) {

      Logger.log(
        '❌ ' +
        file.getName() +
        ': ' +
        e.message
      );

    }

  }


  SpreadsheetApp
    .getActive()
    .toast(
      'Nuove YouCoach: ' +
      importate +
      ' | già presenti: ' +
      saltate,
      'YouCoach',
      5
    );

}

function creaMappaGiocatoriYouCoach_(ss) {

  const sheet = ss.getSheetByName('GIOCATORI');

  if (!sheet) {
    throw new Error('Foglio GIOCATORI non trovato.');
  }

  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    throw new Error('Foglio GIOCATORI vuoto.');
  }

  const headers = data.shift();

  const iPlayer = headers.indexOf('Player_ID');
  const iNome = headers.indexOf('Giocatore');

  if (iPlayer === -1 || iNome === -1) {
    throw new Error(
      'GIOCATORI deve contenere le colonne Player_ID e Giocatore.'
    );
  }

  const map = {};

  data.forEach(row => {

    const playerId =
      String(row[iPlayer] || '').trim();

    const nome =
      String(row[iNome] || '').trim();

    if (!playerId || !nome) {
      return;
    }

    const key =
      normalizzaNomeYouCoach_(nome);

    if (map[key]) {
      throw new Error(
        'Nome duplicato nell’anagrafica GIOCATORI: ' +
        nome
      );
    }

    map[key] = {
      playerId: playerId,
      nome: nome
    };

  });

  Logger.log(
    'Anagrafica GIOCATORI caricata: ' +
    Object.keys(map).length +
    ' giocatori'
  );

  return map;
}


function normalizzaNomeYouCoach_(nome) {

  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .sort()
    .join(' ');

}


function normalizzaDataYouCoach_(data) {

  /*
   * Input:
   * 04/10/2026 15:30
   *
   * Output:
   * Date Google Sheets
   */

  const match = String(data).match(
    /(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (!match) {
    throw new Error(
      'Formato data YouCoach non riconosciuto: ' +
      data
    );
  }

  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );
}


function trovaMatchIdPerData_(
  sheet,
  dataPartita
) {

  const data =
    sheet.getDataRange().getValues();

  const headers = data.shift();

  const iMatch =
    headers.indexOf('Match_ID');

  const iData =
    headers.indexOf('Data');

  if (
    iMatch === -1 ||
    iData === -1
  ) {
    throw new Error(
      'DISTINTE deve contenere Match_ID e Data.'
    );
  }

  const target =
    Utilities.formatDate(
      dataPartita,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );

  for (const row of data) {

    if (!row[iData]) {
      continue;
    }

    const d =
      row[iData] instanceof Date
        ? row[iData]
        : new Date(row[iData]);

    if (isNaN(d.getTime())) {
      continue;
    }

    const corrente =
      Utilities.formatDate(
        d,
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );

    if (corrente === target) {

      return String(
        row[iMatch]
      ).trim();

    }

  }

  return null;
}


function generaMatchIdYouCoach_(
  data,
  partita
) {

  /*
   * ID interno deterministico.
   * Stesso report → stesso ID.
   */

  const dataString =
    Utilities.formatDate(
      data,
      Session.getScriptTimeZone(),
      'yyyyMMdd'
    );

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      dataString + '|' + partita
    );

  const hex = digest
    .map(b =>
      ('0' + ((b + 256) % 256)
        .toString(16))
        .slice(-2)
    )
    .join('');

  return (
    'YC-' +
    dataString +
    '-' +
    hex.substring(0, 8)
  );
}


function sostituisciRigheMatch_(
  sheet,
  matchId,
  nuoveRighe
) {

  const data =
    sheet.getDataRange().getValues();

  if (!data.length) {
    throw new Error(
      'Foglio ' +
      sheet.getName() +
      ' senza intestazioni.'
    );
  }

  const headers = data[0];

  const iMatch =
    headers.indexOf('Match_ID');

  if (iMatch === -1) {
    throw new Error(
      sheet.getName() +
      ' non contiene Match_ID.'
    );
  }

  /*
   * Manteniamo tutte le righe
   * tranne quelle della partita
   * che stiamo reimportando.
   */

  const mantenute =
    data
      .slice(1)
      .filter(row =>
        String(row[iMatch]).trim() !==
        String(matchId).trim()
      );

  const output = [
    headers,
    ...mantenute,
    ...nuoveRighe
  ];

  sheet.clearContents();

  sheet.getRange(
    1,
    1,
    output.length,
    headers.length
  ).setValues(output);

}


function parseYouCoachMhtml_(html) {

  const risultato = {
    partita: '',
    data: '',
    competizione: '',
    titolari: [],
    riserve: [],
    eventi: []
  };


  /*************************************************
   * PARTITA
   *************************************************/

  const titleMatch = html.match(
    /<span class=3D"match-title">([\s\S]*?)<\/span><\/h3>/
  );

  if (titleMatch) {

    risultato.partita =
      pulisciHtmlYouCoach_(
        titleMatch[1]
      )
        .replace(/\s+/g, ' ')
        .trim();

  }


  /*************************************************
   * DATA
   *************************************************/

  const dataMatch = html.match(
    /<label>Data partita<\/label>\s*<div>([^<]+)<\/div>/
  );

  if (dataMatch) {

    risultato.data =
      pulisciHtmlYouCoach_(
        dataMatch[1]
      ).trim();

  }


  /*************************************************
   * COMPETIZIONE / TIPO PARTITA
   *************************************************/

  const competizioneMatch = html.match(
    /<label>Tipo di partita<\/label>\s*<div>([\s\S]*?)<\/div>/
  );

  if (competizioneMatch) {

    risultato.competizione =
      pulisciHtmlYouCoach_(
        competizioneMatch[1]
      )
        .replace(/\s+/g, ' ')
        .trim();

  }


  /*************************************************
   * GIOCATORI
   *
   * Non ci affidiamo più alla classe "titolare".
   * Recuperiamo tutti i player-row e usiamo
   * il numero progressivo:
   *
   * 1-11  = titolari
   * >11   = riserve
   *************************************************/

  const playerRegex =
    /<tr class=3D"player-row player[^"]*" player-id=3D"([^"]+)">([\s\S]*?)<\/tr>/g;

  let playerMatch;

  while (
    (playerMatch = playerRegex.exec(html)) !== null
  ) {

    const youcoachId =
      playerMatch[1];

    const blocco =
      playerMatch[2];


    const numeroMatch = blocco.match(
      /num-progr=3D"(\d+)"/
    );

    const nomeMatch = blocco.match(
      /<div class=3D"player-title">([\s\S]*?)<\/div>/
    );


    if (
      !numeroMatch ||
      !nomeMatch
    ) {
      continue;
    }


    const posizione =
      Number(
        numeroMatch[1]
      );


    const player = {

      youcoachId:
        youcoachId,

      numero:
        posizione,

      nome:
        pulisciHtmlYouCoach_(
          nomeMatch[1]
        ).trim()

    };


    if (
      posizione >= 1 &&
      posizione <= 11
    ) {

      risultato.titolari.push(
        player
      );

    } else {

      risultato.riserve.push(
        player
      );

    }

  }


  /*************************************************
   * EVENTI
   *************************************************/

  const eventRegex =
    /data-match-event=3D"(\{[\s\S]*?\})"/g;

  let eventMatch;


  while (
    (eventMatch = eventRegex.exec(html)) !== null
  ) {

    let jsonText =
      eventMatch[1];


    jsonText =
      jsonText
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'");


    try {

      const e =
        JSON.parse(
          jsonText
        );


      // Escludiamo gli eventi della squadra avversaria

      if (e.opponent === true) {
        continue;
      }


      risultato.eventi.push({

        tipo:
          e.event_type || '',

        minuto:
          Number(
            e.minutes || 0
          ),

        recupero:
          String(
            e.during_injury_time
          ) === '1',

        giocatore:
          e.player_name || '',

        giocatore2:
          e.player_name2 || '',

        youcoachPlayerId:
          e.player_id || '',

        youcoachPlayerId2:
          e.player_id2 || ''

      });


    } catch (err) {

      Logger.log(
        'Evento non interpretabile: ' +
        err.message
      );

    }

  }


  /*************************************************
   * ORDINAMENTO
   *************************************************/

  risultato.titolari.sort(
    (a, b) =>
      a.numero - b.numero
  );

  risultato.riserve.sort(
    (a, b) =>
      a.numero - b.numero
  );


  /*************************************************
   * LOG CONTROLLO
   *************************************************/

  Logger.log(
    'PARTITA: ' +
    risultato.partita
  );

  Logger.log(
    'DATA: ' +
    risultato.data
  );

  Logger.log(
    'COMPETIZIONE: ' +
    (
      risultato.competizione ||
      'NON TROVATA'
    )
  );


  return risultato;

}


function pulisciHtmlYouCoach_(testo) {

  if (!testo) {
    return '';
  }

  return testo
    .replace(/<[^>]+>/g, ' ')
    .replace(/=C3=A0/g, 'à')
    .replace(/=C3=A8/g, 'è')
    .replace(/=C3=A9/g, 'é')
    .replace(/=C3=AC/g, 'ì')
    .replace(/=C3=B2/g, 'ò')
    .replace(/=C3=B9/g, 'ù')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}


/*************************************************
 * YOUCOACH — FORMAZIONI E SOSTITUZIONI
 *
 * Fogli generati:
 * - YOUCOACH_LINEUPS
 * - YOUCOACH_SUBSTITUTIONS
 *
 * Fonte ufficiale: report YouCoach MHTML.
 *************************************************/

var YOUCOACH_LINEUPS_SHEET = 'YOUCOACH_LINEUPS';
var YOUCOACH_SUBSTITUTIONS_SHEET = 'YOUCOACH_SUBSTITUTIONS';

var YOUCOACH_LINEUPS_HEADERS = [
  'Match_ID',
  'Player_ID',
  'Giocatore',
  'Numero',
  'Titolare',
  'Ordine',
  'Fonte'
];

var YOUCOACH_SUBSTITUTIONS_HEADERS = [
  'Match_ID',
  'Minuto',
  'Recupero',
  'Player_Out_ID',
  'Giocatore_Out',
  'Player_In_ID',
  'Giocatore_In',
  'Fonte'
];


/*************************************************
 * SALVATAGGIO FORMAZIONE + SOSTITUZIONI
 *************************************************/

function salvaYouCoachLineupsESostituzioni_(
  matchId,
  info,
  playerMap
) {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const titolari =
    Array.isArray(info && info.titolari)
      ? info.titolari
      : [];

  const riserve =
    Array.isArray(info && info.riserve)
      ? info.riserve
      : [];

  const eventi =
    Array.isArray(info && info.eventi)
      ? info.eventi
      : [];


  // ==========================================
  // FORMAZIONE / PANCHINA
  // ==========================================

  const lineupRows = [];
  const seenPlayers = new Set();

  const rosa = [
    ...titolari.map((p, i) => ({
      player: p,
      titolare: true,
      ordine: i + 1
    })),
    ...riserve.map((p, i) => ({
      player: p,
      titolare: false,
      ordine: titolari.length + i + 1
    }))
  ];

  rosa.forEach(item => {

    const p = item.player || {};

    const nomeYouCoach =
      youCoachText_(
        p.nome ||
        p.giocatore ||
        p.name
      );

    if (!nomeYouCoach) {
      return;
    }

    const key =
      normalizzaNomeYouCoach_(
        nomeYouCoach
      );

    const player =
      playerMap && playerMap[key]
        ? playerMap[key]
        : null;

    if (!player || !player.playerId) {

      Logger.log(
        '⚠️ YOUCOACH_LINEUPS: Player_ID non trovato per ' +
        nomeYouCoach +
        ' | ' +
        matchId
      );

      return;
    }

    const playerId =
      String(player.playerId).trim();

    if (seenPlayers.has(playerId)) {
      return;
    }

    seenPlayers.add(playerId);

    lineupRows.push([
      matchId,
      playerId,
      player.nome || nomeYouCoach,
      youCoachNullableInteger_(
        p.numero ||
        p.numero_maglia ||
        p.jersey_number
      ),
      item.titolare,
      item.ordine,
      'YOUCOACH'
    ]);

  });


  // ==========================================
  // SOSTITUZIONI
  // ==========================================

  const substitutionRows = [];
  const seenSubstitutions = new Set();

  eventi.forEach(evento => {

    const tipo =
      String(
        evento && evento.tipo || ''
      )
        .trim()
        .toLowerCase();

    if (tipo !== 'substitution') {
      return;
    }

    const playerOutName =
      youCoachText_(
        evento.giocatore ||
        evento.giocatore_out ||
        evento.player_out
      );

    const playerInName =
      youCoachText_(
        evento.giocatore2 ||
        evento.giocatore_in ||
        evento.player_in
      );

    const outKey =
      normalizzaNomeYouCoach_(
        playerOutName
      );

    const inKey =
      normalizzaNomeYouCoach_(
        playerInName
      );

    const playerOut =
      playerMap && playerMap[outKey]
        ? playerMap[outKey]
        : null;

    const playerIn =
      playerMap && playerMap[inKey]
        ? playerMap[inKey]
        : null;

    const playerOutId =
      playerOut && playerOut.playerId
        ? String(playerOut.playerId).trim()
        : '';

    const playerInId =
      playerIn && playerIn.playerId
        ? String(playerIn.playerId).trim()
        : '';

    const minuto =
      youCoachNullableInteger_(
        evento.minuto
      );

    if (
      !playerOutId ||
      !playerInId ||
      minuto === ''
    ) {

      Logger.log(
        '⚠️ YOUCOACH_SUBSTITUTIONS: evento incompleto ignorato | ' +
        matchId +
        ' | OUT=' +
        playerOutName +
        ' | IN=' +
        playerInName +
        ' | minuto=' +
        minuto
      );

      return;
    }

    const uniqueKey = [
      matchId,
      minuto,
      playerOutId,
      playerInId
    ].join('|');

    if (seenSubstitutions.has(uniqueKey)) {
      return;
    }

    seenSubstitutions.add(uniqueKey);

    substitutionRows.push([
      matchId,
      minuto,
      evento.recupero === true ||
        String(evento.recupero).toLowerCase() === 'true',
      playerOutId,
      playerOut ? playerOut.nome : playerOutName,
      playerInId,
      playerIn ? playerIn.nome : playerInName,
      'YOUCOACH'
    ]);

  });


  youCoachReplaceMatchRows_(
    ss,
    YOUCOACH_LINEUPS_SHEET,
    YOUCOACH_LINEUPS_HEADERS,
    matchId,
    lineupRows
  );

  youCoachReplaceMatchRows_(
    ss,
    YOUCOACH_SUBSTITUTIONS_SHEET,
    YOUCOACH_SUBSTITUTIONS_HEADERS,
    matchId,
    substitutionRows
  );


  Logger.log(
    '✅ YOUCOACH formazione salvata | ' +
    matchId +
    ' | titolari/riserve=' +
    lineupRows.length +
    ' | sostituzioni=' +
    substitutionRows.length
  );

}


/*************************************************
 * SYNC FORMAZIONI + SOSTITUZIONI → SUPABASE
 *************************************************/

function sincronizzaYouCoachLineupsESostituzioniSupabase_(
  supabaseUrl,
  supabaseKey,
  validMatchIds
) {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const lineups =
    youCoachReadObjects_(
      ss,
      YOUCOACH_LINEUPS_SHEET
    );

  const substitutions =
    youCoachReadObjects_(
      ss,
      YOUCOACH_SUBSTITUTIONS_SHEET
    );

  const matchIds = new Set();

  lineups.forEach(row => {

    const matchId =
      String(row.Match_ID || '').trim();

    if (matchId) {
      matchIds.add(matchId);
    }

  });

  substitutions.forEach(row => {

    const matchId =
      String(row.Match_ID || '').trim();

    if (matchId) {
      matchIds.add(matchId);
    }

  });


  let totaleLineups = 0;
  let totaleSubstitutions = 0;
  let matchSaltati = 0;


  matchIds.forEach(matchId => {

    if (
      validMatchIds instanceof Set &&
      !validMatchIds.has(matchId)
    ) {

      Logger.log(
        '⚠️ Lineup/sostituzioni NON sincronizzate: ' +
        matchId +
        ' non è ancora presente nell’elenco matches da sincronizzare.'
      );

      matchSaltati++;
      return;
    }


    const lineupPayload =
      lineups
        .filter(row =>
          String(row.Match_ID || '').trim() ===
          matchId
        )
        .map(row => ({

          match_id:
            matchId,

          player_id:
            String(
              row.Player_ID || ''
            ).trim(),

          numero:
            youCoachNullForSupabase_(
              row.Numero
            ),

          titolare:
            row.Titolare === true ||
            String(
              row.Titolare
            ).toLowerCase() === 'true',

          ordine:
            youCoachNullForSupabase_(
              row.Ordine
            )

        }))
        .filter(row =>
          row.player_id
        );


    const substitutionPayload =
      substitutions
        .filter(row =>
          String(row.Match_ID || '').trim() ===
          matchId
        )
        .map(row => ({

          match_id:
            matchId,

          minuto:
            Number(
              row.Minuto || 0
            ),

          recupero:
            row.Recupero === true ||
            String(
              row.Recupero
            ).toLowerCase() === 'true',

          player_out_id:
            String(
              row.Player_Out_ID || ''
            ).trim(),

          player_in_id:
            String(
              row.Player_In_ID || ''
            ).trim()

        }))
        .filter(row =>
          row.player_out_id &&
          row.player_in_id
        );


    // Reimport idempotente: cancella solo la partita
    // interessata e reinserisce la versione corrente.

    supabaseDelete_(
      supabaseUrl,
      supabaseKey,
      'match_lineups',
      `match_id=eq.${encodeURIComponent(matchId)}`
    );

    supabaseDelete_(
      supabaseUrl,
      supabaseKey,
      'match_substitutions',
      `match_id=eq.${encodeURIComponent(matchId)}`
    );


    if (lineupPayload.length > 0) {

      supabaseInsert_(
        supabaseUrl,
        supabaseKey,
        'match_lineups',
        lineupPayload
      );

    }


    if (substitutionPayload.length > 0) {

      supabaseInsert_(
        supabaseUrl,
        supabaseKey,
        'match_substitutions',
        substitutionPayload
      );

    }


    totaleLineups +=
      lineupPayload.length;

    totaleSubstitutions +=
      substitutionPayload.length;


    Logger.log(
      '✅ Lineup/Sostituzioni Supabase | ' +
      matchId +
      ' | lineup=' +
      lineupPayload.length +
      ' | sostituzioni=' +
      substitutionPayload.length
    );

  });


  return {
    lineups: totaleLineups,
    substitutions: totaleSubstitutions,
    skippedMatches: matchSaltati
  };

}


/*************************************************
 * CREA/AGGIORNA FOGLIO PER MATCH
 *************************************************/

function youCoachReplaceMatchRows_(
  spreadsheet,
  sheetName,
  headers,
  matchId,
  newRows
) {

  let sheet =
    spreadsheet.getSheetByName(
      sheetName
    );

  if (!sheet) {
    sheet =
      spreadsheet.insertSheet(
        sheetName
      );
  }


  const lastRow =
    sheet.getLastRow();

  const existing =
    lastRow > 1
      ? sheet
          .getRange(
            2,
            1,
            lastRow - 1,
            headers.length
          )
          .getValues()
      : [];


  const retained =
    existing.filter(row =>
      String(row[0] || '').trim() !==
      String(matchId).trim()
    );

  const rows = [
    ...retained,
    ...newRows
  ];


  sheet.clearContents();

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ]);


  if (rows.length > 0) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setValues(rows);

  }

}


/*************************************************
 * LETTURA FOGLIO COME OGGETTI
 *************************************************/

function youCoachReadObjects_(
  spreadsheet,
  sheetName
) {

  const sheet =
    spreadsheet.getSheetByName(
      sheetName
    );

  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {
    return [];
  }


  const values =
    sheet
      .getDataRange()
      .getValues();

  const headers =
    values.shift();


  return values
    .filter(row =>
      row.some(value =>
        value !== ''
      )
    )
    .map(row => {

      const object = {};

      headers.forEach(
        (header, index) => {
          object[header] =
            row[index];
        }
      );

      return object;

    });

}


/*************************************************
 * HELPERS YOUCOACH
 *************************************************/

function youCoachText_(value) {

  return (
    value === null ||
    value === undefined
  )
    ? ''
    : String(value).trim();

}


function youCoachNullableInteger_(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  const match =
    String(value).match(
      /-?\d+/
    );

  return match
    ? parseInt(match[0], 10)
    : '';

}


function youCoachNullForSupabase_(value) {

  return (
    value === null ||
    value === undefined ||
    value === ''
  )
    ? null
    : Number(value);

}

function importaReportVeoMhtml() {

  const ss = SpreadsheetApp.getActive();

  // ==========================================
  // CARTELLA DRIVE
  // ==========================================

  const props =
    PropertiesService.getScriptProperties();

  const folderId =
    props.getProperty('VEO_REPORT_FOLDER_ID');

  if (!folderId) {
    throw new Error(
      'Manca la proprietà script VEO_REPORT_FOLDER_ID.'
    );
  }

  const folder =
    DriveApp.getFolderById(folderId);


  // ==========================================
  // CERCA FILE MHTML VEO
  // ==========================================

  const files = folder.getFiles();

  const reportFiles = [];

  while (files.hasNext()) {

    const file = files.next();

    const nome =
      String(file.getName() || '').trim();

    if (
      /\.mhtml$/i.test(nome) &&
      /veo/i.test(nome)
    ) {

      reportFiles.push(file);

    }

  }

  if (!reportFiles.length) {
    throw new Error(
      'Nessun file MHTML Veo trovato nella cartella.'
    );
  }


  // ==========================================
  // FOGLIO OUTPUT
  // ==========================================

  const sheetName =
    'VEO_REPORT_STATS';

  let sheet =
    ss.getSheetByName(sheetName);

  if (!sheet) {

    sheet =
      ss.insertSheet(sheetName);

  }


  const headers = [

    'Match_ID',
    'Veo_Match_ID',
    'Data',
    'Partita',

    'Numero',
    'Player_ID',
    'Giocatore',

    'Minuti_Veo',

    'Distanza_km',
    'Velocita_Media_kmh',
    'Velocita_Max_kmh',

    'Sprint',
    'Corse_Alta_Intensita',

    'Eventi_Totali',

    'Gol_Veo',
    'Assist_Veo',
    'Coinvolgimenti_Gol',
    'Percentuale_Realizzativa',

    'Tiri',
    'Tiri_Totali',

    'Contrasti',

    'Calci_Angolo',
    'Calci_Punizione',
    'Rimesse_Laterali',

    'Falli',

    'Rigori',
    'Calci_Rinvio',

    'Fonte'

  ];


  if (sheet.getLastRow() === 0) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);

  }


  const matchGiaImportati =
    leggiValoriUniciColonna_(
      ss,
      'VEO_REPORT_STATS',
      'Match_ID'
    );

  let saltati = 0;


  // ==========================================
  // MAPPE DATABASE
  // ==========================================

  const veoMatchesMap =
    creaMappaVeoMatchesReport_(ss);

  const distinteMap =
    creaMappaDistinteReport_(ss);


  // ==========================================
  // IMPORT FILE
  // ==========================================

  let totaleRighe = 0;

  reportFiles.forEach(file => {

    Logger.log(
      '--------------------------------'
    );

    Logger.log(
      'FILE: ' + file.getName()
    );


    const raw =
      file
        .getBlob()
        .getDataAsString();


    const html =
      estraiHtmlMhtmlVeo_(raw);


    // ==========================================
    // METADATI MATCH
    // ==========================================

    const info =
      estraiInfoMatchVeo_(html);


    Logger.log(
      'Veo Match ID: ' +
      info.veoMatchId
    );

    Logger.log(
      'Data report: ' +
      info.data
    );

    Logger.log(
      'Titolo: ' +
      info.titolo
    );


    const match =
      veoMatchesMap[
        info.veoMatchId
      ];


    if (!match) {

      throw new Error(
        'Veo_Match_ID non trovato in VEO_MATCHES: ' +
        info.veoMatchId
      );

    }


    if (matchGiaImportati.has(match.matchId)) {

      Logger.log(
        '⏭️ VEO_REPORT_STATS già presente: ' +
        match.matchId
      );

      saltati++;
      return;

    }


    // ==========================================
    // PARSE TABELLA
    // ==========================================

    const giocatori =
      estraiStatisticheGiocatoriVeo_(
        html
      );


    Logger.log(
      'Giocatori Veo trovati: ' +
      giocatori.length
    );


    const rows = [];


    giocatori.forEach(g => {

      const chiaveDistinta =
        match.matchId +
        '|' +
        String(g.numero);


      const distinta =
        distinteMap[
          chiaveDistinta
        ] || {};


      rows.push([

        match.matchId,
        info.veoMatchId,

        match.data,
        match.partita,

        g.numero,

        distinta.playerId || '',
        distinta.giocatore || '',

        g.minuti,

        g.distanza,
        g.velocitaMedia,
        g.velocitaMax,

        g.sprint,
        g.corseIntense,

        g.eventi,

        g.gol,
        g.assist,
        g.coinvolgimentiGol,
        g.percentualeRealizzativa,

        g.tiri,
        g.tiriTotali,

        g.contrasti,

        g.calciAngolo,
        g.calciPunizione,
        g.rimesseLaterali,

        g.falli,

        g.rigori,
        g.calciRinvio,

        'VEO_REPORT'

      ]);

    });


    // ==========================================
    // CANCELLA EVENTUALE IMPORT PRECEDENTE
    // DELLO STESSO MATCH
    // ==========================================

    rimuoviMatchDaVeoReportStats_(
      sheet,
      match.matchId
    );


    if (rows.length) {

      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          rows.length,
          headers.length
        )
        .setValues(rows);

    }


    totaleRighe +=
      rows.length;

    matchGiaImportati.add(
      match.matchId
    );


    Logger.log(
      '✅ IMPORTATO: ' +
      match.partita +
      ' | ' +
      match.matchId +
      ' | righe: ' +
      rows.length
    );

  });


  Logger.log(
    '================================'
  );

  Logger.log(
    'IMPORT REPORT VEO COMPLETATO'
  );

  Logger.log(
    'Righe importate: ' +
    totaleRighe
  );

  Logger.log(
    '================================'
  );


  SpreadsheetApp
    .getActive()
    .toast(
      'Report Veo: ' +
      totaleRighe +
      ' nuove righe | già presenti: ' +
      saltati
    );

}

function creaMappaVeoMatchesReport_(ss) {

  const sheet =
    ss.getSheetByName(
      'VEO_MATCHES'
    );

  if (!sheet) {
    throw new Error(
      'Foglio VEO_MATCHES non trovato.'
    );
  }

  const data =
    sheet
      .getDataRange()
      .getValues();

  const headers =
    data.shift();

  const idx = {};

  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });


  const richiesti = [
    'Match_ID',
    'Data',
    'Partita',
    'Veo_Match_ID'
  ];

  richiesti.forEach(h => {
    if (idx[h] === undefined) {
      throw new Error(
        'VEO_MATCHES: colonna mancante: ' + h
      );
    }
  });


  const map = {};


  data.forEach(row => {

    const veoMatchId =
      String(
        row[idx.Veo_Match_ID] || ''
      ).trim();

    if (!veoMatchId) return;


    let dataMatch =
      row[idx.Data];


    if (
      dataMatch instanceof Date
    ) {

      dataMatch =
        Utilities.formatDate(
          dataMatch,
          Session.getScriptTimeZone(),
          'yyyy-MM-dd'
        );

    }


    map[veoMatchId] = {

      matchId:
        String(
          row[idx.Match_ID] || ''
        ).trim(),

      data:
        String(
          dataMatch || ''
        ).trim(),

      partita:
        String(
          row[idx.Partita] || ''
        ).trim()

    };

  });


  return map;

}

function creaMappaDistinteReport_(ss) {

  const sheet =
    ss.getSheetByName(
      'DISTINTE'
    );

  if (!sheet) {
    throw new Error(
      'Foglio DISTINTE non trovato.'
    );
  }

  const data =
    sheet
      .getDataRange()
      .getValues();

  const headers =
    data.shift();

  const idx = {};

  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });


  const map = {};


  data.forEach(row => {

    const matchId =
      String(
        row[idx.Match_ID] || ''
      ).trim();

    const numero =
      String(
        row[idx.Numero] || ''
      ).trim();

    if (
      !matchId ||
      !numero
    ) {
      return;
    }


    map[
      matchId +
      '|' +
      numero
    ] = {

      playerId:
        String(
          row[idx.Player_ID] || ''
        ).trim(),

      giocatore:
        String(
          row[idx.Giocatore] || ''
        ).trim()

    };

  });


  return map;

}

function estraiInfoMatchVeo_(html) {

  const matchUuid =
    html.match(
      /\/matches\/([0-9a-fA-F-]{36})\//
    );

  if (!matchUuid) {
    throw new Error(
      'Veo Match ID non trovato nel report.'
    );
  }


  const titleMatch =
    html.match(
      /report-title[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i
    ) ||
    html.match(
      /<h1[^>]*>([\s\S]*?)<\/h1>/i
    );


  const dateMatch =
    html.match(
      /<time[^>]*datetime="([^"]+)"/i
    );


  return {

    veoMatchId:
      matchUuid[1],

    titolo:
      titleMatch
        ? pulisciHtmlVeo_(
            titleMatch[1]
          )
        : '',

    data:
      dateMatch
        ? String(
            dateMatch[1]
          ).substring(0, 10)
        : ''

  };

}

function estraiStatisticheGiocatoriVeo_(html) {

  const tableMatch =
    html.match(
      /<table[^>]*>[\s\S]*?Statistiche per giocatore della partita[\s\S]*?<\/table>/i
    );

  if (!tableMatch) {
    throw new Error(
      'Tabella statistiche giocatori Veo non trovata.'
    );
  }


  const tableHtml =
    tableMatch[0];


  const rowRegex =
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;


  const players = [];

  let rowMatch;


  while (
    (rowMatch =
      rowRegex.exec(tableHtml))
  ) {

    const rowHtml =
      rowMatch[1];


    const cellRegex =
      /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;


    const cells = [];

    let cellMatch;


    while (
      (cellMatch =
        cellRegex.exec(rowHtml))
    ) {

      cells.push(
        pulisciHtmlVeo_(
          cellMatch[1]
        )
      );

    }


    // header
    if (
      cells.length < 22 ||
      cells[0] === 'Giocatore'
    ) {
      continue;
    }


    const numeroMatch =
      cells[0].match(
        /#\s*(\d+)/
      ) ||
      cells[0].match(
        /N\.\s*maglia\s*(\d+)/i
      );


    if (!numeroMatch) {
      continue;
    }


    const numero =
      Number(
        numeroMatch[1]
      );


    players.push({

      numero: numero,

      minuti:
        numeroVeo_(
          cells[2]
        ),

      distanza:
        numeroVeo_(
          cells[3]
        ),

      velocitaMedia:
        numeroVeo_(
          cells[4]
        ),

      velocitaMax:
        numeroVeo_(
          cells[5]
        ),

      sprint:
        numeroVeo_(
          cells[6]
        ),

      corseIntense:
        numeroVeo_(
          cells[7]
        ),

      eventi:
        numeroVeo_(
          cells[8]
        ),

      gol:
        numeroVeo_(
          cells[9]
        ),

      assist:
        numeroVeo_(
          cells[10]
        ),

      coinvolgimentiGol:
        numeroVeo_(
          cells[11]
        ),

      percentualeRealizzativa:
        numeroVeo_(
          cells[12]
        ),

      tiri:
        numeroVeo_(
          cells[13]
        ),

      tiriTotali:
        numeroVeo_(
          cells[14]
        ),

      contrasti:
        numeroVeo_(
          cells[15]
        ),

      calciAngolo:
        numeroVeo_(
          cells[16]
        ),

      calciPunizione:
        numeroVeo_(
          cells[17]
        ),

      rimesseLaterali:
        numeroVeo_(
          cells[18]
        ),

      falli:
        numeroVeo_(
          cells[19]
        ),

      rigori:
        numeroVeo_(
          cells[20]
        ),

      calciRinvio:
        numeroVeo_(
          cells[21]
        )

    });

  }


  return players;

}

function numeroVeo_(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  let s =
    String(value)
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.');


  const m =
    s.match(
      /-?\d+(?:\.\d+)?/
    );


  if (!m) return 0;


  const n =
    Number(m[0]);


  return isNaN(n)
    ? 0
    : n;

}

function pulisciHtmlVeo_(html) {

  return String(html || '')

    .replace(
      /<script[\s\S]*?<\/script>/gi,
      ' '
    )

    .replace(
      /<style[\s\S]*?<\/style>/gi,
      ' '
    )

    .replace(
      /<[^>]+>/g,
      ' '
    )

    .replace(
      /&nbsp;/gi,
      ' '
    )

    .replace(
      /&amp;/gi,
      '&'
    )

    .replace(
      /&quot;/gi,
      '"'
    )

    .replace(
      /&#39;/gi,
      "'"
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim();

}

function estraiHtmlMhtmlVeo_(raw) {

  const boundaryMatch =
    raw.match(
      /boundary="?([^"\r\n;]+)"?/i
    );

  if (!boundaryMatch) {
    throw new Error(
      'Boundary MHTML non trovato.'
    );
  }


  const boundary =
    boundaryMatch[1];


  const parts =
    raw.split(
      '--' + boundary
    );


  for (
    let i = 0;
    i < parts.length;
    i++
  ) {

    const part =
      parts[i];


    if (
      !/Content-Type:\s*text\/html/i
        .test(part)
    ) {
      continue;
    }


    const separator =
      part.search(
        /\r?\n\r?\n/
      );


    if (separator === -1) {
      continue;
    }


    let body =
      part.substring(
        separator
      )
      .replace(
        /^\r?\n\r?\n/,
        ''
      );


    if (
      /Content-Transfer-Encoding:\s*quoted-printable/i
        .test(part)
    ) {

      body =
        decodeQuotedPrintableVeo_(
          body
        );

    }


    return body;

  }


  throw new Error(
    'Parte HTML non trovata nel file MHTML.'
  );

}

function decodeQuotedPrintableVeo_(text) {

  text =
    String(text || '')
      .replace(
        /=\r?\n/g,
        ''
      );


  const bytes = [];


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    if (
      text[i] === '=' &&
      /^[0-9A-Fa-f]{2}$/
        .test(
          text.substring(
            i + 1,
            i + 3
          )
        )
    ) {

      bytes.push(
        parseInt(
          text.substring(
            i + 1,
            i + 3
          ),
          16
        )
      );

      i += 2;

    } else {

      const code =
        text.charCodeAt(i);

      if (code <= 255) {

        bytes.push(code);

      }

    }

  }


  return Utilities
    .newBlob(bytes)
    .getDataAsString(
      'UTF-8'
    );

}

function rimuoviMatchDaVeoReportStats_(
  sheet,
  matchId
) {

  const data =
    sheet
      .getDataRange()
      .getValues();

  if (data.length <= 1) {
    return;
  }


  const headers =
    data[0];


  const matchIndex =
    headers.indexOf(
      'Match_ID'
    );


  if (matchIndex === -1) {
    return;
  }


  const rowsToDelete = [];


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(
        data[i][matchIndex] || ''
      ).trim() ===
      String(matchId)
    ) {

      rowsToDelete.push(
        i + 1
      );

    }

  }


  rowsToDelete
    .reverse()
    .forEach(row => {

      sheet.deleteRow(row);

    });

}

function importaPosizioniMedieVeoMhtml() {

  const ss = SpreadsheetApp.getActive();

  const props =
    PropertiesService.getScriptProperties();

  const folderId =
    props.getProperty('VEO_REPORT_FOLDER_ID');

  if (!folderId) {
    throw new Error(
      'Manca VEO_REPORT_FOLDER_ID nelle Proprietà script.'
    );
  }

  const folder =
    DriveApp.getFolderById(folderId);

  const files =
    folder.getFiles();

  const veoMatchesMap =
    creaMappaVeoMatchesReport_(ss);

  const distinteMap =
    creaMappaDistinteReport_(ss);


  // ==========================================
  // FOGLIO OUTPUT
  // ==========================================

  const sheetName =
    'VEO_POSITION_STATS';

  let sheet =
    ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet =
      ss.insertSheet(sheetName);
  }


  const headers = [

    'Match_ID',
    'Veo_Match_ID',
    'Data',
    'Partita',

    'Numero',
    'Player_ID',
    'Giocatore',

    'X_Media_Pct',
    'Y_Media_Pct',

    'Zona_Orizzontale',
    'Zona_Verticale',

    'Fonte'

  ];


  if (sheet.getLastRow() === 0) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);

  }


  let totaleRighe = 0;
  let saltati = 0;

  const matchGiaImportati =
    leggiValoriUniciColonna_(
      ss,
      'VEO_POSITION_STATS',
      'Match_ID'
    );


  // ==========================================
  // FILE MHTML
  // ==========================================

  while (files.hasNext()) {

    const file =
      files.next();

    const nome =
      String(
        file.getName() || ''
      ).trim();


    if (
      !/\.mhtml$/i.test(nome) ||
      !/veo/i.test(nome)
    ) {
      continue;
    }


    Logger.log(
      '================================'
    );

    Logger.log(
      'POSIZIONI VEO: ' +
      nome
    );


    const raw =
      file
        .getBlob()
        .getDataAsString();


    const html =
      estraiHtmlMhtmlVeo_(raw);


    const info =
      estraiInfoMatchVeo_(html);


    const match =
      veoMatchesMap[
        info.veoMatchId
      ];


    if (!match) {

      Logger.log(
        '⚠️ Match non trovato in VEO_MATCHES: ' +
        info.veoMatchId
      );

      continue;

    }


    if (matchGiaImportati.has(match.matchId)) {

      Logger.log(
        '⏭️ VEO_POSITION_STATS già presente: ' +
        match.matchId
      );

      saltati++;
      continue;

    }


    const posizioni =
      estraiPosizioniMedieVeo_(html);


    Logger.log(
      'Posizioni trovate: ' +
      posizioni.length
    );


    const rows = [];


    posizioni.forEach(p => {

      const distinta =
        distinteMap[
          match.matchId +
          '|' +
          String(p.numero)
        ] || {};


      rows.push([

        match.matchId,

        info.veoMatchId,

        match.data,

        match.partita,

        p.numero,

        distinta.playerId || '',

        distinta.giocatore || '',

        p.x,

        p.y,

        determinaZonaOrizzontaleVeo_(
          p.y
        ),

        determinaZonaVerticaleVeo_(
          p.x
        ),

        'VEO_REPORT'

      ]);

    });


    // ==========================================
    // RIMUOVE EVENTUALE IMPORT PRECEDENTE
    // ==========================================

    rimuoviMatchDaVeoPositionStats_(
      sheet,
      match.matchId
    );


    if (rows.length) {

      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          rows.length,
          headers.length
        )
        .setValues(rows);

    }


    totaleRighe +=
      rows.length;

    matchGiaImportati.add(
      match.matchId
    );


    Logger.log(
      '✅ Posizioni importate: ' +
      rows.length
    );

  }


  SpreadsheetApp
    .getActive()
    .toast(
      'Posizioni Veo: ' +
      totaleRighe +
      ' nuove righe | già presenti: ' +
      saltati
    );

}

function estraiPosizioniMedieVeo_(html) {

  const risultati = [];

  /*
   * Supporta sia:
   *
   * aria-label="Maglia n° 1, posizione media"
   *
   * sia il formato quoted-printable:
   *
   * aria-label=3D"Maglia n=C2=B0 1, posizione media"
   *
   * Gestisce anche gli a-capo quoted printable "=".
   */

  const testo =
    String(html || '')
      .replace(/=\r?\n/g, '')
      .replace(/=3D/g, '=')
      .replace(/=C2=B0/g, '°');


  const regex =
    /aria-label="Maglia\s+n°\s*(\d+),\s*posizione\s+media"[\s\S]{0,500}?style="[^"]*left:\s*([\d.]+)%;\s*top:\s*([\d.]+)%/gi;


  let match;


  while (
    (match = regex.exec(testo)) !== null
  ) {

    const numero =
      Number(match[1]);

    const x =
      Number(match[2]);

    const y =
      Number(match[3]);


    if (
      !numero ||
      isNaN(x) ||
      isNaN(y)
    ) {
      continue;
    }


    risultati.push({
      numero: numero,
      x: x,
      y: y
    });

  }


  Logger.log(
    'Posizioni medie estratte: ' +
    risultati.length
  );


  risultati.forEach(p => {

    Logger.log(
      '#' +
      p.numero +
      ' → X=' +
      p.x +
      ' Y=' +
      p.y
    );

  });


  return risultati;

}

function importaEventiPosizioneVeoMhtml() {

  const ss = SpreadsheetApp.getActive();

  const props =
    PropertiesService.getScriptProperties();

  const folderId =
    props.getProperty('VEO_REPORT_FOLDER_ID');

  if (!folderId) {
    throw new Error(
      'Manca VEO_REPORT_FOLDER_ID nelle Proprietà script.'
    );
  }


  const folder =
    DriveApp.getFolderById(folderId);

  const files =
    folder.getFiles();


  const veoMatchesMap =
    creaMappaVeoMatchesReport_(ss);

  const distinteMap =
    creaMappaDistinteReport_(ss);


  // ==========================================
  // FOGLIO OUTPUT
  // ==========================================

  const sheetName =
    'VEO_EVENT_POSITIONS';

  let sheet =
    ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet =
      ss.insertSheet(sheetName);
  }


  const headers = [

    'Match_ID',
    'Veo_Match_ID',
    'Data',
    'Partita',

    'Numero',
    'Player_ID',
    'Giocatore',

    'Tipo_Evento',
    'Minuto',

    'X_Pct',
    'Y_Pct',

    'Zona_Orizzontale',
    'Zona_Verticale',

    'Fonte'

  ];


  if (sheet.getLastRow() === 0) {

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);

  }


  let totaleRighe = 0;
  let saltati = 0;

  const matchGiaImportati =
    leggiValoriUniciColonna_(
      ss,
      'VEO_EVENT_POSITIONS',
      'Match_ID'
    );


  // ==========================================
  // FILE MHTML
  // ==========================================

  while (files.hasNext()) {

    const file =
      files.next();

    const nome =
      String(
        file.getName() || ''
      ).trim();


    if (
      !/\.mhtml$/i.test(nome) ||
      !/veo/i.test(nome)
    ) {
      continue;
    }


    Logger.log(
      '================================'
    );

    Logger.log(
      'EVENTI POSIZIONE VEO: ' +
      nome
    );


    const raw =
      file
        .getBlob()
        .getDataAsString();


    const html =
      estraiHtmlMhtmlVeo_(raw);


    const info =
      estraiInfoMatchVeo_(html);


    const match =
      veoMatchesMap[
        info.veoMatchId
      ];


    if (!match) {

      Logger.log(
        '⚠️ Match non trovato in VEO_MATCHES: ' +
        info.veoMatchId
      );

      continue;

    }


    if (matchGiaImportati.has(match.matchId)) {

      Logger.log(
        '⏭️ VEO_EVENT_POSITIONS già presente: ' +
        match.matchId
      );

      saltati++;
      continue;

    }


    const eventi =
      estraiEventiPosizioneVeo_(html);


    Logger.log(
      'Eventi con coordinate trovati: ' +
      eventi.length
    );


    const rows = [];


    eventi.forEach(e => {

      const distinta =
        distinteMap[
          match.matchId +
          '|' +
          String(e.numero)
        ] || {};


      rows.push([

        match.matchId,

        info.veoMatchId,

        match.data,

        match.partita,

        e.numero,

        distinta.playerId || '',

        distinta.giocatore || '',

        e.tipo,

        e.minuto,

        e.x,

        e.y,

        determinaZonaOrizzontaleVeo_(
          e.y
        ),

        determinaZonaVerticaleVeo_(
          e.x
        ),

        'VEO_REPORT'

      ]);

    });


    // ==========================================
    // RIMUOVE EVENTUALE IMPORT PRECEDENTE
    // ==========================================

    rimuoviMatchDaVeoEventPositions_(
      sheet,
      match.matchId
    );


    if (rows.length) {

      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          rows.length,
          headers.length
        )
        .setValues(rows);

    }


    totaleRighe +=
      rows.length;

    matchGiaImportati.add(
      match.matchId
    );


    Logger.log(
      '✅ Eventi importati: ' +
      rows.length
    );

  }


  SpreadsheetApp
    .getActive()
    .toast(
      'Eventi Veo: ' +
      totaleRighe +
      ' nuove righe | già presenti: ' +
      saltati
    );

}

function estraiEventiPosizioneVeo_(html) {

  const risultati = [];


  /*
   * Normalizziamo il quoted-printable
   * per rendere leggibile il markup.
   */

  const testo =
    String(html || '')
      .replace(/=\r?\n/g, '')
      .replace(/=3D/g, '=')
      .replace(/=C2=B0/g, '°');


  /*
   * Esempi reali:
   *
   * aria-label="Tiro di Maglia n° 9 al 14'"
   * style="left: 93.75%; top: 22.05%;"
   *
   * aria-label="Gol di Maglia n° 9 al 87'"
   *
   * aria-label="Contrasto di Maglia n° 2 al 44'"
   */

  const regex =
    /aria-label="(Tiro|Gol|Contrasto)\s+di\s+Maglia\s+n°\s*(\d+)\s+al\s+(\d+)'?"[\s\S]{0,250}?style="[^"]*left:\s*([\d.]+)%;\s*top:\s*([\d.]+)%/gi;


  let match;


  while (
    (match = regex.exec(testo)) !== null
  ) {

    const tipo =
      String(match[1] || '')
        .trim()
        .toUpperCase();

    const numero =
      Number(match[2]);

    const minuto =
      Number(match[3]);

    const x =
      Number(match[4]);

    const y =
      Number(match[5]);


    if (
      !numero ||
      isNaN(minuto) ||
      isNaN(x) ||
      isNaN(y)
    ) {
      continue;
    }


    risultati.push({

      tipo: tipo,

      numero: numero,

      minuto: minuto,

      x: x,

      y: y

    });

  }


  Logger.log(
    'Eventi posizione estratti: ' +
    risultati.length
  );


  const conteggio = {};

  risultati.forEach(e => {

    conteggio[e.tipo] =
      (conteggio[e.tipo] || 0) + 1;

  });


  Object.keys(conteggio)
    .sort()
    .forEach(tipo => {

      Logger.log(
        tipo +
        ': ' +
        conteggio[tipo]
      );

    });


  return risultati;

}
function rimuoviMatchDaVeoEventPositions_(
  sheet,
  matchId
) {

  const data =
    sheet
      .getDataRange()
      .getValues();


  if (data.length <= 1) {
    return;
  }


  const headers =
    data[0];


  const matchIndex =
    headers.indexOf(
      'Match_ID'
    );


  if (matchIndex === -1) {
    return;
  }


  const righeDaEliminare = [];


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(
        data[i][matchIndex] || ''
      ).trim() ===
      String(matchId)
    ) {

      righeDaEliminare.push(
        i + 1
      );

    }

  }


  righeDaEliminare
    .reverse()
    .forEach(riga => {

      sheet.deleteRow(riga);

    });

}

function determinaZonaVerticaleVeo_(x) {

  x = Number(x);


  if (x < 33.33) {
    return 'TERZO_DIFENSIVO';
  }

  if (x < 66.66) {
    return 'TERZO_CENTRALE';
  }

  return 'TERZO_OFFENSIVO';

}

function determinaZonaOrizzontaleVeo_(y) {

  y = Number(y);


  if (y < 20) {
    return 'FASCIA_SINISTRA';
  }

  if (y < 40) {
    return 'CENTRO_SINISTRA';
  }

  if (y < 60) {
    return 'CENTRO';
  }

  if (y < 80) {
    return 'CENTRO_DESTRA';
  }

  return 'FASCIA_DESTRA';

}

function rimuoviMatchDaVeoPositionStats_(
  sheet,
  matchId
) {

  const data =
    sheet
      .getDataRange()
      .getValues();


  if (data.length <= 1) {
    return;
  }


  const headers =
    data[0];


  const matchIndex =
    headers.indexOf(
      'Match_ID'
    );


  if (matchIndex === -1) {
    return;
  }


  const righeDaEliminare = [];


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(
        data[i][matchIndex] || ''
      ).trim() ===
      String(matchId)
    ) {

      righeDaEliminare.push(
        i + 1
      );

    }

  }


  righeDaEliminare
    .reverse()
    .forEach(riga => {

      sheet.deleteRow(riga);

    });

}

function testScaricaPaginaReportVeo() {

  const token = getVeoAccessToken_();

  const ss =
    SpreadsheetApp.getActive();

  const sheet =
    ss.getSheetByName('VEO_MATCHES');

  if (!sheet) {
    throw new Error(
      'Foglio VEO_MATCHES non trovato.'
    );
  }

  const ui =
    SpreadsheetApp.getUi();

  const risposta =
    ui.prompt(
      'REPORT VEO',
      'Inserisci il Match_ID interno:',
      ui.ButtonSet.OK_CANCEL
    );

  if (
    risposta.getSelectedButton() !==
    ui.Button.OK
  ) {
    return;
  }

  const matchId =
    risposta
      .getResponseText()
      .trim();

  const data =
    sheet
      .getDataRange()
      .getValues();

  const headers =
    data.shift();

  const iMatch =
    headers.indexOf('Match_ID');

  const iVeo =
    headers.indexOf('Veo_Match_ID');

  if (
    iMatch === -1 ||
    iVeo === -1
  ) {
    throw new Error(
      'VEO_MATCHES deve contenere Match_ID e Veo_Match_ID.'
    );
  }

  const row =
    data.find(r =>
      String(r[iMatch]).trim() ===
      matchId
    );

  if (!row) {
    throw new Error(
      'Match_ID non trovato: ' +
      matchId
    );
  }

  const veoMatchId =
    String(
      row[iVeo] || ''
    ).trim();

  if (!veoMatchId) {
    throw new Error(
      'Veo_Match_ID vuoto.'
    );
  }

  const url =
    'https://app.veo.co/matches/' +
    veoMatchId +
    '/';

  Logger.log(
    'URL: ' + url
  );

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method: 'get',

        headers: {
          Authorization:
            'Bearer ' + token,

          'veo-agent':
            'veo:svc:web-app'
        },

        muteHttpExceptions:
          true,

        followRedirects:
          true
      }
    );

  const status =
    response.getResponseCode();

  const body =
    response.getContentText();

  Logger.log(
    'HTTP: ' + status
  );

  Logger.log(
    'Lunghezza risposta: ' +
    body.length
  );

  Logger.log(
    body.substring(0, 500)
  );

  const folderId =
    props.getProperty(
      'VEO_REPORT_FOLDER_ID'
    );

  if (!folderId) {
    throw new Error(
      'VEO_REPORT_FOLDER_ID non configurato.'
    );
  }

  const folder =
    DriveApp.getFolderById(
      folderId
    );

  folder.createFile(
    'TEST_VEO_' +
    veoMatchId +
    '.html',
    body,
    MimeType.HTML
  );

  SpreadsheetApp
    .getActive()
    .toast(
      'Test Veo salvato su Drive. HTTP ' +
      status
    );
}
