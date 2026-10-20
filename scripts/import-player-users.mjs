import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const csvFlagIndex = process.argv.indexOf('--csv');
const csvPath = csvFlagIndex >= 0 ? process.argv[csvFlagIndex + 1] : '';
const apply = args.has('--apply');

if (!csvPath) throw new Error('Uso: node scripts/import-player-users.mjs --csv <file.csv> [--apply]');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const initialPassword = process.env.INITIAL_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatorie.');
}
if (apply && !initialPassword) throw new Error('INITIAL_PASSWORD è obbligatoria con --apply.');

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (quoted && character === '"' && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

const clean = value => String(value ?? '').trim();
const normalize = value => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const nameKey = value => normalize(value).split(' ').filter(Boolean).sort().join('|');
const maskEmail = email => {
  const [local, domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${local.length > 2 ? '***' : ''}@${domain}`;
};

const csvRows = parseCsv((await readFile(csvPath, 'utf8')).replace(/^\uFEFF/, ''));
const headers = csvRows.shift()?.map(clean) ?? [];
const column = name => headers.findIndex(header => normalize(header) === normalize(name));
const firstNameIndex = column('Nome');
const lastNameIndex = column('Cognome');
const emailIndex = column('Email');

if ([firstNameIndex, lastNameIndex, emailIndex].some(index => index < 0)) {
  throw new Error(`Colonne richieste non trovate. Trovate: ${headers.join(', ')}`);
}

const inputRows = csvRows.map((values, index) => ({
  csvRow: index + 2,
  firstName: clean(values[firstNameIndex]),
  lastName: clean(values[lastNameIndex]),
  email: clean(values[emailIndex]).toLowerCase(),
}));

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const [{ data: players, error: playersError }, { data: profiles, error: profilesError }] = await Promise.all([
  supabase.from('players').select('player_id,nome'),
  supabase.from('utenti').select('id,player_id,nome,email,ruolo,attivo'),
]);
if (playersError) throw new Error(`Lettura players: ${playersError.message}`);
if (profilesError) throw new Error(`Lettura utenti: ${profilesError.message}`);

const authUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`Lettura Auth users: ${error.message}`);
  authUsers.push(...data.users);
  if (data.users.length < 1000) break;
}

const playersByName = new Map();
for (const player of players ?? []) {
  const key = nameKey(player.nome);
  const matches = playersByName.get(key) ?? [];
  matches.push(player);
  playersByName.set(key, matches);
}

const authByEmail = new Map(authUsers.map(user => [clean(user.email).toLowerCase(), user]));
const profileByEmail = new Map((profiles ?? []).map(profile => [clean(profile.email).toLowerCase(), profile]));
const seenEmails = new Set();
const plan = inputRows.map(input => {
  const emailDuplicate = seenEmails.has(input.email);
  seenEmails.add(input.email);
  const candidates = playersByName.get(nameKey(`${input.firstName} ${input.lastName}`)) ?? [];
  const authUser = authByEmail.get(input.email);
  const profile = profileByEmail.get(input.email);
  return { ...input, emailDuplicate, candidates, authUser, profile };
});

const invalid = plan.filter(item =>
  !item.firstName || !item.lastName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.email) ||
  item.emailDuplicate || item.candidates.length !== 1
);

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  csvRows: plan.length,
  playersInDatabase: players?.length ?? 0,
  existingAuthUsers: authUsers.length,
  existingProfiles: profiles?.length ?? 0,
  ready: plan.length - invalid.length,
  invalid: invalid.map(item => ({
    csvRow: item.csvRow,
    name: `${item.firstName} ${item.lastName}`.trim(),
    email: maskEmail(item.email),
    reason: item.emailDuplicate
      ? 'email duplicata nel CSV'
      : item.candidates.length === 0
        ? 'atleta non trovato in players'
        : item.candidates.length > 1
          ? 'nome atleta ambiguo in players'
          : 'dati obbligatori non validi',
  })),
  existing: plan.filter(item => item.authUser || item.profile).map(item => ({
    csvRow: item.csvRow,
    name: `${item.firstName} ${item.lastName}`,
    email: maskEmail(item.email),
    auth: Boolean(item.authUser),
    profile: Boolean(item.profile),
  })),
}, null, 2));

if (invalid.length) {
  throw new Error(`Importazione interrotta: ${invalid.length} righe non sono associabili in modo sicuro.`);
}
if (!apply) process.exit(0);

const results = [];
for (const item of plan) {
  const player = item.candidates[0];
  let authUser = item.authUser;
  let created = false;

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: item.email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        role: 'GIOCATORE',
        player_id: player.player_id,
        name: player.nome,
      },
    });
    if (error || !data.user) {
      results.push({ csvRow: item.csvRow, email: maskEmail(item.email), status: 'error', detail: error?.message ?? 'utente non creato' });
      continue;
    }
    authUser = data.user;
    created = true;
  }

  const { error: profileError } = await supabase.from('utenti').upsert({
    id: authUser.id,
    player_id: player.player_id,
    nome: player.nome,
    email: item.email,
    ruolo: 'GIOCATORE',
    attivo: true,
  }, { onConflict: 'id' });

  if (profileError) {
    if (created) await supabase.auth.admin.deleteUser(authUser.id);
    results.push({ csvRow: item.csvRow, email: maskEmail(item.email), status: 'error', detail: `profilo: ${profileError.message}` });
    continue;
  }

  results.push({
    csvRow: item.csvRow,
    email: maskEmail(item.email),
    status: created ? 'created' : 'existing-linked',
    playerId: player.player_id,
  });
}

const summary = results.reduce((counts, result) => {
  counts[result.status] = (counts[result.status] ?? 0) + 1;
  return counts;
}, {});
console.log(JSON.stringify({ summary, results }, null, 2));

if (results.some(result => result.status === 'error')) process.exitCode = 1;
