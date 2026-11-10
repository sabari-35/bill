import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import CreateGroup from './pages/CreateGroup';
import GroupMembers from './pages/GroupMembers';
import CreateSession from './pages/CreateSession';
import SessionWorkspace from './pages/SessionWorkspace';
import GuestSessionView from './pages/GuestSessionView';
import JoinBill from './pages/JoinBill';
import Analytics from './pages/Analytics';
import NotFound from './pages/NotFound';

function App() {
  return (
    <div className="min-h-screen bg-background text-text-main font-sans selection:bg-primary selection:text-white">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* Groups */}
        <Route path="/groups/new" element={<CreateGroup />} />
        <Route path="/groups/:groupId" element={<GroupMembers />} />
        <Route path="/groups/:groupId/members" element={<GroupMembers />} />
        
        {/* Sessions & Bill Splitting */}
        <Route path="/sessions/new" element={<CreateSession />} />
        <Route path="/sessions/:sessionId" element={<SessionWorkspace />} />
        <Route path="/sessions/:sessionId/view" element={<GuestSessionView />} />
        
        {/* Analytics & Settlements */}
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settlements" element={<Analytics />} />

        {/* Guest Join & Fallback */}
        <Route path="/join" element={<JoinBill />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default App;
