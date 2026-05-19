import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { createPortal } from 'react-dom';
import { Toaster } from '@/components/ui/sonner';

import RoutesComponent from './app.tsx';
import './index.css';

const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md">
      <h2 className="text-xl font-bold text-red-600 mb-2">出错了</h2>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
      >
        重试
      </button>
    </div>
  </div>
);

const MainApp = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <RoutesComponent />
        {createPortal(<Toaster />, document.body)}
      </ErrorBoundary>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);
