import { FormEvent, useEffect, useMemo, useState } from "react";

type MatchId = "czech" | "mexico" | "south-africa";

type Match = {
  id: MatchId;
  title: string;
  opponent: string;
  order: number;
};

type Ticket = {
  id: string;
  matchId: MatchId;
  name: string;
  koreaScore: number;
  opponentScore: number;
  createdAt: string;
};

type Result = {
  matchId: MatchId;
  koreaScore: number;
  opponentScore: number;
  confirmedAt: string;
};

type AppState = {
  tickets: Ticket[];
  results: Partial<Record<MatchId, Result>>;
};

type MatchSummary = {
  carryIn: number;
  currentPot: number;
  totalPot: number;
  winners: Ticket[];
  share: number;
  remainder: number;
  result?: Result;
};

const STORAGE_KEY = "worldcup-toto-state-v1";
const SECRET_MODE_KEY = "worldcup-toto-secret-mode-v1";
const BET_AMOUNT = 10_000;
const MAX_TICKETS_PER_MATCH = 20;

const MATCHES: Match[] = [
  {
    id: "czech",
    title: "대한민국 vs 체코",
    opponent: "체코",
    order: 1,
  },
  {
    id: "mexico",
    title: "대한민국 vs 멕시코",
    opponent: "멕시코",
    order: 2,
  },
  {
    id: "south-africa",
    title: "대한민국 vs 남아프리카공화국",
    opponent: "남아프리카공화국",
    order: 3,
  },
];

const initialState: AppState = {
  tickets: [],
  results: {},
};

