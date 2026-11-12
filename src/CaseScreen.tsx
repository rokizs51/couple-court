import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, CaseView, clockOffset } from "./api";
import { dict, Dict } from "./i18n";
import { JUDGES, JUDGE_IDS, JudgeId, JudgePick } from "../shared/judges";
import { MAX_STATEMENT } from "../shared/text";
import { JudgeAvatar } from "./components/JudgeAvatar";
import { QR } from "./App";
import { shareVerdictCard } from "./shareCard";

const serverNow = () => Date.now() + clockOffset;

function useCountdown(target: number | null) {
  const [, tick] = useState(0);
  useEffect(() => { if (!target) return; const i = setInterval(() => tick((n) => n + 1), 200); return () => clearInterval(i); }, [target]);
  return target ? Math.max(0, target - serverNow()) : 0;
}

export function CaseScreen({ code, onHome, onLost }: { code: string; onHome: () => void; onLost: () => void }) {
  const [cv, setCv] = useState<CaseView | null>(null);
  const [fatal, setFatal] = useState<"notFound" | null>(null);
  const [offline, setOffline] = useState(false);
  const alive = useRef(true);
  const lang = cv?.lang ?? (localStorage.getItem("cc:lang") as "en" | "id") ?? "en";
  const t = dict(lang);

  const poll = useCallback(async () => {
    try { const v = await api.get(code); if (alive.current) { setCv(v); setOffline(false); } }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { onLost(); return; }
      if (e instanceof ApiError && e.status === 404) { setFatal("notFound"); return; }
      setOffline(true); // network blip: keep polling, keep the screen
    }
  }, [code, onLost]);

  useEffect(() => {
    alive.current = true; let timer: any;
    const loop = async () => { if (fatal) return; await poll(); timer = setTimeout(loop, 2500); };
    loop();
    const vis = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive.current = false; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
  }, [poll, fatal]);

  const act = async (fn: () => Promise<CaseView>) => { try { setCv(await fn()); } catch { await poll(); } };

  if (fatal) return <Msg t={t} text={t.notFound} onHome={onHome} />;
  if (!cv) return <main className="screen center"><p className="muted">{t.loading}</p></main>;

  return (
    <main className="screen">
      {offline && <div className="offline">Offline, retrying...</div>}
      <div className="topbar"><button className="link" onClick={onHome}>{t.home}</button><span className="pill">{code}</span></div>
      {cv.state === "waiting_for_partner" && <Waiting cv={cv} t={t} />}
      {cv.state === "judge_vote" && <Vote cv={cv} t={t} onVote={(p) => act(() => api.vote(code, p))} />}
      {cv.state === "drafting" && <Draft cv={cv} t={t} onSubmit={(txt, ap) => act(() => api.statement(code, txt, ap))} />}
      {cv.state === "judging" && <Judging cv={cv} t={t} />}
      {cv.state === "judge_error" && (
        <div className="card center"><h2>{t.errTitle}</h2><p className="muted">{cv.error === "cap" ? t.errCap : t.errBody}</p>
          {cv.error !== "cap" && <button className="btn primary" onClick={() => act(() => api.retry(code))}>{t.tryAgain}</button>}</div>
      )}
      {cv.state === "verdict" && <Verdict cv={cv} t={t} onAppeal={() => act(() => api.appeal(code))} onHome={onHome} />}
      {cv.state === "safety" && <Safety t={t} onHome={onHome} />}
      <p className="tiny">{t.fun}</p>
    </main>
  );
}

function Msg({ t, text, onHome }: { t: Dict; text: string; onHome: () => void }) {
  return <main className="screen center"><p>{text}</p><button className="btn" onClick={onHome}>{t.home}</button></main>;
}

