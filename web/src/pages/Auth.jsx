import { useMemo, useRef, useState } from 'react';
import { ShieldAlert, Copy, Eye, ArrowLeft, Mail, KeyRound, Check } from 'lucide-react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { newMnemonic, isValidMnemonic, deriveAuthKey, normalizeMnemonic } from '../seed.js';

function Logo() {
  return (
    <div className="auth-logo">
      <svg width="64" height="64" viewBox="0 0 512 512"><path d="M170 110h110c70 0 115 38 115 99 0 45-24 77-64 92l78 101h-80l-67-92h-25v92h-67zm67 56v86h42c31 0 48-15 48-43s-17-43-48-43z" fill="#fff" /></svg>
    </div>
  );
}

function SeedInputs({ words, setWords }) {
  const refs = useRef([]);
  const onChange = (i, v) => {
    const parts = v.trim().toLowerCase().split(/\s+/);
    if (parts.length > 1) {
      const next = [...words];
      parts.slice(0, 12 - i).forEach((p, k) => (next[i + k] = p));
      setWords(next);
      refs.current[Math.min(11, i + parts.length)]?.focus();
      return;
    }
    const next = [...words];
    next[i] = v.toLowerCase().replace(/\s/g, '');
    setWords(next);
    if (v.endsWith(' ')) refs.current[i + 1]?.focus();
  };
  return (
    <div className="seed-grid">
      {words.map((w, i) => (
        <label className="seed-word" key={i}>
          <i>{i + 1}</i>
          <input ref={(el) => (refs.current[i] = el)} value={w} onChange={(e) => onChange(i, e.target.value)} autoCapitalize="off" autoComplete="off" spellCheck={false} />
        </label>
      ))}
    </div>
  );
}

