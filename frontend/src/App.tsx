import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ApproverQueue } from "@/pages/ApproverQueue";
import { ClaimantDashboard } from "@/pages/ClaimantDashboard";
import { FinanceExport } from "@/pages/FinanceExport";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute allowedRoles={["CLAIMANT"]} />}>
        <Route path="/claims" element={<ClaimantDashboard />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["APPROVER"]} />}>
        <Route path="/approvals" element={<ApproverQueue />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["FINANCE"]} />}>
        <Route path="/finance" element={<FinanceExport />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
