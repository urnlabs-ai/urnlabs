import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App.tsx';
import '@urnlabs/ui/styles/globals.css';
import './index.css';
// Create a client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: (failureCount, error) => {
                if (error?.status === 404)
                    return false;
                return failureCount < 3;
            },
        },
    },
});
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false}/>
    </QueryClientProvider>
  </React.StrictMode>);
//# sourceMappingURL=main.js.map