// Supabase Edge Function: send-push-notification
// Location: supabase/functions/send-push-notification/index.ts
// Serves as the Web Push dispatch server utilizing VAPID protocol with web-push

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import webpush from "https://esm.sh/web-push@3.6.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys missing in Edge Function secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();

    // The webhook payload or direct invocation provides notification row details
    // body.record usually contains the inserted notification row from Database Webhook
    const record = body.record || body;
    const targetUserId = record.user_id;
    const title = record.title || "New Notification";
    const message = record.message || "";

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "No target user_id provided." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query active push subscriptions for target user from user_push_subscriptions table
    const { data: subscriptions, error: subError } = await supabase
      .from("user_push_subscriptions")
      .select("*")
      .eq("user_id", targetUserId);

    if (subError) {
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found for target user." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({
      id: record.id || `notif_${Date.now()}`,
      title,
      body: message,
      icon: "/notification-icon.svg",
      tag: record.id || `notif_${Date.now()}`,
      url: "/"
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        return { endpoint: sub.endpoint, status: "success" };
      } catch (err: any) {
        console.error(`Failed to push to endpoint ${sub.endpoint}:`, err);
        // If subscription is expired (410 or 404), purge it from database
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase
            .from("user_push_subscriptions")
            .delete()
            .eq("id", sub.id);
        }
        return { endpoint: sub.endpoint, status: "failed", error: err.message };
      }
    });

    const results = await Promise.all(sendPromises);

    return new Response(
      JSON.stringify({ success: true, count: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-push-notification edge function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
