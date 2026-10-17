/*
 * Modulo da copiare nel progetto Apps Script che importa YouCoach.
 *
 * Dopo aver costruito `info`, chiamare:
 *   salvaYouCoachLineupsESostituzioni_(matchId, info, playerIdByName);
 *
 * `playerIdByName` puo essere una funzione (nome -> Player_ID) oppure una mappa
 * indicizzata per nome normalizzato. Il resolver gia usato per DISTINTE va bene.
 *
 * Alla fine di sincronizzaSupabase(), dopo players e matches, chiamare:
 *   sincronizzaYouCoachLineupsESostituzioniSupabase_();
 *
 * Configurare SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nelle Script Properties.
 * La service role resta nello script server-side e non deve mai arrivare al browser.
 */

var YOUCOACH_LINEUPS_SHEET = 'YOUCOACH_LINEUPS';
var YOUCOACH_SUBSTITUTIONS_SHEET = 'YOUCOACH_SUBSTITUTIONS';
var YOUCOACH_LINEUPS_HEADERS = [
  'Match_ID', 'Player_ID', 'Giocatore', 'Numero', 'Titolare', 'Ordine', 'Fonte'
];
var YOUCOACH_SUBSTITUTIONS_HEADERS = [
  'Match_ID', 'Minuto', 'Recupero', 'Player_Out_ID', 'Giocatore_Out',
  'Player_In_ID', 'Giocatore_In', 'Fonte'
];

function salvaYouCoachLineupsESostituzioni_(matchId, info, playerIdByName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var starters = Array.isArray(info && info.titolari) ? info.titolari : [];
  var reserves = Array.isArray(info && info.riserve) ? info.riserve : [];
  var events = Array.isArray(info && info.eventi) ? info.eventi : [];
  var lineupRows = [];
  var seenPlayers = {};

  starters.concat(reserves).forEach(function(player, index) {
    var playerName = youCoachText_(player && (player.giocatore || player.nome || player.name));
    var playerId = youCoachPlayerId_(player, playerName, playerIdByName);
    if (!playerId) {
      Logger.log('YOUCOACH_LINEUPS: Player_ID non trovato per ' + playerName + ' (' + matchId + ')');
      return;
    }
    if (seenPlayers[playerId]) return;
    seenPlayers[playerId] = true;

    lineupRows.push([
      matchId,
      playerId,
      playerName,
      youCoachNullableInteger_(player && (player.numero || player.numero_maglia || player.jersey_number)),
      index < starters.length,
      youCoachNullableInteger_(player && player.ordine) || index + 1,
      'YOUCOACH'
    ]);
  });

  var substitutionRows = [];
  var seenSubstitutions = {};
  events.forEach(function(event) {
    if (youCoachNormalize_(event && event.tipo) !== 'SUBSTITUTION') return;

    var playerOutName = youCoachText_(event.giocatore || event.giocatore_out || event.player_out);
    var playerInName = youCoachText_(event.giocatore2 || event.giocatore_in || event.player_in);
    var playerOutId = youCoachPlayerId_(event.player_out_data, playerOutName, playerIdByName) ||
      youCoachText_(event.player_out_id);
    var playerInId = youCoachPlayerId_(event.player_in_data, playerInName, playerIdByName) ||
      youCoachText_(event.player_in_id);
    var minute = youCoachNullableInteger_(event.minuto);

    if (!playerOutId || !playerInId || minute === '') {
      Logger.log('YOUCOACH_SUBSTITUTIONS: evento incompleto ignorato per ' + matchId);
      return;
    }

    var key = [matchId, minute, playerOutId, playerInId].join('|');
    if (seenSubstitutions[key]) return;
    seenSubstitutions[key] = true;

    substitutionRows.push([
      matchId,
      minute,
      event.recupero === true || String(event.recupero).toLowerCase() === 'true',
      playerOutId,
      playerOutName,
      playerInId,
      playerInName,
      'YOUCOACH'
    ]);
  });

  youCoachReplaceMatchRows_(spreadsheet, YOUCOACH_LINEUPS_SHEET, YOUCOACH_LINEUPS_HEADERS, matchId, lineupRows);
  youCoachReplaceMatchRows_(spreadsheet, YOUCOACH_SUBSTITUTIONS_SHEET, YOUCOACH_SUBSTITUTIONS_HEADERS, matchId, substitutionRows);
}

