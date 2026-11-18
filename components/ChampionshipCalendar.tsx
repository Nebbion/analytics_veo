'use client';

import { useMemo, useState } from 'react';
import { championshipCalendar, type ChampionshipCalendarLeg } from '../lib/championship-calendar';

type CalendarMatch = {
  matchId: string;
  date: string;
  match: string;
  competition: 'CAMPIONATO' | 'COPPA';
  result: string;
  outcome: 'V' | 'N' | 'P' | null;
};

const fixtureKey = (leg: ChampionshipCalendarLeg, matchday: number) => `${leg}-${matchday}`;

const normalizedDate = (value: string) => {
  const date = String(value || '').trim();
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const italian = date.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (!italian) return '';
  return `${italian[3]}-${italian[2].padStart(2, '0')}-${italian[1].padStart(2, '0')}`;
};

const normalizedName = (value: string) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toLowerCase();

const dateDistance = (first: string, second: string) => {
  const firstTime = Date.parse(`${first}T12:00:00Z`);
  const secondTime = Date.parse(`${second}T12:00:00Z`);
  return Number.isFinite(firstTime) && Number.isFinite(secondTime)
    ? Math.abs(firstTime - secondTime) / 86_400_000
    : Number.POSITIVE_INFINITY;
};

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: '2-digit',
});

export function ChampionshipCalendar({ matches }: { matches: CalendarMatch[] }) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [leg, setLeg] = useState<ChampionshipCalendarLeg>(today > '2026-12-20' ? 'RITORNO' : 'ANDATA');
  const playedByFixture = useMemo(() => {
    const championshipMatches = matches.filter(match => match.competition === 'CAMPIONATO');
    const resolved = new Map<string, CalendarMatch>();
    const usedMatchIds = new Set<string>();

    championshipCalendar.forEach(fixture => {
      const available = championshipMatches.filter(match => !usedMatchIds.has(match.matchId));
      const exactDate = available.find(match => normalizedDate(match.date) === fixture.date);
      const opponent = normalizedName(fixture.opponent);
      const matchingOpponent = available
        .filter(match => normalizedName(match.match).includes(opponent))
        .map(match => ({ match, distance: dateDistance(normalizedDate(match.date), fixture.date) }))
        .filter(candidate => candidate.distance <= 7)
        .sort((a, b) => a.distance - b.distance)[0]?.match;
      const playedMatch = exactDate ?? matchingOpponent;

      if (playedMatch) {
        resolved.set(fixtureKey(fixture.leg, fixture.matchday), playedMatch);
        usedMatchIds.add(playedMatch.matchId);
      }
    });

    return resolved;
  }, [matches]);
  const fixtures = championshipCalendar.filter(fixture => fixture.leg === leg);
  const nextFixture = championshipCalendar
    .filter(fixture => !playedByFixture.has(fixtureKey(fixture.leg, fixture.matchday)) && fixture.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return <section className="panel tablePanel championshipCalendarPanel">
    <div className="sectionTitle championshipCalendarTitle">
      <div><span className="eyebrow">CALENDARIO</span><h2>Partite di campionato</h2></div>
      <div className="calendarLegControl" role="group" aria-label="Fase del campionato">
        <button className={leg === 'ANDATA' ? 'active' : ''} onClick={() => setLeg('ANDATA')}>Andata</button>
        <button className={leg === 'RITORNO' ? 'active' : ''} onClick={() => setLeg('RITORNO')}>Ritorno</button>
      </div>
    </div>

    <div className="championshipCalendarRows">
      {fixtures.map(fixture => {
        const playedMatch = playedByFixture.get(fixtureKey(fixture.leg, fixture.matchday));
        const isNext = fixture === nextFixture;

        return <div className={`championshipCalendarRow ${isNext ? 'nextFixture' : ''}`} key={`${fixture.leg}-${fixture.matchday}`}>
          <span className="calendarMatchday">{fixture.matchday}<small>{fixture.leg === 'ANDATA' ? 'A' : 'R'}</small></span>
          <div className="calendarDate"><strong>{dateLabel(fixture.date)}</strong>{fixture.kickoffTime && <small>ore {fixture.kickoffTime}</small>}</div>
          <span className={`calendarVenue ${fixture.home ? 'home' : 'away'}`}>{fixture.home ? 'Casa' : 'Trasferta'}</span>
          <strong className="calendarOpponent">{fixture.opponent}</strong>
          <div className="calendarOutcome">
            {playedMatch?.result
              ? <span className={`calendarResult result${playedMatch.outcome ?? ''}`}>{playedMatch.result}</span>
              : isNext ? <span className="calendarNextLabel">Prossima</span> : <span className="calendarPending">-</span>}
            {playedMatch && <a href={`/matches/${encodeURIComponent(playedMatch.matchId)}`}>Report</a>}
          </div>
        </div>;
      })}
    </div>

    <div className="calendarFootnote"><span>Orario 14:30 dal 25 ottobre al 21 marzo</span><span>Casa: Campo comunale Enzo Carlo Pezzuolo</span></div>
  </section>;
}
