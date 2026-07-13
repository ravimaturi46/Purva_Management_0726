import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './lib/msalConfig';
import App from './App.tsx';
import './index.css';

// Initialize the MSAL instance before rendering
msalInstance.initialize().then(() => {
  // Always call handleRedirectPromise to process the hash in the popup window
  // When inside a popup, this will parse the hash, send it to the main window, and close the popup.
  msalInstance.handleRedirectPromise().catch(err => {
    console.error("MSAL handleRedirectPromise error:", err);
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
});
