import { Configuration, PublicClientApplication } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "44941984-f57a-4d77-afda-6ffa79e262c1",
    authority: "https://login.microsoftonline.com/372752f4-b131-4c36-a887-25c96537640c",
    redirectUri: window.location.origin, // Must match Azure AD configured redirect URI
  },
  cache: {
    cacheLocation: "localStorage", // Changed to localStorage to share auth state across popup and main window
  },
};

// Add the scopes required for reading and writing files to OneDrive/SharePoint
export const loginRequest = {
  scopes: ["User.Read", "Files.ReadWrite.All"]
};

export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Creates a fresh PublicClientApplication instance to bypass stale in-memory cache
 * and force reloading accounts from localStorage (which is updated by the popup).
 */
export async function getFreshGraphToken(): Promise<string> {
  const pca = new PublicClientApplication(msalConfig);
  await pca.initialize();
  
  const accounts = pca.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error("No Microsoft accounts found in cache. Please authenticate.");
  }
  
  const activeAccount = pca.getActiveAccount() || accounts[0];
  if (!activeAccount) {
    throw new Error("No active Microsoft account found.");
  }
  
  // Call acquireTokenSilent on the fresh instance with loaded localStorage cache
  const response = await pca.acquireTokenSilent({
    ...loginRequest,
    account: activeAccount
  });
  
  return response.accessToken;
}

/**
 * Checks if there is an active MSAL account by initializing a fresh instance
 */
export async function hasActiveMsalAccount(): Promise<boolean> {
  try {
    const pca = new PublicClientApplication(msalConfig);
    await pca.initialize();
    return pca.getAllAccounts().length > 0;
  } catch (e) {
    return false;
  }
}

