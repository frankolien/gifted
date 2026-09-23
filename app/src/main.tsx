import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { AppProvider } from './state';
import { App } from './App';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 3000, retry: 2, refetchOnWindowFocus: true } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AppProvider><App /></AppProvider>
    </QueryClientProvider>
  </StrictMode>,
);
