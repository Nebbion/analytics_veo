'use client';

import { useMemo, useState } from 'react';
import { championshipCalendar, type ChampionshipCalendarLeg } from '../lib/championship-calendar';

type CalendarMatch = {
  matchId: string;
  date: string;
  competition: 'CAMPIONATO' | 'COPPA';
  result: string;
  outcome: 'V' | 'N' | 'P' | null;
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
  const playedByDate = useMemo(() => new Map(
    matches
      .filter(match => match.competition === 'CAMPIONATO')
      .map(match => [match.date, match]),
  ), [matches]);
  const fixtures = championshipCalendar.filter(fixture => fixture.leg === leg);
  const nextFixture = championshipCalendar
    .filter(fixture => !playedByDate.has(fixture.date) && fixture.date >= today)
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
        const playedMatch = playedByDate.get(fixture.date);
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