export default function Auth() {
  const login = useStore((s) => s.login);
  const [mode, setMode] = useState('welcome');
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailToken, setEmailToken] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checkAnswers, setCheckAnswers] = useState({});
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [loginWords, setLoginWords] = useState(Array(12).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devHint, setDevHint] = useState(false);

  const words = mnemonic.split(' ');
  const checkIdx = useMemo(() => {
    const s = new Set();
    while (s.size < 3) s.add(Math.floor(Math.random() * 12));
    return [...s].sort((a, b) => a - b);
  }, [mnemonic]);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const r = await api('/auth/send-code', { body: { email } });
      setDevHint(r.devMode);
      setStep('code');
    });
  const verifyCode = () =>
    run(async () => {
      const r = await api('/auth/verify-code', { body: { email, code } });
      setEmailToken(r.emailToken);
      setMnemonic(newMnemonic());
      setStep('seed');
    });
  const checkSeed = () => {
    const ok = checkIdx.every((i) => (checkAnswers[i] || '').trim().toLowerCase() === words[i]);
    if (!ok) return setError('Слова не совпадают. Проверьте записанную фразу.');
    setError('');
    setStep('profile');
  };
  const register = () =>
    run(async () => {
      const authKey = await deriveAuthKey(mnemonic);
      const r = await api('/auth/register', { body: { emailToken, authKey, displayName: name, username: username || undefined } });
      login(r.token, r.user);
    });
  const doLogin = () =>
    run(async () => {
      const phrase = normalizeMnemonic(loginWords.join(' '));
      if (!isValidMnemonic(phrase)) throw new Error('Неверная сид-фраза: проверьте слова и их порядок');
      const authKey = await deriveAuthKey(phrase);
      const r = await api('/auth/login', { body: { authKey } });
      login(r.token, r.user);
    });

  const back = (to) => (
    <button className="icon-btn" style={{ alignSelf: 'flex-start', marginBottom: -8 }} onClick={() => { setError(''); to(); }}>
      <ArrowLeft size={22} />
    </button>
  );

  const err = error && <div className="error-text" style={{ textAlign: 'center' }}>{error}</div>;

  if (mode === 'welcome') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Logo />
          <h1>Recidivist</h1>
          <p className="lead">Быстрый и безопасный мессенджер. Ваш аккаунт защищён сид-фразой — как криптокошелёк.</p>
          <div style={{ height: 12 }} />
          <button className="btn block" onClick={() => { setMode('register'); setStep('email'); }}>Создать аккаунт</button>
          <button className="btn secondary block" onClick={() => setMode('login')}>
            <KeyRound size={18} /> Войти по сид-фразе
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'login') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          {back(() => setMode('welcome'))}
          <h1>Вход</h1>
          <p className="lead">Введите 12 слов вашей сид-фразы. Можно вставить фразу целиком в первое поле.</p>
          <SeedInputs words={loginWords} setWords={setLoginWords} />
          {err}
          <button className="btn block" disabled={busy || loginWords.some((w) => !w)} onClick={doLogin}>
            {busy ? 'Проверяем…' : 'Войти'}
          </button>
          <div className="warn-box">
            <ShieldAlert size={18} />
            <span>Сид-фраза не отправляется на сервер: из неё на устройстве вычисляется ключ входа.</span>
          </div>
        </div>
      </div>
    );
  }

  // ----- registration -----
  return (
    <div className="auth-page">
      <div className="auth-card">
        {step === 'email' && (
          <>
            {back(() => setMode('welcome'))}
            <h1>Ваша почта</h1>
            <p className="lead">Мы отправим код подтверждения.</p>
            <div className="field">
              <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendCode()} autoFocus />
            </div>
            {err}
            <button className="btn block" disabled={busy || !email} onClick={sendCode}>
              <Mail size={18} /> {busy ? 'Отправляем…' : 'Получить код'}
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            {back(() => setStep('email'))}
            <h1>Код из письма</h1>
            <p className="lead">Отправили 6-значный код на <b style={{ color: 'var(--text)' }}>{email}</b></p>
            <input className="input" style={{ textAlign: 'center', fontSize: '1.6em', letterSpacing: '.4em', fontWeight: 700, height: 60 }} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verifyCode()} autoFocus placeholder="••••••" />
            {devHint && <div className="hint" style={{ textAlign: 'center' }}>Режим разработки: SMTP не настроен, код выведен в консоль сервера.</div>}
            {err}
            <button className="btn block" disabled={busy || code.length !== 6} onClick={verifyCode}>Подтвердить</button>
            <button className="btn ghost block" disabled={busy} onClick={sendCode}>Отправить код ещё раз</button>
          </>
        )}

        {step === 'seed' && (
          <>
            <h1>Сид-фраза</h1>
            <p className="lead">Запишите эти 12 слов по порядку и храните в надёжном месте. Это <b style={{ color: 'var(--text)' }}>единственный</b> способ войти в аккаунт.</p>
            <div className={`seed-grid ${revealed ? '' : 'seed-blur'}`} onClick={() => setRevealed(true)}>
              {words.map((w, i) => (
                <div className="seed-word" key={i}><i>{i + 1}</i>{w}</div>
              ))}
            </div>
            {!revealed ? (
              <button className="btn secondary block" onClick={() => setRevealed(true)}><Eye size={18} /> Показать фразу</button>
            ) : (
              <button className="btn secondary block" onClick={() => navigator.clipboard?.writeText(mnemonic)}><Copy size={18} /> Скопировать</button>
            )}
            <div className="warn-box">
              <ShieldAlert size={18} />
              <span>Никому не показывайте фразу. Администрация Recidivist никогда её не спросит. Потеряете фразу — потеряете аккаунт.</span>
            </div>
            <label className="row" style={{ cursor: 'pointer' }} onClick={() => setSaved(!saved)}>
              <span className={`check ${saved ? 'on' : ''}`}>{saved && <Check size={14} />}</span>
              <span className="small">Я записал(а) сид-фразу</span>
            </label>
            <button className="btn block" disabled={!saved || !revealed} onClick={() => { setCheckAnswers({}); setStep('check'); }}>Продолжить</button>
          </>
        )}

        {step === 'check' && (
          <>
            {back(() => setStep('seed'))}
            <h1>Проверка</h1>
            <p className="lead">Введите слова под указанными номерами.</p>
            {checkIdx.map((i) => (
              <div className="field" key={i}>
                <label>Слово №{i + 1}</label>
                <input className="input" value={checkAnswers[i] || ''} onChange={(e) => setCheckAnswers({ ...checkAnswers, [i]: e.target.value })} autoCapitalize="off" autoComplete="off" />
              </div>
            ))}
            {err}
            <button className="btn block" onClick={checkSeed}>Проверить</button>
          </>
        )}

        {step === 'profile' && (
          <>
            <h1>Профиль</h1>
            <p className="lead">Как вас будут видеть другие.</p>
            <div className="field">
              <label>Имя</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} autoFocus />
            </div>
            <div className="field">
              <label>Юзернейм (необязательно)</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="username" maxLength={32} />
              <span className="hint">Юзернеймы — коллекционные: их можно продавать и покупать на маркете.</span>
            </div>
            {err}
            <button className="btn block" disabled={busy || !name.trim()} onClick={register}>{busy ? 'Создаём…' : 'Создать аккаунт'}</button>
          </>
        )}
      </div>
    </div>
  );
}