function Waiting({ cv, t }: { cv: CaseView; t: Dict }) {
  const link = `${location.origin}/#${cv.code}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (
    <div className="card center">
      <p className="muted">{t.shareCode}</p>
      <div className="codebox big">{cv.code}</div>
      <button className="btn dark" onClick={copy}>{copied ? t.copied : t.copyLink}</button>
      <QR text={link} /><p className="tiny">{t.scanQr}</p>
      <p className="pulse">{t.waiting}</p>
    </div>
  );
}

const VOTE_MS = 30_000;
const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function Vote({ cv, t, onVote }: { cv: CaseView; t: Dict; onVote: (p: JudgePick) => void }) {
  const left = useCountdown(cv.vote.deadline);
  const mine = cv.vote.myPick;
  const [sel, setSel] = useState<JudgePick | null>(null);
  const chosen = mine ?? sel; // a locked vote is final; before locking the player can change their mind
  const tag = (id: JudgeId) => (cv.lang === "id" ? JUDGES[id].taglineId : JUDGES[id].tagline);
  const pct = cv.vote.deadline ? Math.min(100, (left / VOTE_MS) * 100) : 100;
  const card = (id: JudgePick, name: string, line: string) => (
    <button key={id} type="button" disabled={!!mine} aria-pressed={chosen === id}
      className={"vcard" + (chosen === id ? " sel" : "") + (id === "surprise" ? " dashed" : "")} onClick={() => setSel(id)}>
      <JudgeAvatar judge={id} size={44} />
      <b>{name}</b><small>{line}</small>
    </button>
  );
  return (
    <div className="vote-screen">
      <p className="eyebrow">{t.step1}</p>
      <h2 className="vtitle">{t.whoHears}</h2>
      <p className="vsub">{t.pickSub}</p>
      <div className="vgrid">
        {JUDGE_IDS.map((id) => card(id, JUDGES[id].name, tag(id)))}
        {card("surprise", t.surprise, t.surpriseTag)}
      </div>
      <div className="vfoot">
        {mine && <p className="vsub pulse">{t.lockedIn}</p>}
        <div className="vtimer">
          <div className="vbar" role="progressbar" aria-valuemin={0} aria-valuemax={30} aria-valuenow={Math.ceil(left / 1000)}><i style={{ width: pct + "%" }} /></div>
          <span>{mmss(left)} {t.left}</span>
        </div>
        <button type="button" className="vbtn" disabled={!sel || !!mine} onClick={() => sel && onVote(sel)}>{t.lockIn}</button>
      </div>
    </div>
  );
}

function Draft({ cv, t, onSubmit }: { cv: CaseView; t: Dict; onSubmit: (txt: string, ap: boolean) => void }) {
  const round = cv.rounds[cv.rounds.length - 1];
  const dkey = `cc:draft:${cv.code}:${cv.appealCount}`;
  const [text, setText] = useState(() => localStorage.getItem(dkey) ?? "");
  const [apology, setApology] = useState(false);
  const mine = round.statements.me;
  const j = cv.judgeId!;
  useEffect(() => { localStorage.setItem(dkey, text); }, [text, dkey]); // drafts survive locked phone / app switch
  const submit = () => { onSubmit(text, apology); localStorage.removeItem(dkey); };
  return (
    <div className="screen-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="eyebrow">{t.step2}</p>
      <div className="judgebar">
        <JudgeAvatar judge={j} size={44} />
        <div><small>{t.judgeIs}</small><b>{JUDGES[j].name}</b></div>
      </div>
      {cv.coinFlip && <p className="muted">{t.coin}</p>}
      {cv.appealCount > 0 && <p className="pill warn">{t.appealCount} {cv.appealCount} {t.of} 3</p>}
      {mine ? (
        <div className="card center"><h3>{t.filed}</h3><p className="pulse">{t.waitOther}</p></div>
      ) : (
        <>
          <h2>{t.fileStatement}</h2>
          <p className="muted">{t.privateNote}. {t.stmtHelp}</p>
          {round.otherSubmitted && <p className="pill ok">{t.otherDone}</p>}
          <textarea className="field area" maxLength={MAX_STATEMENT} placeholder={t.stmtPh} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="stmt-meta"><span className="saved">{t.saved}</span><span className="count">{text.length}/{MAX_STATEMENT} {t.chars}</span></div>
          <label className="check"><input type="checkbox" checked={apology} onChange={(e) => setApology(e.target.checked)} /> {t.apology}</label>
          <button className="btn primary" disabled={!text.trim()} onClick={submit}>{t.submit}</button>
        </>
      )}
    </div>
  );
}

function Judging({ cv, t }: { cv: CaseView; t: Dict }) {
  const j = cv.judgeId!;
  return <div className="card center"><div className="spin"><JudgeAvatar judge={j} size={64} /></div><h2>{t.judging}</h2><p className="muted">{JUDGES[j].name}</p></div>;
}

function Verdict({ cv, t, onAppeal, onHome }: { cv: CaseView; t: Dict; onAppeal: () => void; onHome: () => void }) {
  const idx = cv.rounds.length - 1;
  const r = cv.rounds[idx];
  const v = r.verdict!;
  const j = cv.judgeId!;
  const left = useCountdown(r.revealAt);
  const revealed = serverNow() >= r.revealAt; // both phones flip at the same server instant
  const me = cv.me;
  const myFault = me === "a" ? v.fault_split!.a : v.fault_split!.b;
  const otherFault = 100 - myFault;
  const nameA = me === "a" ? cv.players.me : cv.players.other ?? "?";
  const nameB = me === "a" ? cv.players.other ?? "?" : cv.players.me;
  const mine = me === "a" ? { note: v.notes!.a, sent: v.sentence!.a } : { note: v.notes!.b, sent: v.sentence!.b };
  const theirs = me === "a" ? { note: v.notes!.b, sent: v.sentence!.b } : { note: v.notes!.a, sent: v.sentence!.a };

  if (!revealed) {
    return (
      <div className="card center">
        <JudgeAvatar judge={j} size={64} /><h2>{t.allRise}</h2>
        <p className="muted">{t.gavelIn}</p><div className="countdown">{Math.max(1, Math.ceil(left / 1000))}</div>
      </div>
    );
  }
  return (
    <div className="verdict">
      {idx === 0 && <p className="eyebrow">{t.step3}</p>}
      <div className="judgebar">
        <JudgeAvatar judge={j} size={44} />
        <div><b>{JUDGES[j].name}</b>
          <div className="mood"><span>{t.mood}: {t.moods[r.mood]}</span>
            <div className="meter" aria-hidden="true">{[0, 1, 2, 3].map((n) => <i key={n} className={n <= r.mood ? "on" : ""} />)}</div></div></div>
      </div>
      <p className="quote d1">“{v.opening_line}”</p>
      <h3 className="d2">{t.faultSplit}</h3>
      <div className="d2">
        <div className="splitbar"><i className="a" style={{ width: `${v.fault_split!.a}%` }}>{v.fault_split!.a}%</i><i className="b" style={{ width: `${v.fault_split!.b}%` }}>{v.fault_split!.b}%</i></div>
        <div className="splitl"><span>{nameA}</span><span>{nameB}</span></div>
      </div>
      <div className="grid2 d3">
        <div className="card note"><b>{t.you} · {myFault}%</b><p>{mine.note}</p></div>
        <div className="card note"><b>{cv.players.other} · {otherFault}%</b><p>{theirs.note}</p></div>
      </div>
      <h3 className="d4">{t.ruling}</h3><p className="ruling d4">{v.ruling}</p>
      <h3 className="d5">{t.sentence}</h3>
      <div className="grid2 d5">
        <div className="card sentence"><b>{t.you}</b><p>{mine.sent}</p></div>
        <div className="card sentence"><b>{cv.players.other}</b><p>{theirs.sent}</p></div>
      </div>
      <p className="quote d6">“{v.closing_line}”</p>
      <div className="actions d6">
        {cv.canAppeal ? <button className="btn primary" onClick={onAppeal}>{t.appeal} ({cv.appealCount}/3)</button> : <p className="pill warn">{t.appealFinal}</p>}
        <button className="btn" onClick={() => shareVerdictCard({ judgeId: j, judge: JUDGES[j].name, v, nameA, nameB, mood: t.moods[r.mood] })}>{t.share}</button>
        <button className="link" onClick={onHome}>{t.newCase}</button>
      </div>
    </div>
  );
}

function Safety({ t, onHome }: { t: Dict; onHome: () => void }) {
  // Calm and plain on purpose: no game styling, no emoji, no verdict.
  return (
    <div className="safety"><h2>{t.safetyTitle}</h2><p>{t.safetyBody}</p><p>{t.safetyHelp}</p>
      <button className="btn" onClick={onHome}>{t.safetyEnd}</button></div>
  );
}
