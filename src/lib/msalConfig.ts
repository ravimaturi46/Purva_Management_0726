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
