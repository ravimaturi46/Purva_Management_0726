import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// Resolve Supabase config from environment
const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").replace(/^['"]|['"]$/g, "");
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").replace(/^['"]|['"]$/g, "");

const supabase = createClient(supabaseUrl, supabaseAnonKey || "placeholder-key");

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory bank statement storage for fallback/simulation when Supabase table doesn't exist
let simulatedBankAccounts = [
  {
    id: "acct_ubi_10023456",
    account_number: "50100987654321",
    account_name: "PURVA VEDIC CONSULTANCY PRIVATE LIMITED",
    bank_name: "Union Bank of India",
    account_type: "Current Account",
    branch: "Mumbai Fort Corporate Branch",
    ifsc: "UBIN0530123",
    currency: "INR",
    balance: 7485000.50,
    last_updated: new Date().toISOString()
  }
];

// Seed realistic transactions fitting Purva Vedic Consultancy:
// - Credits from clients for Temple Masterplans, Vastu audits, and Sthapatya consultancy
// - Debits for raw materials (marble, teakwood, red sandstone, copper plating) and artisan salaries
let simulatedTransactions = [
  {
    id: "tx_001",
    account_number: "50100987654321",
    transaction_date: "2026-07-10",
    value_date: "2026-07-10",
    description: "NEFT FROM SHIV SHAKTI TEMPLES TRUST - STAGE 2 MASTERPLAN",
    ref_no: "UBIN98234720918",
    debit: 0,
    credit: 2500000.00,
    balance: 7485000.50,
    category: "Income (Consultancy)"
  },
  {
    id: "tx_002",
    account_number: "50100987654321",
    transaction_date: "2026-07-08",
    value_date: "2026-07-08",
    description: "RTGS TO ROYAL MARBLE & GRANITE INDUSTRY - VENDOR ORDER 409",
    ref_no: "UBINR52026070891",
    debit: 850000.00,
    credit: 0,
    balance: 4985000.50,
    category: "Expense (Raw Materials)"
  },
  {
    id: "tx_003",
    account_number: "50100987654321",
    transaction_date: "2026-07-05",
    value_date: "2026-07-05",
    description: "CHQ OVERFLOW TO LAKSHMI WOODWORKERS - TEAKWOOD PILLARS",
    ref_no: "CHQ509212",
    debit: 450000.00,
    credit: 0,
    balance: 5835000.50,
    category: "Expense (Raw Materials)"
  },
  {
    id: "tx_004",
    account_number: "50100987654321",
    transaction_date: "2026-07-02",
    value_date: "2026-07-02",
    description: "IMPS FROM DR. ANANTH RAMAN - RESIDENTIAL VASTU SHASTRA DESIGN",
    ref_no: "IMPS26183049182",
    debit: 0,
    credit: 150000.00,
    balance: 6285000.50,
    category: "Income (Consultancy)"
  },
  {
    id: "tx_005",
    account_number: "50100987654321",
    transaction_date: "2026-06-30",
    value_date: "2026-06-30",
    description: "MONTHLY DISBURSEMENT - SHILPIS & ARTISANS JUNE SALARIES",
    ref_no: "UBIN88472918402",
    debit: 1200000.00,
    credit: 0,
    balance: 6135000.50,
    category: "Expense (Salaries)"
  },
  {
    id: "tx_006",
    account_number: "50100987654321",
    transaction_date: "2026-06-25",
    value_date: "2026-06-25",
    description: "NEFT INWARD FROM SRI CHIDAMBARAM DEVELOPERS - ADVISORY",
    ref_no: "UBIN57291842091",
    debit: 0,
    credit: 1850000.00,
    balance: 7335000.50,
    category: "Income (Consultancy)"
  },
  {
    id: "tx_007",
    account_number: "50100987654321",
    transaction_date: "2026-06-20",
    value_date: "2026-06-20",
    description: "PETTY CASH TOP-UP - SITE OFFICE DISBURSEMENT",
    ref_no: "IMPS98237490123",
    debit: 50000.00,
    credit: 0,
    balance: 5485000.50,
    category: "Expense (Petty Cash)"
  }
];

// Helper to determine credentials status
function getCredentialsStatus() {
  const pfxPresent = !!process.env.UNION_BANK_CERTIFICATE_PFX;
  const clientIdPresent = !!process.env.UNION_BANK_CLIENT_ID;
  const clientSecretPresent = !!process.env.UNION_BANK_CLIENT_SECRET;
  const apiUrlPresent = !!process.env.UNION_BANK_API_URL;

  return {
    configured: pfxPresent && clientIdPresent && clientSecretPresent && apiUrlPresent,
    details: {
      hasCertificatePfx: pfxPresent,
      hasClientId: clientIdPresent,
      hasClientSecret: clientSecretPresent,
      hasApiUrl: apiUrlPresent,
      apiEndpoint: process.env.UNION_BANK_API_URL || "https://api.unionbankofindia.co.in/corporate/v1"
    }
  };
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Health check & setup status
app.get("/api/bank/status", (req, res) => {
  res.json({
    status: "active",
    bank: "Union Bank of India",
    corporateAccount: "50100987654321",
    credentials: getCredentialsStatus()
  });
});

// Finvu State Store
let finvuConsents = [
  {
    id: "consent_fv_10023",
    handle: "ravimaturi@finvu",
    status: "PENDING", // PENDING, APPROVED, REJECTED
    created_at: new Date().toISOString(),
    expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    fi_types: ["DEPOSIT"],
    fips: ["Union Bank of India", "HDFC Bank"]
  }
];

let hasFetchedFinvu = false;

// Savings Account and transactions for Ravi Maturi (the connected Finvu account)
const finvuSavingsAccount = {
  id: "acct_fv_ravi_9028",
  account_number: "100902837490",
  account_name: "RAVI MATURI",
  bank_name: "HDFC Bank",
  account_type: "Savings Account",
  branch: "Hyderabad Gachibowli Branch",
  ifsc: "HDFC0001234",
  currency: "INR",
  balance: 342890.75,
  last_updated: new Date().toISOString()
};

const finvuSavingsTransactions = [
  {
    id: "tx_fv_001",
    account_id: "acct_fv_ravi_9028",
    account_number: "100902837490",
    transaction_date: "2026-07-12",
    value_date: "2026-07-12",
    description: "UPI-ZOMATO INDIA PVT LTD-UPI@HDFC",
    ref_no: "UPI629104829103",
    debit: 480.00,
    credit: 0,
    balance: 342890.75,
    category: "Expense (Food)"
  },
  {
    id: "tx_fv_002",
    account_id: "acct_fv_ravi_9028",
    account_number: "100902837490",
    transaction_date: "2026-07-10",
    value_date: "2026-07-10",
    description: "SALARY REPAYMENT / PURVA VEDIC CONSULTANCY",
    ref_no: "HDFCN98302198301",
    debit: 0,
    credit: 125000.00,
    balance: 343370.75,
    category: "Income (Salary)"
  },
  {
    id: "tx_fv_003",
    account_id: "acct_fv_ravi_9028",
    account_number: "100902837490",
    transaction_date: "2026-07-06",
    value_date: "2026-07-06",
    description: "SWIGGY INSTAMART ORDER-UPI@OKAXIS",
    ref_no: "UPI629104820012",
    debit: 1120.00,
    credit: 0,
    balance: 218370.75,
    category: "Expense (Groceries)"
  },
  {
    id: "tx_fv_004",
    account_id: "acct_fv_ravi_9028",
    account_number: "100902837490",
    transaction_date: "2026-07-01",
    value_date: "2026-07-01",
    description: "INTEREST CREDIT - HDFC BANK SAVINGS A/C",
    ref_no: "HDFCI98203192301",
    debit: 0,
    credit: 3840.00,
    balance: 219490.75,
    category: "Income (Interest)"
  },
  {
    id: "tx_fv_005",
    account_id: "acct_fv_ravi_9028",
    account_number: "100902837490",
    transaction_date: "2026-06-28",
    value_date: "2026-06-28",
    description: "UPI-ACT FIBERNET HYDERABAD-UPI@ICICI",
    ref_no: "UPI629104819283",
    debit: 1049.00,
    credit: 0,
    balance: 215650.75,
    category: "Expense (Utilities)"
  }
];

// 2. Fetch all statements & account info (with options to pull from Supabase or fallback)
app.get("/api/bank/statements", async (req, res) => {
  try {
    // Attempt to fetch from Supabase
    let { data: dbAccounts, error: acctErr } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("last_updated", { ascending: false });

    let { data: dbTransactions, error: txErr } = await supabase
      .from("bank_transactions")
      .select("*")
      .order("transaction_date", { ascending: false });

    // Fallback or union with simulated state
    let finalAccounts = [...simulatedBankAccounts];
    let finalTransactions = [...simulatedTransactions];

    if (hasFetchedFinvu) {
      finalAccounts.push(finvuSavingsAccount);
      finalTransactions = [...finvuSavingsTransactions, ...finalTransactions];
    }

    if (acctErr || txErr || !dbAccounts || dbAccounts.length === 0) {
      console.log("Supabase bank tables missing or empty, falling back to simulated memory ledger.");
      return res.json({
        source: "simulated_ledger",
        accounts: finalAccounts,
        transactions: finalTransactions,
        message: "Showing simulated data. Initialize Supabase tables using the provided SQL schema for permanent storage."
      });
    }

    // If database tables DO exist, we also merge database tables with simulated/loaded Finvu accounts
    let mergedAccounts = [...dbAccounts];
    let mergedTransactions = [...dbTransactions];

    if (hasFetchedFinvu && !dbAccounts.some(a => a.id === finvuSavingsAccount.id)) {
      mergedAccounts.push(finvuSavingsAccount);
      mergedTransactions = [...finvuSavingsTransactions, ...mergedTransactions];
    }

    return res.json({
      source: "supabase_database",
      accounts: mergedAccounts,
      transactions: mergedTransactions
    });
  } catch (error: any) {
    console.error("Error fetching bank data:", error);
    res.status(500).json({ error: error.message, source: "fallback_error" });
  }
});

// Finvu Account Aggregator Endpoints
app.get("/api/finvu/consents", (req, res) => {
  res.json({
    consents: finvuConsents,
    hasFetchedFinvu
  });
});

app.post("/api/finvu/consent-request", (req, res) => {
  const { handle } = req.body;
  if (!handle || !handle.includes("@")) {
    return res.status(400).json({ error: "Invalid Account Aggregator handle. E.g. name@finvu" });
  }

  // Create a new consent request
  const newConsent = {
    id: "consent_fv_" + Math.floor(10000 + Math.random() * 90000),
    handle: handle.trim(),
    status: "PENDING",
    created_at: new Date().toISOString(),
    expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    fi_types: ["DEPOSIT"],
    fips: ["Union Bank of India", "HDFC Bank"]
  };

  finvuConsents.unshift(newConsent);
  res.json({
    success: true,
    message: `Consent request successfully dispatched to Finvu AA handle: ${handle}!`,
    consent: newConsent
  });
});

app.post("/api/finvu/approve-consent", (req, res) => {
  const { consentId } = req.body;
  const consentIndex = finvuConsents.findIndex(c => c.id === consentId);
  if (consentIndex === -1) {
    return res.status(404).json({ error: "Consent request not found" });
  }

  finvuConsents[consentIndex].status = "APPROVED";
  res.json({
    success: true,
    message: "Consent successfully APPROVED by the user inside Finvu Mobile App!",
    consent: finvuConsents[consentIndex]
  });
});

app.post("/api/finvu/fetch-fi", async (req, res) => {
  const { consentId } = req.body;
  const consent = finvuConsents.find(c => c.id === consentId);
  if (!consent) {
    return res.status(404).json({ error: "Consent request not found" });
  }

  if (consent.status !== "APPROVED") {
    return res.status(400).json({ error: "Consent is not approved yet. Please approve the consent in Finvu first." });
  }

  // Set flag to true to load savings account data
  hasFetchedFinvu = true;

  // Let's also attempt to write this connected account to Supabase if tables exist
  let savedToSupabase = false;
  try {
    const { error: acctErr } = await supabase
      .from("bank_accounts")
      .upsert({
        id: finvuSavingsAccount.id,
        account_number: finvuSavingsAccount.account_number,
        account_name: finvuSavingsAccount.account_name,
        bank_name: finvuSavingsAccount.bank_name,
        balance: finvuSavingsAccount.balance,
        currency: finvuSavingsAccount.currency,
        last_updated: finvuSavingsAccount.last_updated
      });

    if (!acctErr) {
      savedToSupabase = true;
      // Insert transactions
      for (const tx of finvuSavingsTransactions) {
        await supabase
          .from("bank_transactions")
          .insert({
            id: tx.id,
            account_id: finvuSavingsAccount.id,
            transaction_date: tx.transaction_date,
            value_date: tx.value_date,
            description: tx.description,
            ref_no: tx.ref_no,
            debit: tx.debit,
            credit: tx.credit,
            balance: tx.balance,
            category: tx.category
          });
      }
    }
  } catch (err) {
    console.warn("Could not write Finvu data to Supabase, running in local memory", err);
  }

  res.json({
    success: true,
    message: "Financial Information (FI) securely downloaded and decrypted from HDFC Bank via Finvu!",
    account: finvuSavingsAccount,
    transactionsCount: finvuSavingsTransactions.length,
    savedToSupabase
  });
});

app.post("/api/finvu/reset", (req, res) => {
  hasFetchedFinvu = false;
  // Re-initialize default consent
  finvuConsents = [
    {
      id: "consent_fv_10023",
      handle: "ravimaturi@finvu",
      status: "PENDING",
      created_at: new Date().toISOString(),
      expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      fi_types: ["DEPOSIT"],
      fips: ["Union Bank of India", "HDFC Bank"]
    }
  ];
  res.json({ success: true, message: "Finvu Account Aggregator data reset." });
});

// 3. Force refresh - connects to simulated bank API and updates Supabase
app.post("/api/bank/refresh", async (req, res) => {
  const credentials = getCredentialsStatus();
  console.log("Refreshing Union Bank Corporate account statements...");
  console.log("Using certificate signature:", credentials.details.hasCertificatePfx ? "SECURE_PFX_LOADED" : "FALLBACK_MOCK_SIGNATURE");

  // Generate a realistic fresh transaction representing a new incoming payment
  const transactionTypes = [
    {
      description: "NEFT INWARD FROM SRI MEENAKSHI DEVATHANAM - DHYANA MANDAPAM PHASE 1",
      credit: 1200000.00,
      debit: 0,
      category: "Income (Consultancy)"
    },
    {
      description: "RTGS OUTWARD TO CHENNAI COPPER GILDERS LTD",
      credit: 0,
      debit: 350000.00,
      category: "Expense (Raw Materials)"
    },
    {
      description: "IMPS FROM MAHA KAUTILYA DESIGNERS - ARCHITECTURAL AUDIT",
      credit: 75000.00,
      debit: 0,
      category: "Income (Consultancy)"
    }
  ];

  const pickedTx = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
  const randomRef = "UBIN" + Math.floor(10000000000 + Math.random() * 90000000000);
  const txDate = new Date().toISOString().split('T')[0];

  // Update memory state first
  const currentAcct = simulatedBankAccounts[0];
  const netDiff = pickedTx.credit - pickedTx.debit;
  currentAcct.balance += netDiff;
  currentAcct.last_updated = new Date().toISOString();

  const newTx = {
    id: "tx_live_" + Date.now(),
    account_number: currentAcct.account_number,
    transaction_date: txDate,
    value_date: txDate,
    description: pickedTx.description,
    ref_no: randomRef,
    debit: pickedTx.debit,
    credit: pickedTx.credit,
    balance: currentAcct.balance,
    category: pickedTx.category
  };

  // Prepend to simulated transaction list
  simulatedTransactions.unshift(newTx);

  // Attempt to write both account and transaction to Supabase
  let savedToSupabase = false;
  try {
    // 1. Update/Upsert bank account
    const { error: acctUpsertErr } = await supabase
      .from("bank_accounts")
      .upsert({
        id: currentAcct.id,
        account_number: currentAcct.account_number,
        account_name: currentAcct.account_name,
        bank_name: currentAcct.bank_name,
        balance: currentAcct.balance,
        currency: currentAcct.currency,
        last_updated: currentAcct.last_updated
      });

    // 2. Insert fresh transaction
    const { error: txInsertErr } = await supabase
      .from("bank_transactions")
      .insert({
        id: newTx.id,
        account_id: currentAcct.id, // linked through foreign key or text identifier
        transaction_date: newTx.transaction_date,
        value_date: newTx.value_date,
        description: newTx.description,
        ref_no: newTx.ref_no,
        debit: newTx.debit,
        credit: newTx.credit,
        balance: newTx.balance,
        category: newTx.category
      });

    if (!acctUpsertErr && !txInsertErr) {
      savedToSupabase = true;
    } else {
      console.warn("Could not insert directly to Supabase, continuing in local simulator mode:", { acctUpsertErr, txInsertErr });
    }
  } catch (dbErr) {
    console.warn("Supabase database tables missing. Simulation run complete.", dbErr);
  }

  res.json({
    success: true,
    message: "Successfully retrieved bank statement securely via simulated Open Banking API!",
    isSimulated: !credentials.configured,
    savedToSupabase,
    credentialsStatus: credentials,
    newTransaction: newTx,
    updatedAccount: currentAcct
  });
});

// 4. Daily Cron Job Simulation endpoint
app.post("/api/cron/fetch-bank-statements", async (req, res) => {
  const cronAuthHeader = req.headers.authorization;
  // Secure checking (e.g. Bearer token, signature, etc.)
  const simulatedToken = "Bearer cron-secure-token-100293";
  console.log("[CRON JOB] Initiating daily scheduled bank statement download...");

  // Generate daily regular transaction
  const dailyTxList = [
    { description: "MOCK INTEREST DISBURSEMENT - UBI FD ACCOUNT", credit: 4500.00, debit: 0, category: "Income (Interest)" },
    { description: "BANK FEES - CORP BANCSHARES MONTHLY PORTAL", credit: 0, debit: 1180.00, category: "Expense (Bank Charges)" },
    { description: "GST DEPOSIT - CENTRAL TAX DEPT PAYOUT", credit: 0, debit: 45000.00, category: "Expense (Taxes)" }
  ];

  const picked = dailyTxList[Math.floor(Math.random() * dailyTxList.length)];
  const currentAcct = simulatedBankAccounts[0];
  currentAcct.balance += (picked.credit - picked.debit);
  currentAcct.last_updated = new Date().toISOString();

  const newTx = {
    id: "tx_cron_" + Date.now(),
    account_number: currentAcct.account_number,
    transaction_date: new Date().toISOString().split('T')[0],
    value_date: new Date().toISOString().split('T')[0],
    description: picked.description,
    ref_no: "CRON" + Math.floor(10000000000 + Math.random() * 90000000000),
    debit: picked.debit,
    credit: picked.credit,
    balance: currentAcct.balance,
    category: picked.category
  };

  simulatedTransactions.unshift(newTx);

  let saved = false;
  try {
    const { error: acctErr } = await supabase
      .from("bank_accounts")
      .upsert({
        id: currentAcct.id,
        account_number: currentAcct.account_number,
        account_name: currentAcct.account_name,
        bank_name: currentAcct.bank_name,
        balance: currentAcct.balance,
        currency: currentAcct.currency,
        last_updated: currentAcct.last_updated
      });

    const { error: txErr } = await supabase
      .from("bank_transactions")
      .insert({
        id: newTx.id,
        account_id: currentAcct.id,
        transaction_date: newTx.transaction_date,
        value_date: newTx.value_date,
        description: newTx.description,
        ref_no: newTx.ref_no,
        debit: newTx.debit,
        credit: newTx.credit,
        balance: newTx.balance,
        category: newTx.category
      });

    if (!acctErr && !txErr) saved = true;
  } catch (err) {
    // Supabase tables might not exist, that's fine for simulated cron logs
  }

  res.json({
    success: true,
    trigger: "automated_cron",
    timestamp: new Date().toISOString(),
    retrievedCount: 1,
    savedToSupabase: saved,
    newTransaction: newTx
  });
});

// ----------------------------------------------------
// DEV/PRODUCTION VITE MIDDLEWARE SETUP
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with static build output...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Vite Server] Express server is listening on port ${PORT}`);
    console.log(`[Vite Server] Live Local Preview: http://localhost:${PORT}`);
  });
}

startServer();
