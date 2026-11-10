import { Navigate, useLocation } from 'react-router';

export function SubmissionStatusRedirect() {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname: '/status-pengajuan', search, hash }} state={state} replace />;
}
