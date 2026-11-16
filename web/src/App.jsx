import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store.js';
import Auth from './pages/Auth.jsx';
import Main from './pages/Main.jsx';
import Admin from './pages/Admin.jsx';
import { LockScreen } from './components/Lock.jsx';

export default function App() {
  const me = useStore((s) => s.me);
  const booted = useStore((s) => s.booted);
  const boot = useStore((s) => s.boot);
  useEffect(() => {
    boot();
    const onLogout = () => useStore.getState().logout();
    window.addEventListener('recidivist:logout', onLogout);
    return () => window.removeEventListener('recidivist:logout', onLogout);
  }, [boot]);

  if (!booted) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!me) return <Auth />;
  return (
    <>
      <Routes>
        <Route path="/admin/*" element={me.isAdmin ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Main />} />
      </Routes>
      <LockScreen />
    </>
  );
}