function createTicketId() {
  return `ticket-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function readStoredState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return initialState;
    }

    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.tickets) || !parsed.results) {
      return initialState;
    }

    return parsed;
  } catch {
    return initialState;
  }
}

function readStoredSecretMode() {
  try {
    return window.localStorage.getItem(SECRET_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

function getTicketsForMatch(state: AppState, matchId: MatchId) {
  return state.tickets.filter((ticket) => ticket.matchId === matchId);
}

function getWinners(tickets: Ticket[], result?: Result) {
  if (!result) {
    return [];
  }

  return tickets.filter(
    (ticket) =>
      ticket.koreaScore === result.koreaScore &&
      ticket.opponentScore === result.opponentScore,
  );
}

function getCarryIntoMatch(state: AppState, targetMatchId: MatchId) {
  let carried = 0;

  for (const match of MATCHES) {
    if (match.id === targetMatchId) {
      return carried;
    }

    const result = state.results[match.id];
    const tickets = getTicketsForMatch(state, match.id);
    const pot = carried + tickets.length * BET_AMOUNT;
    const winners = getWinners(tickets, result);

    if (!result) {
      continue;
    }

    carried = winners.length > 0 ? 0 : pot;
  }

  return carried;
}

function getMatchSummary(state: AppState, matchId: MatchId): MatchSummary {
  const tickets = getTicketsForMatch(state, matchId);
  const result = state.results[matchId];
  const winners = getWinners(tickets, result);
  const carryIn = getCarryIntoMatch(state, matchId);
  const currentPot = tickets.length * BET_AMOUNT;
  const totalPot = carryIn + currentPot;
  const share = winners.length > 0 ? Math.floor(totalPot / winners.length) : 0;
  const remainder = winners.length > 0 ? totalPot % winners.length : 0;

  return {
    carryIn,
    currentPot,
    totalPot,
    winners,
    share,
    remainder,
    result,
  };
}

function getFinalReserve(state: AppState) {
  const lastMatch = MATCHES[MATCHES.length - 1];
  const summary = getMatchSummary(state, lastMatch.id);

  if (!summary.result || summary.winners.length > 0) {
    return 0;
  }

  return summary.totalPot;
}

function parseScoreValue(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function App() {
  const logoUrl = `${import.meta.env.BASE_URL}plax-logo.png`;
  const [state, setState] = useState<AppState>(readStoredState);
  const [selectedMatchId, setSelectedMatchId] = useState<MatchId>("czech");
  const [isSecretMode, setIsSecretMode] = useState(readStoredSecretMode);
  const [isWriting, setIsWriting] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [name, setName] = useState("");
  const [koreaScore, setKoreaScore] = useState("0");
  const [opponentScore, setOpponentScore] = useState("0");
  const [formError, setFormError] = useState("");
  const [resultKoreaScore, setResultKoreaScore] = useState("0");
  const [resultOpponentScore, setResultOpponentScore] = useState("0");
  const [resultError, setResultError] = useState("");
  const [latestTicketId, setLatestTicketId] = useState<string | null>(null);

  const selectedMatch = MATCHES.find((match) => match.id === selectedMatchId)!;
  const selectedTickets = useMemo(
    () => getTicketsForMatch(state, selectedMatchId),
    [state, selectedMatchId],
  );
  const summary = useMemo(
    () => getMatchSummary(state, selectedMatchId),
    [state, selectedMatchId],
  );
  const finalReserve = useMemo(() => getFinalReserve(state), [state]);
  const totalTickets = state.tickets.length;
  const isMatchFull = selectedTickets.length >= MAX_TICKETS_PER_MATCH;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    window.localStorage.setItem(SECRET_MODE_KEY, String(isSecretMode));
  }, [isSecretMode]);

  useEffect(() => {
    const result = state.results[selectedMatchId];
    setResultKoreaScore(result ? String(result.koreaScore) : "0");
    setResultOpponentScore(result ? String(result.opponentScore) : "0");
    setResultError("");
    setFormError("");
    setIsWriting(false);
    setIsDropping(false);
  }, [selectedMatchId, state.results]);

  useEffect(() => {
    if (!latestTicketId) {
      return;
    }

    const timer = window.setTimeout(() => setLatestTicketId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [latestTicketId]);

  function resetPaper() {
    setName("");
    setKoreaScore("0");
    setOpponentScore("0");
    setFormError("");
  }

  function handleOpenPaper() {
    resetPaper();
    setIsWriting(true);
  }

  function handleTicketSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const parsedKoreaScore = parseScoreValue(koreaScore);
    const parsedOpponentScore = parseScoreValue(opponentScore);
    const isDuplicate = selectedTickets.some(
      (ticket) => ticket.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (isMatchFull) {
      setFormError("이 경기는 최대 20명까지만 참여할 수 있어요.");
      return;
    }

    if (!trimmedName) {
      setFormError("이름을 적어주세요.");
      return;
    }

    if (parsedKoreaScore === null || parsedOpponentScore === null) {
      setFormError("점수는 0 이상의 숫자로 입력해주세요.");
      return;
    }

    if (isDuplicate) {
      setFormError("이 경기는 이미 같은 이름으로 투표했어요.");
      return;
    }

    const ticket: Ticket = {
      id: createTicketId(),
      matchId: selectedMatchId,
      name: trimmedName,
      koreaScore: parsedKoreaScore,
      opponentScore: parsedOpponentScore,
      createdAt: new Date().toISOString(),
    };

    setIsDropping(true);
    window.setTimeout(() => {
      setState((current) => ({
        ...current,
        tickets: [...current.tickets, ticket],
      }));
      setLatestTicketId(ticket.id);
      setIsDropping(false);
      setIsWriting(false);
      resetPaper();
    }, 620);
  }

  function handleResultSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedKoreaScore = parseScoreValue(resultKoreaScore);
    const parsedOpponentScore = parseScoreValue(resultOpponentScore);

    if (parsedKoreaScore === null || parsedOpponentScore === null) {
      setResultError("결과 점수는 0 이상의 숫자로 입력해주세요.");
      return;
    }

    setState((current) => ({
      ...current,
      results: {
        ...current.results,
        [selectedMatchId]: {
          matchId: selectedMatchId,
          koreaScore: parsedKoreaScore,
          opponentScore: parsedOpponentScore,
          confirmedAt: new Date().toISOString(),
        },
      },
    }));
    setResultError("");
  }

  function handleDeleteTicket(ticket: Ticket) {
    const confirmed = window.confirm(`${ticket.name}님의 쪽지를 삭제할까요?`);

    if (!confirmed) {
      return;
    }

    setState((current) => ({
      ...current,
      tickets: current.tickets.filter((item) => item.id !== ticket.id),
    }));
    setLatestTicketId((current) => (current === ticket.id ? null : current));
    setFormError("");
  }

  function handleResetMatch() {
    const confirmed = window.confirm(
      `${selectedMatch.title}의 투표와 결과를 모두 지울까요?`,
    );

    if (!confirmed) {
      return;
    }

    setState((current) => {
      const nextResults = { ...current.results };
      delete nextResults[selectedMatchId];

      return {
        tickets: current.tickets.filter(
          (ticket) => ticket.matchId !== selectedMatchId,
        ),
        results: nextResults,
      };
    });
  }

  function handleResetAll() {
    const confirmed = window.confirm("모든 경기의 투표와 결과를 지울까요?");

    if (!confirmed) {
      return;
    }

    setState(initialState);
    resetPaper();
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="titleBlock">
          <img className="companyLogo" src={logoUrl} alt="PLAX" />
          <p className="eyebrow">Office World Cup Pool</p>
          <h1>월드컵 스코어 쪽지함</h1>
        </div>
        <div className="topActions">
          <button
            aria-pressed={isSecretMode}
            className={`secretToggle ${isSecretMode ? "active" : ""}`}
            onClick={() => setIsSecretMode((current) => !current)}
            type="button"
          >
            <span className="toggleTrack">
              <span className="toggleKnob" />
            </span>
            <span>
              <strong>비밀투표</strong>
              <em>{isSecretMode ? "이름만 보기" : "점수까지 보기"}</em>
            </span>
          </button>
          <div className="topStats" aria-label="전체 투표 현황">
            <span>{totalTickets}장</span>
            <strong>{formatWon(totalTickets * BET_AMOUNT)}</strong>
          </div>
        </div>
      </header>

      <nav className="matchTabs" aria-label="경기 선택">
        {MATCHES.map((match) => {
          const matchSummary = getMatchSummary(state, match.id);
          const isActive = match.id === selectedMatchId;
          const isFinished = Boolean(matchSummary.result);

          return (
            <button
              className={`matchTab ${isActive ? "active" : ""}`}
              key={match.id}
              onClick={() => setSelectedMatchId(match.id)}
              type="button"
            >
              <span>{match.order}경기</span>
              <strong>{match.title}</strong>
              <em>{isFinished ? "결과 확정" : `${getTicketsForMatch(state, match.id).length}장`}</em>
            </button>
          );
        })}
      </nav>

      <section className="scoreboard">
        <div className="scoreTitle">
          <span>대한민국</span>
          <strong>VS</strong>
          <span>{selectedMatch.opponent}</span>
        </div>
        <div className="scoreMeta">
          <span>1인 1표</span>
          <span>투표지 1장 {formatWon(BET_AMOUNT)}</span>
          <span>최대 {MAX_TICKETS_PER_MATCH}명</span>
        </div>
      </section>

      <section className="playArea" aria-label={`${selectedMatch.title} 운영 화면`}>
        <div className="paperStage">
          <div className="stageHeader">
            <div>
              <p className="sectionLabel">투표함</p>
              <h2>
                {selectedTickets.length}/{MAX_TICKETS_PER_MATCH}명의 쪽지
              </h2>
            </div>
            <button
              className="primaryButton"
              disabled={isMatchFull}
              onClick={handleOpenPaper}
              type="button"
            >
              작성하기
            </button>
          </div>

          <div className="glassBox" aria-label="투명 쪽지함">
            <div className="notePile">
              {selectedTickets.length === 0 ? (
                <div className="emptyBox">
                  첫 쪽지를 기다리는 중
                  <small>최대 {MAX_TICKETS_PER_MATCH}명까지 한 칸씩 펼쳐져요.</small>
                </div>
              ) : (
                selectedTickets.map((ticket) => (
                  <article
                    aria-label={
                      isSecretMode
                        ? `${ticket.name}의 비밀 투표지`
                        : `${ticket.name} ${ticket.koreaScore} 대 ${ticket.opponentScore}`
                    }
                    className={`foldedNote ${isSecretMode ? "secretNote" : ""} ${
                      latestTicketId === ticket.id ? "newNote" : ""
                    }`}
                    key={ticket.id}
                  >
                    <span>{ticket.name}</span>
                    {isSecretMode ? null : (
                      <strong>
                        {ticket.koreaScore} : {ticket.opponentScore}
                      </strong>
                    )}
                    <button
                      aria-label={`${ticket.name} 쪽지 삭제`}
                      className="deleteNoteButton"
                      onClick={() => handleDeleteTicket(ticket)}
                      title="삭제"
                      type="button"
                    >
                      ×
                    </button>
                  </article>
                ))
              )}
            </div>
          </div>

          {isWriting ? (
            <form
              className={`paperEditor ${isDropping ? "dropPaper" : ""}`}
              onSubmit={handleTicketSubmit}
            >
              <div className="paperClip" />
              <p className="paperMatch">{selectedMatch.title}</p>
              <label>
                <span>이름</span>
                <input
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  placeholder="이름 작성"
                  type="text"
                  value={name}
                />
              </label>
              <div className="scoreInputs">
                <label>
                  <span>대한민국</span>
                  <input
                    inputMode="numeric"
                    min="0"
                    onChange={(event) => setKoreaScore(event.target.value)}
                    type="number"
                    value={koreaScore}
                  />
                </label>
                <b>:</b>
                <label>
                  <span>{selectedMatch.opponent}</span>
                  <input
                    inputMode="numeric"
                    min="0"
                    onChange={(event) => setOpponentScore(event.target.value)}
                    type="number"
                    value={opponentScore}
                  />
                </label>
              </div>
              {formError ? <p className="formError">{formError}</p> : null}
              <div className="paperActions">
                <button className="ghostButton" onClick={() => setIsWriting(false)} type="button">
                  닫기
                </button>
                <button className="stampButton" disabled={isDropping} type="submit">
                  쪽지 넣기
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <aside className="potPanel" aria-label="상금 현황">
          <div className="moneyBill" aria-hidden="true">
            <span>만원</span>
            <strong>10,000</strong>
            <em>원</em>
          </div>
          <p className="sectionLabel">누적 금액</p>
          <h2>{formatWon(summary.totalPot)}</h2>
          <dl>
            <div>
              <dt>현재 경기</dt>
              <dd>{selectedMatch.order}회차</dd>
            </div>
            <div>
              <dt>이월금</dt>
              <dd>{formatWon(summary.carryIn)}</dd>
            </div>
            <div>
              <dt>투표지</dt>
              <dd>{selectedTickets.length}장</dd>
            </div>
          </dl>
          {finalReserve > 0 ? (
            <div className="reserveBox">
              <span>미당첨 적립금</span>
              <strong>{formatWon(finalReserve)}</strong>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="resultArea" aria-label="결과 입력과 확인">
        <form className="resultForm" onSubmit={handleResultSubmit}>
          <div className="resultHeader">
            <p>결과 입력</p>
          </div>
          <div className="resultControls">
            <div className="resultInputs">
              <label>
                <span>대한민국</span>
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => setResultKoreaScore(event.target.value)}
                  type="number"
                  value={resultKoreaScore}
                />
              </label>
              <b>:</b>
              <label>
                <span>{selectedMatch.opponent}</span>
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => setResultOpponentScore(event.target.value)}
                  type="number"
                  value={resultOpponentScore}
                />
              </label>
            </div>
            <button className="primaryButton" type="submit">
              결과 확인
            </button>
          </div>
          {resultError ? <p className="formError">{resultError}</p> : null}
        </form>

        {summary.result ? (
          <div className="winnerBoard">
            <div className="winnerHeader">
              <div>
                <p className="sectionLabel">당첨 결과</p>
                <h2>
                  {summary.result.koreaScore} : {summary.result.opponentScore}
                </h2>
              </div>
              {summary.winners.length > 0 ? (
                <strong>{summary.winners.length}명 당첨</strong>
              ) : (
                <strong>당첨 없음</strong>
              )}
            </div>

            {summary.winners.length > 0 ? (
              <>
                <div className="winnerGrid">
                  {summary.winners.map((winner) => (
                    <article className="winnerNote" key={winner.id}>
                      <span className="winnerStamp">당첨</span>
                      <p>{winner.name}</p>
                      <strong>
                        {winner.koreaScore} : {winner.opponentScore}
                      </strong>
                      <em>예상 수령 {formatWon(summary.share)}</em>
                    </article>
                  ))}
                </div>
                {summary.remainder > 0 ? (
                  <p className="remainderText">
                    남은 {formatWon(summary.remainder)}은 운영자가 정산
                  </p>
                ) : null}
              </>
            ) : (
              <div className="noWinner">
                <strong>{formatWon(summary.totalPot)}</strong>
                <span>
                  {selectedMatch.order === MATCHES.length
                    ? "미당첨 적립금으로 남음"
                    : "다음 경기로 이월"}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <div className="resetRow resetArea">
        <button className="ghostButton" onClick={handleResetMatch} type="button">
          현재 경기 초기화
        </button>
        <button className="dangerButton" onClick={handleResetAll} type="button">
          전체 초기화
        </button>
      </div>
    </main>
  );
}

export default App;
