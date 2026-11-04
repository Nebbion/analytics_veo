import { NextResponse } from 'next/server';

const SOURCE_URL = 'https://www.tuttocampo.it/Veneto/PrimaCategoria/GironeE/Classifica';
const RANKING_URL = 'https://www.tuttocampo.it/Web/Views/Rankings/RankingView.php';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

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
  const body = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? '';
  const rows: Standing[] = [];

  for (const match of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(cell => cellText(cell[1]));

    if (cells.length < 11) continue;

    const values = cells.slice(3, 11).map(parseNumber);
    if (!cells[2] || values.some(value => value === null)) continue;

    rows.push({
      position: rows.length + 1,
      team: cells[2],
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
    const pageResponse = await fetch(SOURCE_URL, {
      cache: 'no-store',
      headers: {
        'accept-language': 'it-IT,it;q=0.9',
        'user-agent': USER_AGENT,
      },
    });

    if (!pageResponse.ok) throw new Error(`Pagina classifica non disponibile (${pageResponse.status})`);

    const pageHtml = await pageResponse.text();
    const token = pageHtml.match(/var\s+tckk='([^']+)'/)?.[1];
    const sessionCookie = pageResponse.headers.get('set-cookie')?.match(/PHPSESSID=[^;,]+/)?.[0];

    if (!token || !sessionCookie) throw new Error('Sessione Tuttocampo non disponibile');

    const rankingUrl = new URL(RANKING_URL);
    rankingUrl.searchParams.set('tckk', token);
    rankingUrl.searchParams.set('v', '1');
    rankingUrl.searchParams.set('category_id', 'VE.1.E');
    rankingUrl.searchParams.set('total', 'true');
    rankingUrl.searchParams.set('is_ranking_tab', 'true');

    const rankingResponse = await fetch(rankingUrl, {
      cache: 'no-store',
      headers: {
        'accept-language': 'it-IT,it;q=0.9',
        cookie: sessionCookie,
        referer: SOURCE_URL,
        'user-agent': USER_AGENT,
        'x-requested-with': 'XMLHttpRequest',
      },
    });

    if (!rankingResponse.ok) throw new Error(`Dati classifica non disponibili (${rankingResponse.status})`);

    const rows = parseStandings(await rankingResponse.text());
    if (!rows.length) throw new Error('Nessuna riga valida nella classifica');

    return NextResponse.json({
      competition: 'Prima Categoria - Girone E',
      updatedAt: new Date().toISOString(),
      sourceUrl: SOURCE_URL,
      rows,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Classifica momentaneamente non disponibile',
      sourceUrl: SOURCE_URL,
    }, { status: 502 });
  }
}
