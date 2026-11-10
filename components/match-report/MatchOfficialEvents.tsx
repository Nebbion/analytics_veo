import type { MatchReportEvent } from '../../lib/match-report/types';

const eventClass = {
  goal: 'goal',
  concededGoal: 'concededGoal',
  assist: 'assist',
  yellowCard: 'yellow',
  redCard: 'red',
};

export function MatchOfficialEvents({ events }: { events: MatchReportEvent[] }) {
  const hasTimeline = events.some(event => event.minute !== null);

  return <section className="panel reportSection">
    <div className="sectionTitle"><div><span className="eyebrow">EVENTI</span><h2>Eventi ufficiali</h2></div><span>{events.length ? hasTimeline ? 'cronologia YouCoach' : 'totali disponibili' : '—'}</span></div>
    {events.length ? <div className="officialEvents">
      {events.map((event, index) => <div className={`officialEvent ${eventClass[event.type]}`} key={`${event.type}-${event.playerId}-${index}`}>
        <span>{event.minute !== null ? `${event.minute}'${event.injuryTime ? ' rec.' : ''}` : '—'}</span>
        <strong>{event.value > 1 ? `${event.value}× ` : ''}{event.label}</strong>
        <p>{event.jerseyNumber !== null ? `#${event.jerseyNumber} ` : ''}{event.playerName}</p>
        {event.type === 'goal' && event.relatedPlayerName ? <p className="officialEventAssist">
          Assist: {event.relatedJerseyNumber !== null ? `#${event.relatedJerseyNumber} ` : ''}{event.relatedPlayerName}
        </p> : null}
      </div>)}
    </div> : <p className="reportEmpty">Nessun evento ufficiale dettagliabile con i dati disponibili.</p>}
  </section>;
}
