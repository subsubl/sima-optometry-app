import React, { useEffect, useState } from 'react';
import { useExamSync } from './hooks/useExamSync';
import { DoctorControllerView } from './views/DoctorControllerView';
import { PatientDisplayView } from './views/PatientDisplayView';

type ScreenRole = 'doctor' | 'patient';

function detectInitialRole(): ScreenRole {
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  if (hash.includes('patient') || search.includes('role=patient')) {
    return 'patient';
  }
  return 'doctor';
}

export const App: React.FC = () => {
  const [role, setRole] = useState<ScreenRole>(detectInitialRole);
  const {
    state,
    updateState,
    randomizeOptotypes,
    resetSession,
    isConnected,
    networkInfo,
  } = useExamSync();

  useEffect(() => {
    const onHashChange = () => {
      setRole(detectInitialRole());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const switchRole = (target: ScreenRole) => {
    window.location.hash = `#/${target}`;
    setRole(target);
  };

  if (role === 'patient') {
    return (
      <PatientDisplayView
        state={state}
        updateState={updateState}
        randomizeOptotypes={randomizeOptotypes}
        onSwitchToDoctor={() => switchRole('doctor')}
      />
    );
  }

  return (
    <DoctorControllerView
      state={state}
      updateState={updateState}
      randomizeOptotypes={randomizeOptotypes}
      resetSession={resetSession}
      isConnected={isConnected}
      networkInfo={networkInfo}
      onOpenPatientView={() => switchRole('patient')}
    />
  );
};
