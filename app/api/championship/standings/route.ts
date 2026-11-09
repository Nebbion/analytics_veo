import { NextResponse } from 'next/server';

const SOURCE_URL = 'https://www.asdvba.it/campionati0gironigiornatepartite_classifica.php?idgirone=16';
const USER_AGENT = 'Mozilla/5.0 (compatible; VillanoveseAnalytics/1.0)';

type Standing = {
  position: number;
  team: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

const decodeHtml = (value: string) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const cellText = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim();

const parseNumber = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseStandings = (html: string): Standing[] => {
  const table = html.match(/<table\b[^>]*class="[^"]*tabella-campionati[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? '';
  const rows: Standing[] = [];

  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(cell => cellText(cell[1]));

    if (cells.length < 10) continue;

    const values = cells.slice(2, 10).map(parseNumber);
    if (!cells[1] || values.some(value => value === null)) continue;

    rows.push({
      position: rows.length + 1,
      team: cells[1],
      points: values[0]!,
      played: values[1]!,
      wins: values[2]!,
      draws: values[3]!,
      losses: values[4]!,
      goalsFor: values[5]!,
      goalsAgainst: values[6]!,
      goalDifference: values[7]!,
    });
  }

  return rows;
};

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      cache: 'no-store',
      headers: { 'user-agent': USER_AGENT },
    });

    if (!response.ok) throw new Error(`Fonte classifica non disponibile (${response.status})`);

    const html = await response.text();
    const rows = parseStandings(html);
    if (!rows.length) throw new Error('Nessuna riga valida nella classifica');

    const matchday = Number(html.match(/classifica completa\s+(\d+)(?:&deg;|°)/i)?.[1] ?? 0) || null;

    return NextResponse.json({
      competition: 'Prima Categoria - Girone E',
      matchday,
      updatedAt: new Date().toISOString(),
      sourceUrl: SOURCE_URL,
      rows,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=86400' },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Classifica momentaneamente non disponibile',
      sourceUrl: SOURCE_URL,
    }, { status: 502 });
  }
}
