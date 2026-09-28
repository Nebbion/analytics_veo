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
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
const num = (v)=>Number(v ?? 0) || 0;
async function GET() {
    const url = process.env.DASHBOARD_API_URL;
    if (!url) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'DASHBOARD_API_URL non configurata.'
        }, {
            status: 500
        });
    }
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                Accept: 'application/json'
            }
        });
        if (!response.ok) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: `API Google Apps Script: HTTP ${response.status}`
            }, {
                status: 502
            });
        }
        const raw = await response.json();
        const players = (raw.players ?? []).map((p)=>{
            const minutes = num(p.Minuti);
            const per90 = (value)=>minutes > 0 ? num(value) * 90 / minutes : 0;
            return {
                playerId: String(p.Player_ID ?? ''),
                name: String(p.Giocatore ?? ''),
                appearances: num(p.Presenze),
                minutes,
                goals: num(p.Gol),
                goalsPer90: per90(p.Gol),
                shots: num(p.Tiri),
                shotsPer90: per90(p.Tiri),
                passes: num(p.Passaggi),
                completedPasses: num(p.Passaggi_Completati),
                passSuccess: num(p['Passaggi_%']),
                distanceKm: num(p.Distanza_km),
                distancePer90: per90(p.Distanza_km),
                sprints: num(p.Sprint),
                sprintsPer90: per90(p.Sprint),
                highIntensityRuns: num(p.Corse_Alta_Intensita),
                highIntensityRunsPer90: per90(p.Corse_Alta_Intensita),
                maxSpeed: num(p.Velocita_Max_kmh),
                averageSpeed: num(p.Velocita_Media_kmh),
                minutesPerAppearance: num(p.Presenze) > 0 ? minutes / num(p.Presenze) : 0
            };
        });
        const matches = (raw.matches ?? []).map((m)=>({
                matchId: String(m.Match_ID ?? ''),
                date: String(m.Data ?? ''),
                match: String(m.Partita ?? ''),
                playerId: String(m.Player_ID ?? ''),
                playerName: String(m.Giocatore ?? ''),
                minutes: num(m.Minuti),
                goals: num(m.Gol),
                goalsPer90: num(m.Gol_per_90),
                shots: num(m.Tiri),
                shotsPer90: num(m.Tiri_per_90),
                passes: num(m.Passaggi),
                completedPasses: num(m.Passaggi_Completati),
                passSuccess: num(m['Passaggi_%']),
                distanceKm: num(m.Distanza_km),
                distancePer90: num(m.Distanza_km_per_90),
                sprints: num(m.Sprint),
                sprintsPer90: num(m.Sprint_per_90),
                highIntensityRuns: num(m.Corse_Alta_Intensita),
                highIntensityRunsPer90: num(m.Corse_Alta_Intensita_per_90),
                maxSpeed: num(m.Velocita_Max_kmh),
                averageSpeed: num(m.Velocita_Media_kmh)
            }));
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            stagione: raw.stagione ?? '2026/2027',
            players,
            matches
        }, {
            headers: {
                'Cache-Control': 'no-store'
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: message
        }, {
            status: 502
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__01z1w-w._.js.map