function sincronizzaYouCoachLineupsESostituzioniSupabase_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var lineups = youCoachReadObjects_(spreadsheet, YOUCOACH_LINEUPS_SHEET);
  var substitutions = youCoachReadObjects_(spreadsheet, YOUCOACH_SUBSTITUTIONS_SHEET);
  var matchIds = {};

  lineups.forEach(function(row) {
    if (row.Match_ID) matchIds[String(row.Match_ID)] = true;
  });
  substitutions.forEach(function(row) {
    if (row.Match_ID) matchIds[String(row.Match_ID)] = true;
  });

  Object.keys(matchIds).forEach(function(matchId) {
    var lineupPayload = lineups
      .filter(function(row) { return String(row.Match_ID) === matchId; })
      .map(function(row) {
        return {
          match_id: matchId,
          player_id: String(row.Player_ID),
          numero: youCoachNullForSupabase_(row.Numero),
          titolare: row.Titolare === true || String(row.Titolare).toLowerCase() === 'true',
          ordine: youCoachNullForSupabase_(row.Ordine)
        };
      });

    var substitutionPayload = substitutions
      .filter(function(row) { return String(row.Match_ID) === matchId; })
      .map(function(row) {
        return {
          match_id: matchId,
          minuto: Number(row.Minuto),
          recupero: row.Recupero === true || String(row.Recupero).toLowerCase() === 'true',
          player_out_id: String(row.Player_Out_ID),
          player_in_id: String(row.Player_In_ID)
        };
      });

    youCoachSupabaseRequest_('delete', 'match_lineups?match_id=eq.' + encodeURIComponent(matchId));
    if (lineupPayload.length) youCoachSupabaseRequest_('post', 'match_lineups', lineupPayload);

    // La DELETE viene eseguita anche quando la gara non ha sostituzioni.
    youCoachSupabaseRequest_('delete', 'match_substitutions?match_id=eq.' + encodeURIComponent(matchId));
    if (substitutionPayload.length) youCoachSupabaseRequest_('post', 'match_substitutions', substitutionPayload);
  });
}

function youCoachReplaceMatchRows_(spreadsheet, sheetName, headers, matchId, newRows) {
  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  var existing = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];
  var retained = existing.filter(function(row) { return String(row[0]) !== String(matchId); });
  var rows = retained.concat(newRows);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function youCoachReadObjects_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values.shift();
  return values
    .filter(function(row) { return row.some(function(value) { return value !== ''; }); })
    .map(function(row) {
      var object = {};
      headers.forEach(function(header, index) { object[header] = row[index]; });
      return object;
    });
}

function youCoachSupabaseRequest_(method, path, payload) {
  var properties = PropertiesService.getScriptProperties();
  var baseUrl = String(properties.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  var serviceKey = properties.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !serviceKey) throw new Error('Configurare SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nelle Script Properties.');

  var options = {
    method: method,
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      Prefer: 'return=minimal'
    },
    muteHttpExceptions: true
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(baseUrl + '/rest/v1/' + path, options);
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Supabase ' + method.toUpperCase() + ' ' + path + ': ' + status + ' ' + response.getContentText());
  }
}

function youCoachPlayerId_(player, playerName, resolver) {
  var direct = player && (player.player_id || player.Player_ID || player.id_giocatore);
  if (direct) return String(direct).trim();
  if (!playerName || !resolver) return '';
  if (typeof resolver === 'function') return youCoachText_(resolver(playerName));
  return youCoachText_(resolver[youCoachNormalize_(playerName)] || resolver[playerName]);
}

function youCoachNormalize_(value) {
  return youCoachText_(value).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function youCoachText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function youCoachNullableInteger_(value) {
  if (value === null || value === undefined || value === '') return '';
  var match = String(value).match(/-?\d+/);
  return match ? parseInt(match[0], 10) : '';
}

function youCoachNullForSupabase_(value) {
  return value === null || value === undefined || value === '' ? null : Number(value);
}
