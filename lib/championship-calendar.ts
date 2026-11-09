export type ChampionshipCalendarLeg = 'ANDATA' | 'RITORNO';

export type ChampionshipCalendarFixture = {
  matchday: number;
  leg: ChampionshipCalendarLeg;
  date: string;
  opponent: string;
  home: boolean;
  kickoffTime: string | null;
};

type CalendarRound = {
  matchday: number;
  opponent: string;
  firstLegDate: string;
  firstLegHome: boolean;
  secondLegDate: string;
};

const rounds: CalendarRound[] = [
  { matchday: 1, opponent: 'Polisportiva Real Terme', firstLegDate: '2026-09-13', firstLegHome: false, secondLegDate: '2027-01-10' },
  { matchday: 2, opponent: 'Union River', firstLegDate: '2026-09-20', firstLegHome: true, secondLegDate: '2027-01-17' },
  { matchday: 3, opponent: 'Pettorazza San Martino', firstLegDate: '2026-09-27', firstLegHome: false, secondLegDate: '2027-01-24' },
  { matchday: 4, opponent: 'Bocar Juniors ARL', firstLegDate: '2026-10-04', firstLegHome: true, secondLegDate: '2027-01-31' },
  { matchday: 5, opponent: 'Spes Pojana', firstLegDate: '2026-10-11', firstLegHome: false, secondLegDate: '2027-02-07' },
  { matchday: 6, opponent: 'Due Stelle A.S.D.', firstLegDate: '2026-10-18', firstLegHome: true, secondLegDate: '2027-02-14' },
  { matchday: 7, opponent: 'Rivereel Sossano', firstLegDate: '2026-10-25', firstLegHome: false, secondLegDate: '2027-02-21' },
  { matchday: 8, opponent: 'Virtus Bagnoli Arre ASD', firstLegDate: '2026-11-01', firstLegHome: true, secondLegDate: '2027-02-28' },
  { matchday: 9, opponent: 'Turchese', firstLegDate: '2026-11-08', firstLegHome: false, secondLegDate: '2027-03-07' },
  { matchday: 10, opponent: 'Azzurra Due Carrare', firstLegDate: '2026-11-15', firstLegHome: true, secondLegDate: '2027-03-14' },
  { matchday: 11, opponent: 'Montagnana', firstLegDate: '2026-11-22', firstLegHome: false, secondLegDate: '2027-03-21' },
  { matchday: 12, opponent: 'PSN Legnaro Polverara', firstLegDate: '2026-11-29', firstLegHome: false, secondLegDate: '2027-04-04' },
  { matchday: 13, opponent: 'Scardovari', firstLegDate: '2026-12-06', firstLegHome: true, secondLegDate: '2027-04-11' },
  { matchday: 14, opponent: 'Altopolesine', firstLegDate: '2026-12-13', firstLegHome: false, secondLegDate: '2027-04-18' },
  { matchday: 15, opponent: 'Fiessese', firstLegDate: '2026-12-20', firstLegHome: true, secondLegDate: '2027-04-25' },
];

const kickoffTime = (date: string) => date >= '2026-10-25' && date <= '2027-03-21' ? '14:30' : null;

export const championshipCalendar: ChampionshipCalendarFixture[] = rounds.flatMap(round => [
  {
    matchday: round.matchday,
    leg: 'ANDATA',
    date: round.firstLegDate,
    opponent: round.opponent,
    home: round.firstLegHome,
    kickoffTime: kickoffTime(round.firstLegDate),
  },
  {
    matchday: round.matchday,
    leg: 'RITORNO',
    date: round.secondLegDate,
    opponent: round.opponent,
    home: !round.firstLegHome,
    kickoffTime: kickoffTime(round.secondLegDate),
  },
]);
