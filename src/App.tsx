import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, ApiError, getToken, setToken, forgetToken } from "./api";
import { dict, Lang } from "./i18n";
import { CaseScreen } from "./CaseScreen";
import { ROOM_CODE_RE } from "../shared/text";
import { token } from "./judgeStyle";

const hashCode = () => location.hash.replace("#", "").toUpperCase();

export function App() {
  const [code, setCode] = useState(hashCode());
  const [lang, setLang] = useState<Lang>((localStorage.getItem("cc:lang") as Lang) || (navigator.language.startsWith("id") ? "id" : "en"));
  useEffect(() => { const f = () => setCode(hashCode()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => { localStorage.setItem("cc:lang", lang); document.documentElement.lang = lang; }, [lang]);
  const go = (c: string) => { location.hash = c; setCode(c); };

  return (
    <div className="app">
      {code && ROOM_CODE_RE.test(code)
        ? <CaseRoute code={code} lang={lang} onHome={() => { history.replaceState(null, "", "/"); setCode(""); }} />
        : <Home lang={lang} setLang={setLang} onEnter={go} />}
    </div>
  );
}

function Home({ lang, setLang, onEnter }: { lang: Lang; setLang: (l: Lang) => void; onEnter: (c: string) => void }) {
  const t = dict(lang);
  const [name, setName] = useState(localStorage.getItem("cc:name") ?? "");
  const [joinCode, setJoinCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const remember = () => localStorage.setItem("cc:name", name);

  async function create() {
    setBusy(true); setErr(""); remember();
    try { const r = await api.create(name, lang); setToken(r.code, r.token); onEnter(r.code); }
    catch { setErr(t.errBody); } finally { setBusy(false); }
  }
  function joinNow() { remember(); if (ROOM_CODE_RE.test(joinCode.toUpperCase())) onEnter(joinCode.toUpperCase()); else setErr(t.notFound); }

  return (
    <main className="screen center">
      <button className="lang" onClick={() => setLang(lang === "en" ? "id" : "en")}>{t.langName}</button>
      <div className="home-mark" aria-hidden="true">CC</div>
      <h1>Couple Court</h1>
      <p className="muted">{t.tagline}</p>
      <div className="home-card">
        <input className="field" placeholder={t.yourName} maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={busy} onClick={create}>{t.openCase}</button>
        <div className="or">· · ·</div>
        <div className="row">
          <input className="field code" placeholder={t.codePh} maxLength={4} value={joinCode} autoCapitalize="characters"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
          <button className="btn dark" onClick={joinNow}>{t.joinCase}</button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
      <p className="tiny">{t.fun}<br />{t.privacy}</p>
    </main>
  );
}

/** Decides: do we have a token for this code? If not, show the join form. */
function CaseRoute({ code, lang, onHome }: { code: string; lang: Lang; onHome: () => void }) {
  const [has, setHas] = useState(!!getToken(code));
  const t = dict(lang);
  const [name, setName] = useState(localStorage.getItem("cc:name") ?? "");
  const [err, setErr] = useState("");
  if (has) return <CaseScreen code={code} onHome={onHome} onLost={() => { forgetToken(code); setHas(false); }} />;
  async function join() {
    localStorage.setItem("cc:name", name);
    try { const r = await api.join(code, name); setToken(code, r.token); setHas(true); }
    catch (e) { setErr(e instanceof ApiError && e.status === 409 ? t.full : t.notFound); }
  }
  return (
    <main className="screen center">
      <h2>{t.joinCase}</h2>
      <div className="codebox">{code}</div>
      <input className="field" placeholder={t.yourName} maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn primary" onClick={join}>{t.join}</button>
      {err && <p className="err">{err}</p>}
      <button className="link" onClick={onHome}>{t.home}</button>
    </main>
  );
}

export function QR({ text }: { text: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: 220, color: { dark: token("--ink"), light: token("--white") } }).then(setSrc); }, [text]);
  return src ? <img className="qr" src={src} alt="QR" width={160} height={160} /> : null;
}
