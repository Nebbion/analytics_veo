module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[project]/app/api/dashboard/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic,
    "revalidate",
    ()=>revalidate
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabase/server.ts [app-route] (ecmascript)");
;
;
const dynamic = 'force-dynamic';
const revalidate = 0;
const num = (v)=>Number(v ?? 0) || 0;
const per90 = (value, minutes)=>minutes > 0 ? value * 90 / minutes : 0;
async function GET() {
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createClient"])();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Non autenticato.'
        }, {
            status: 401
        });
    }
    // Il profilo utente determina ruolo e Player_ID.
    const { data: profile, error: profileError } = await supabase.from('utenti').select('player_id,nome,email,ruolo,attivo').eq('id', user.id).single();
    if (profileError || !profile) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Profilo utente non configurato.'
        }, {
            status: 403
        });
    }
    if (!profile.attivo) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Utente disattivato.'
        }, {
            status: 403
        });
    }
    if (profile.ruolo !== 'STAFF' && profile.ruolo !== 'GIOCATORE') {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Ruolo utente non valido.'
        }, {
            status: 403
        });
    }
    const isStaff = profile.ruolo === 'STAFF';
    const ownPlayerId = String(profile.player_id ?? '').trim();
    if (!isStaff && !ownPlayerId) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Player_ID non associato al profilo utente.'
        }, {
            status: 403
        });
    }
    // RLS fa già il filtraggio:
    // - STAFF: vede tutti i giocatori e tutte le statistiche
    // - GIOCATORE: vede solo il proprio Player_ID
    const [playersResult, matchesResult, statsResult, seasonResult] = await Promise.all([
        supabase.from('players').select('player_id,nome').order('nome', {
            ascending: true
        }),
        supabase.from('matches').select('match_id,data,partita').order('data', {
            ascending: true
        }),
        supabase.from('player_match_stats').select(`
        match_id, player_id, minuti, gol, gol_per_90, tiri, tiri_per_90,
        passaggi, passaggi_completati, passaggi_percento,
        distanza_km, distanza_km_per_90, sprint, sprint_per_90,
        corse_alta_intensita, corse_alta_intensita_per_90,
        velocita_max_kmh, velocita_media_kmh
      `),
        supabase.from('player_season_stats').select(`
        player_id, presenze, minuti, gol, gol_per_90, tiri, tiri_per_90,
        passaggi, passaggi_per_90, passaggi_completati, passaggi_completati_per_90,
        passaggi_percento, distanza_km, distanza_km_per_90,
        sprint, sprint_per_90, corse_alta_intensita, corse_alta_intensita_per_90,
        velocita_max_kmh, velocita_media_kmh, minuti_per_presenza,
        sprint_per_km, corse_alta_intensita_per_km, gol_per_tiro,
        minuti_per_gol, minuti_per_tiro
      `)
    ]);
    if (playersResult.error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: `Supabase players: ${playersResult.error.message}`
        }, {
            status: 502
        });
    }
    if (matchesResult.error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: `Supabase matches: ${matchesResult.error.message}`
        }, {
            status: 502
        });
    }
    if (statsResult.error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: `Supabase player_match_stats: ${statsResult.error.message}`
        }, {
            status: 502
        });
    }
    if (seasonResult.error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: `Supabase player_season_stats: ${seasonResult.error.message}`
        }, {
            status: 502
        });
    }
    const allPlayers = playersResult.data ?? [];
    const allMatches = matchesResult.data ?? [];
    const allStats = statsResult.data ?? [];
    const allSeason = seasonResult.data ?? [];
    const seasonMap = new Map(allSeason.map((row)=>[
            row.player_id,
            row
        ]));
    if (!isStaff && !allPlayers.some((p)=>p.player_id === ownPlayerId)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Player_ID associato ma non presente nella tabella players.'
        }, {
            status: 403
        });
    }
    const playerNameMap = new Map(allPlayers.map((p)=>[
            p.player_id,
            p.nome
        ]));
    const matchMap = new Map(allMatches.map((m)=>[
            m.match_id,
            m
        ]));
    // Fonte ufficiale delle statistiche stagionali:
    // player_season_stats, sincronizzata da ANALISI_GIOCATORI.
    const allSeasonalPlayers = allPlayers.map((p)=>{
        const s = seasonMap.get(p.player_id);
        return {
            playerId: p.player_id,
            name: p.nome,
            appearances: num(s?.presenze),
            minutes: num(s?.minuti),
            goals: num(s?.gol),
            goalsPer90: num(s?.gol_per_90),
            shots: num(s?.tiri),
            shotsPer90: num(s?.tiri_per_90),
            passes: num(s?.passaggi),
            passesPer90: num(s?.passaggi_per_90),
            completedPasses: num(s?.passaggi_completati),
            completedPassesPer90: num(s?.passaggi_completati_per_90),
            passSuccess: num(s?.passaggi_percento),
            distanceKm: num(s?.distanza_km),
            distancePer90: num(s?.distanza_km_per_90),
            sprints: num(s?.sprint),
            sprintsPer90: num(s?.sprint_per_90),
            highIntensityRuns: num(s?.corse_alta_intensita),
            highIntensityRunsPer90: num(s?.corse_alta_intensita_per_90),
            maxSpeed: num(s?.velocita_max_kmh),
            averageSpeed: num(s?.velocita_media_kmh),
            minutesPerAppearance: num(s?.minuti_per_presenza),
            sprintsPerKm: num(s?.sprint_per_km),
            highIntensityRunsPerKm: num(s?.corse_alta_intensita_per_km),
            goalsPerShot: num(s?.gol_per_tiro),
            minutesPerGoal: num(s?.minuti_per_gol),
            minutesPerShot: num(s?.minuti_per_tiro)
        };
    });
    const allMatchStats = allStats.map((s)=>{
        const match = matchMap.get(s.match_id);
        const minutes = num(s.minuti);
        return {
            matchId: s.match_id,
            date: match?.data ?? '',
            match: match?.partita ?? '',
            playerId: s.player_id,
            playerName: playerNameMap.get(s.player_id) ?? '',
            minutes,
            goals: num(s.gol),
            goalsPer90: num(s.gol_per_90) || per90(num(s.gol), minutes),
            shots: num(s.tiri),
            shotsPer90: num(s.tiri_per_90) || per90(num(s.tiri), minutes),
            passes: num(s.passaggi),
            completedPasses: num(s.passaggi_completati),
            passSuccess: num(s.passaggi_percento),
            distanceKm: num(s.distanza_km),
            distancePer90: num(s.distanza_km_per_90) || per90(num(s.distanza_km), minutes),
            sprints: num(s.sprint),
            sprintsPer90: num(s.sprint_per_90) || per90(num(s.sprint), minutes),
            highIntensityRuns: num(s.corse_alta_intensita),
            highIntensityRunsPer90: num(s.corse_alta_intensita_per_90) || per90(num(s.corse_alta_intensita), minutes),
            maxSpeed: num(s.velocita_max_kmh),
            averageSpeed: num(s.velocita_media_kmh)
        };
    });
    const players = isStaff ? allSeasonalPlayers : allSeasonalPlayers.filter((p)=>p.playerId === ownPlayerId);
    const matches = isStaff ? allMatchStats : allMatchStats.filter((m)=>m.playerId === ownPlayerId);
    // Tutti gli utenti autenticati possono vedere l'elenco delle partite,
    // mentre le statistiche restano filtrate dal ruolo/RLS.
    const teamMatches = allMatches.map((m)=>({
            matchId: m.match_id,
            date: m.data ?? '',
            match: m.partita
        }));
    if (!isStaff && !players.length) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Player_ID non associato ai dati del database.'
        }, {
            status: 403
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        stagione: '2026/2027',
        role: profile.ruolo,
        userName: profile.nome,
        playerId: isStaff ? null : ownPlayerId,
        players,
        matches,
        teamMatches,
        source: 'supabase'
    }, {
        headers: {
            'Cache-Control': 'no-store'
        }
    });
}
}),
"[project]/lib/supabase/server.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
;
;
async function createClient() {
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createServerClient"])(("TURBOPACK compile-time value", "https://eugiddaglmhxqcxvmxom.supabase.co"), ("TURBOPACK compile-time value", "sb_publishable_tr4S8FMeuMVn76G6fIwWaw_kNFTJxih"), {
        cookies: {
            getAll () {
                return cookieStore.getAll();
            },
            setAll (cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options })=>cookieStore.set(name, value, options));
                } catch  {}
            }
        }
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__028r_uj._.js.map