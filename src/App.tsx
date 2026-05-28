import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/auth/store';
import LoginPage from '@/pages/LoginPage';
import LobbyPage from '@/pages/LobbyPage';
import ProfilePage from '@/pages/ProfilePage';
import RoomPage from '@/pages/RoomPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><LobbyPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/room/:id" element={<RequireAuth><RoomPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
