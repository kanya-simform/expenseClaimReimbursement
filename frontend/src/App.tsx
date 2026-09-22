import { Navigate, Route, Routes } from "react-router-dom";
import { ApproverQueue } from "@/pages/ApproverQueue";
import { ClaimantDashboard } from "@/pages/ClaimantDashboard";
import { FinanceExport } from "@/pages/FinanceExport";
import { LoginPage } from "@/pages/LoginPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/claims" element={<ClaimantDashboard />} />
      <Route path="/approvals" element={<ApproverQueue />} />
      <Route path="/finance" element={<FinanceExport />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
