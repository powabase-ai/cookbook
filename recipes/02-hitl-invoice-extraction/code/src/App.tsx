import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import QueueList from "./pages/QueueList";
import QueueDetail from "./pages/QueueDetail";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/queue" replace />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route
          path="/queue"
          element={
            <ProtectedRoute>
              <QueueList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/queue/:id"
          element={
            <ProtectedRoute>
              <QueueDetail />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
