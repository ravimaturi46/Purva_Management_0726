import { PublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";
import { loginRequest } from "./msalConfig";

// Keys used in localStorage
const TOKEN_KEY = "microsoft_graph_token";
const TOKEN_EXPIRES_KEY = "microsoft_graph_token_expires";
const ACCOUNT_KEY = "microsoft_graph_account";

export interface StoredMSALAccount {
  homeAccountId: string;
  environment: string;
  tenantId: string;
  username: string;
  localAccountId: string;
  name: string;
}

// Save token and account details to localStorage
export function saveMsalSession(account: any, token: string, expiresOnTimestamp: number | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresOnTimestamp) {
      localStorage.setItem(TOKEN_EXPIRES_KEY, expiresOnTimestamp.toString());
    } else {
      // Default to 1 hour if no expiry given
      localStorage.setItem(TOKEN_EXPIRES_KEY, (Date.now() + 3500 * 1000).toString());
    }
  }
  if (account) {
    const simplifiedAccount: StoredMSALAccount = {
      homeAccountId: account.homeAccountId,
      environment: account.environment || 'login.microsoftonline.com',
      tenantId: account.tenantId || account.realm || '',
      username: account.username,
      localAccountId: account.localAccountId || account.homeAccountId,
      name: account.name || account.username.split('@')[0],
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(simplifiedAccount));
  }
}

// Clear session
export function clearMsalSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

// Get stored account
export function getStoredMsalAccount(): StoredMSALAccount | null {
  try {
    const item = localStorage.getItem(ACCOUNT_KEY);
    if (item) {
      return JSON.parse(item);
    }
  } catch (e) {
    console.error("Error reading stored MSAL account:", e);
  }
  return null;
}

// Search localStorage specifically for our tenant account to avoid false-positives
export function getMSALAccountFromStorage(): StoredMSALAccount | null {
  const targetTenantId = "372752f4-b131-4c36-a887-25c96537640c";
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('-account-') || key.includes('.accounts.'))) {
      try {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && parsed.homeAccountId && parsed.username) {
            const realm = parsed.realm || '';
            const homeAccountId = parsed.homeAccountId || '';
            // Ensure the tenant ID matches our specific tenant ID to prevent false-positives from other apps on the same domain
            if (realm === targetTenantId || homeAccountId.includes(targetTenantId)) {
              return {
                homeAccountId: parsed.homeAccountId,
                environment: parsed.environment || 'login.microsoftonline.com',
                tenantId: parsed.realm || targetTenantId,
                username: parsed.username,
                localAccountId: parsed.localAccountId || parsed.homeAccountId,
                name: parsed.name || parsed.username.split('@')[0],
              };
            }
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }
  return null;
}

// Get valid stored token
export function getStoredMsalToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiresStr = localStorage.getItem(TOKEN_EXPIRES_KEY);
  if (token && expiresStr) {
    const expires = parseInt(expiresStr, 10);
    // Add 1-minute buffer
    if (expires > Date.now() + 60 * 1000) {
      return token;
    }
  }
  return null;
}

// Helper to get active MSAL account
export function getActiveMsalAccount(instance: any): AccountInfo | null {
  // First try active account
  let active = instance.getActiveAccount();
  if (active) return active;

  // Then try list of accounts
  const accounts = instance.getAllAccounts();
  if (accounts.length > 0) {
    instance.setActiveAccount(accounts[0]);
    return accounts[0];
  }

  // Then try stored simplified account
  const stored = getStoredMsalAccount() || getMSALAccountFromStorage();
  if (stored) {
    // Construct a pseudo-AccountInfo
    const pseudoAccount: any = {
      homeAccountId: stored.homeAccountId,
      environment: stored.environment,
      tenantId: stored.tenantId,
      username: stored.username,
      localAccountId: stored.localAccountId,
      name: stored.name,
    };
    instance.setActiveAccount(pseudoAccount);
    return pseudoAccount;
  }

  return null;
}

// Main helper to get the Graph API access token
export async function getGraphAccessToken(instance: any): Promise<string> {
  // 1. Check if we already have a valid cached token in localStorage
  const cachedToken = getStoredMsalToken();
  if (cachedToken) {
    return cachedToken;
  }

  // 2. Try to resolve the active account
  const activeAccount = getActiveMsalAccount(instance);
  if (!activeAccount) {
    throw new Error("No Microsoft account is currently authenticated. Please connect your account.");
  }

  // 3. Try to acquire token silently
  try {
    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account: activeAccount
    });
    
    // Save to cache
    const expiresOn = response.expiresOn ? response.expiresOn.getTime() : null;
    saveMsalSession(response.account, response.accessToken, expiresOn);
    
    return response.accessToken;
  } catch (e) {
    console.warn("Silent token acquisition failed, checking if we can use existing stored token anyway:", e);
    // Only return cached token if it is actually still valid according to our expiration checks
    const cachedToken = getStoredMsalToken();
    if (cachedToken) {
      return cachedToken;
    }
    
    // If token is truly expired or silent acquisition failed, we must clear the session to allow re-login and throw
    clearMsalSession();
    throw new Error("Microsoft login session has expired. Please connect your account again.");
  }
}

// Get initialized Graph Client
export async function getGraphClientInstance(instance: any): Promise<Client> {
  const token = await getGraphAccessToken(instance);
  return Client.init({
    authProvider: (done) => {
      done(null, token);
    }
  });
}
